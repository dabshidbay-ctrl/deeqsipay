# kindred

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
```

## Still to do

- Image upload for campaigns (Supabase Storage) — the field is disabled, not faked
- Rate limiting on `POST /api/donations` and `POST /api/campaigns`
- ESLint config and a test suite; no automated tests exist yet
- Generated Supabase types (`supabase gen types typescript`) to remove the `as` casts
  around PostgREST embeds in `lib/campaigns.ts` and `app/api/saved/route.ts`
- Campaign `ends_at` is in the schema but nothing sets it; the UI hides the countdown
  until it does
