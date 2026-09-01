# deeqsipay

A mobile-first fundraising platform. Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase · Sifalo Pay (mobile money).

## Getting started

```bash
pnpm install
cp .env.example .env.local   # then fill it in
pnpm dev
```

### 1. Supabase

Create a project, then run the migration:

```bash
supabase db push
# or paste supabase/migrations/0001_init.sql into the SQL editor
```

It creates `profiles`, `campaigns`, `donations`, `payment_attempts`, `webhook_events`,
`saved_campaigns`, the `credit_donation()` function, and all RLS policies.

Fill in from **Project Settings → API**:

Two credentials, three lines:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL — safe in the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key — safe in the browser; RLS is what protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key — bypasses RLS. Server only, never prefix with `NEXT_PUBLIC_` |

Under **Authentication → Providers**, enable Email. If you leave "Confirm email" on,
sign-up will not return a session; see the note in `app/login/page.tsx`.

### 2. Sifalo Pay

| Variable | Value |
|---|---|
| `SIFALO_API_BASE_URL` | Payments API base URL |
| `SIFALO_USERNAME` | Sifalo username |
| `SIFALO_API_KEY` | Sifalo API key |
| `SIFALO_WEBHOOK_SECRET` | Optional — see below |

Sent as HTTP Basic (`username:apiKey`). If Sifalo expects the pair as two separate
headers instead, `authHeaders()` in `lib/server/sifalo.ts` is the only place to change.

Point the provider's webhook at `POST /api/webhooks/sifalo`. It has two trust modes:

- **`SIFALO_WEBHOOK_SECRET` set** — callbacks are verified by HMAC-SHA256 over the raw
  body, sent hex-encoded in `x-sifalo-signature`. Preferred.
- **Left blank** — the callback body is treated as an untrusted hint. Only the payment
  reference is taken from it, and the real status is fetched from Sifalo's API before
  anything is credited. Costs one extra API call per callback and is safe: forging a
  donation would mean forging Sifalo's own API response.

There is no third mode where an unsigned body is believed on its own.

## Architecture

**Money is always integer minor units.** Never floats, never `/100` outside `formatMoney`.

**Payments are asynchronous.** `POST /api/donations` returns `pending`; the payer approves
on their handset; the webhook settles it. The client polls `GET /api/donations/:id`.
`credit_donation()` is idempotent and is the only thing that may move `raised_minor` —
it is called from both the donation route and the webhook, and either may arrive first.

**Two Supabase clients.** `createAdminClient()` (service role, bypasses RLS) is confined to
`lib/server/` and API routes. Public page reads go through `lib/server/campaigns.ts` on the
anon client so RLS applies. Browser code never talks to Supabase for data — only for auth —
and reaches the API through `authedFetch`, which attaches the Bearer token.

**RLS gates rows, not columns.** Column-level grants at the end of the migration are what
stop a campaign owner from writing their own `raised_minor`.

## Scripts

```bash
pnpm dev        # dev server
pnpm build      # production build (type errors fail the build)
pnpm typecheck  # tsc --noEmit
pnpm lint       # eslint (flat config; `tools/` is excluded)
pnpm test       # vitest — pure unit tests, no database needed
pnpm test:db    # pgTAP against the real migrations; needs `supabase start` first
```

`pnpm test:db` runs `supabase/tests/*.sql` — currently `credit_donation()` idempotency and
the `request_payout()` reservation guard. Both are money functions where a regression is
silent, so they run in CI on every push (`.github/workflows/ci.yml`).

## Deploy (Vercel)

The repo is a plain Next.js app — no custom build command, no output directory to set.
Import it into Vercel and the framework preset does the rest. What Vercel cannot infer:

**1. Environment variables.** Set these in Project Settings → Environment Variables, for
Production *and* Preview. `.env.example` is the full list; these are the ones without which
the app is broken rather than merely degraded:

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | all | Safe in the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | all | Safe in the browser; RLS is the protection |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Bypasses RLS — never prefix `NEXT_PUBLIC_` |
| `SIFALO_API_USER` / `SIFALO_API_KEY` | server | Without these, donations cannot be charged |
| `CRON_SECRET` | server | Vercel sends it as `Authorization: Bearer` to the cron route |

Point Preview at a **separate Supabase project**. A preview deployment shares nothing with
production except the code, and a preview build wired to the production database will write
real donations from test traffic.

`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` are
optional; leave them unset and the SDK stays inert and the build still succeeds.

**2. Database.** Migrations are not applied by the build. Run `supabase db push` against the
production project before the first deploy, and again for any deploy that adds a file to
`supabase/migrations/`.

**3. Cron.** `vercel.json` schedules `/api/cron/reconcile-donations` every 15 minutes. That
cadence requires a **paid plan** — Hobby allows one cron invocation per day, and Vercel will
silently run it daily instead. Either upgrade the project or change the schedule to match
the plan, then confirm in Project → Cron Jobs that the recorded schedule is what you wrote.

**4. Before the first production deploy.** Rotate the Supabase keys — see *Still to do*
below. The service-role key that was committed to `.env.example` is in this repo's git
history, so it must be treated as public the moment the repo is pushed anywhere.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, a production build and the
pgTAP suite on every push, using placeholder credentials. A green CI run is the signal that
a commit is deployable.

## Operations

- **Payout & correction runbook:** `docs/payout-runbook.md`. Money leaves the platform by
  hand — Sifalo has no disbursement or refund API — so that file is the procedure, and
  `/how-payouts-work` is the public promise it keeps. Change one, change both.
- **No refunds.** Donations are gifts and are not returned on request: there is no
  donor-facing refund form and no refund queue. `refund_donation()` and the admin control on
  `/admin/transactions` survive as a break-glass correction for fraud, double charges and
  campaigns removed before payout — see the runbook. The ledger keeps `refund` as an entry
  kind and `refunded` as a donation status so past reversals stay readable; `ledger_entries`
  is append-only and that history cannot be rewritten.
- **Reconciliation cron:** scheduled in `vercel.json`, every 15 minutes. It cannot confirm
  payments; it ages out stale unknowns and reports what needs a person.
- **Error monitoring:** Sentry, inert unless `NEXT_PUBLIC_SENTRY_DSN` is set. Events pass
  through `lib/sentry-scrub.ts` first, which drops request bodies and redacts phone
  numbers, identity-document paths and tokens. Browser events are tunnelled through
  `/monitoring` so the strict CSP needs no Sentry exception.

## Still to do

- **Rotate the Supabase keys that were committed to `.env.example`** — they are no longer in
  the working tree, but they are still in git history, and the service-role key bypasses RLS
  entirely. Rotating them in Supabase is the only thing that actually revokes them. Nothing
  else on this list matters as much.
- No platform fee exists anywhere in the schema or code, so the platform earns nothing
- `request_payout` and `mark_payout_paid` are called with the wrong arity (migration 0005
  re-signed both), and `payout_accounts` has no UI or API at all — so no payout can be
  requested or settled today
- A timed-out Sifalo charge is recorded as `failed` even though the outcome is unknowable;
  it should stay `pending` for the reconcile job (`app/api/donations/route.ts`)
- The guest donation rate limit counts ALL guest donations platform-wide, capping the whole
  site at 8 per minute (`app/api/donations/route.ts`)
- No email or SMS anywhere: donors get no receipt and organisers no notification
- The share button on a campaign page has no handler, and there is no per-campaign OG
  metadata, so a link pasted into WhatsApp shows nothing
- Explore search filters the newest 50 campaigns in memory, by title only
- Campaign `ends_at` is in the schema but nothing sets it
- Organisers cannot edit a campaign after submitting it
- `normaliseAccount()` does not strip a domestic trunk zero, and the donation route's phone
  regex rejects one outright — see the pinned test in `tests/sifalo.test.ts`
- Five components trip `react-hooks/set-state-in-effect`; the rule is a warning until that
  data-fetching refactor is done deliberately
- Generated Supabase types (`supabase gen types typescript`) to remove the `as` casts
  around PostgREST embeds in `lib/campaigns.ts` and `app/api/saved/route.ts`
