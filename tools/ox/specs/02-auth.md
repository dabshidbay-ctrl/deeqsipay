# TASK: Supabase auth stack (browser session + login/signup + route protection)

The app currently has NO auth. The API routes below authenticate via an
`Authorization: Bearer <supabase access token>` header. Keep that contract —
do NOT rewrite the API routes.

@include lib/server/supabase-admin.ts
@include components/kindred-shell.tsx

Use `@supabase/ssr` (already installed). Produce these files:

## 1. `lib/supabase/client.ts`
Browser client via `createBrowserClient` reading `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. Export a memoised singleton `getSupabaseBrowserClient()`.

## 2. `lib/supabase/server.ts`
Server component client via `createServerClient` + `cookies()` from `next/headers`.
Next.js 16: `cookies()` is async — `await` it. Export `createSupabaseServerClient()`
and `getSessionUser()` returning the user or null.

## 3. `lib/supabase/session.ts`
Client-side helper `authedFetch(input, init)` that:
- gets the current session from the browser client,
- if there is no session, throws an `AuthRequiredError` (export this class),
- otherwise sets `Authorization: Bearer <access_token>` and `content-type: application/json`,
- parses the JSON response; on a non-2xx it throws an `ApiError` (export it) carrying
  `status` and the server's `error` string.
This is the single chokepoint every client component uses to reach the API.

## 4. `middleware.ts` (repo root)
Refresh the session cookie on every request (standard `@supabase/ssr` middleware
pattern using `createServerClient` with `getAll`/`setAll` cookie handlers).
Protect `/create`, `/profile`, `/saved`, `/settings`, `/notifications`: if no user,
redirect to `/login?next=<original pathname>`.
`config.matcher` must exclude `_next/static`, `_next/image`, `favicon.ico`,
image files, AND `/api/:path*` (the API routes do their own Bearer auth).

## 5. `app/login/page.tsx`
Client component. Email + password, with a toggle between "Sign in" and "Create account"
(`signInWithPassword` / `signUp`). On success `router.push(next ?? '/')` then `router.refresh()`.
Read `next` from `useSearchParams()`. **`useSearchParams()` must be inside a `<Suspense>`
boundary** or the Next build fails — structure the file accordingly.
Show inline error text on failure, disable the button while submitting.
Style it to match the app: centred in the `max-w-[470px]` frame, `font-serif` heading,
existing `.amount-input`, `.confirm-button`, `.eyebrow` classes. Match the tone of the
existing pages ("kindred", warm, lowercase eyebrows).

## 6. `app/auth/signout/route.ts`
POST handler: sign out server-side, redirect to `/`.

## 7. `components/auth-provider.tsx`
Client component exporting `AuthProvider` (wraps children, subscribes to
`onAuthStateChange`, calls `router.refresh()` on SIGNED_IN/SIGNED_OUT) and a
`useAuthUser()` hook returning `{ user, loading }`. Unsubscribe on unmount.

## 8. `components/kindred-shell.tsx` — MODIFY, keep everything else identical
`KindredHeader` currently hardcodes the avatar initials "JD". Make it a client
component that uses `useAuthUser()`: show the user's email initials when signed in,
and a `<Link href="/login">` showing "in" when signed out. Do not change any other
export in that file, and do not change the markup or classes otherwise.
NOTE: `seededCampaigns` and `CampaignCard` stay exactly as they are for now — a later
task removes them. Do not touch them.
