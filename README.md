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

| Variable | Value |
|---|---|
| `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key — **server only, never expose** |

Under **Authentication → Providers**, enable Email. If you leave "Confirm email" on,
sign-up will not return a session; see the note in `app/login/page.tsx`.

### 2. Sifalo Pay

| Variable | Value |
|---|---|
| `SIFALO_API_BASE_URL` | Payments API base URL |
| `SIFALO_API_KEY` | Server API key |
| `SIFALO_WEBHOOK_SECRET` | HMAC-SHA256 shared secret |

Point the provider's webhook at `POST /api/webhooks/sifalo`. It must send the
hex HMAC-SHA256 of the raw body in the `x-sifalo-signature` header.

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
