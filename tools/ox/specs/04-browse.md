# TASK: Replace mock campaign data with the real API

Today the frontend is 100% hardcoded. `seededCampaigns` is duplicated in TWO places
(app/page.tsx and components/kindred-shell.tsx) and no client code calls the API.
Kill the mock data and wire the browsing surfaces to Supabase.

@include components/kindred-shell.tsx
@include app/page.tsx
@include app/explore/page.tsx
@include app/campaigns/[id]/page.tsx
@include supabase/migrations/0001_init.sql

## 1. `lib/campaigns.ts` (shared, no 'use client')
```ts
export type Campaign = {
  id: string; title: string; description: string; category: string
  goalMinor: number; raisedMinor: number; donorCount: number; currency: string
  imageUrl: string | null; endsAt: string | null; createdAt: string
  owner: { displayName: string; avatarUrl: string | null } | null
}
```
Plus pure helpers, all exported:
- `formatMoney(minor: number, currency: string): string` — `Intl.NumberFormat` with
  `minimumFractionDigits: 0` when the amount is a whole unit. NEVER hand-roll `/100` formatting.
- `progressPercent(raisedMinor, goalMinor): number` — clamped 0..100, returns 0 if goal <= 0.
- `daysLeft(endsAt: string | null): number | null` — null when `endsAt` is null.
- `initials(name: string): string` — max 2 uppercase letters, `'?'` for an empty name.
- `mapCampaignRow(row: Record<string, unknown>): Campaign` — snake_case DB row → the type above.

## 2. `lib/server/campaigns.ts` (server-only data access)
Use the **anon** client (`createAuthClient` from lib/server/supabase-admin) so RLS applies —
do NOT use the admin client for public reads.
- `listCampaigns(opts?: { category?: string; limit?: number }): Promise<Campaign[]>` —
  active only, newest first, default limit 50. Skip the category filter when it is
  absent or `'For you'`.
- `getCampaign(id: string): Promise<Campaign | null>` — active only, joins the owner profile.
Both return mapped `Campaign` objects and return `[]`/`null` on error (never throw into a page).

## 3. `app/page.tsx` — split into server shell + client feed
Make it an **async server component** that calls `listCampaigns()` and renders
`<HomeFeed campaigns={campaigns} />`. Preserve the existing hero markup exactly
(the "Good morning" eyebrow, "Small acts. / Big ripples." serif headline, the
"Your kindness can start a story" primary panel). Use `PageFrame` from kindred-shell
with `active="home"` instead of the hand-rolled header and nav — the current home page
uses `<button>` elements for navigation, which do not navigate. That is a bug; fix it.
Greet the signed-in user by their display name when available, else "there".

## 4. `components/home-feed.tsx` — `'use client'`
Props: `{ campaigns: Campaign[] }`. Keeps the category pills (`For you`, `Medical`,
`Emergency`, `Nonprofit`, `Education`) filtering client-side over the passed array.
Renders `CampaignCard` for each. Empty state when the filter matches nothing:
a dashed-border panel matching the one at the bottom of app/saved/page.tsx.
Do NOT implement the donation modal here — a later task owns that. Each card just
links to `/campaigns/[id]`.

## 5. `components/kindred-shell.tsx` — MODIFY
- **DELETE `seededCampaigns` entirely.**
- `CampaignCard` now takes `{ campaign: Campaign }` using the real type: real image
  (`imageUrl ?? '/placeholder.jpg'`), `formatMoney` for both amounts, `progressPercent`
  for the bar width, `donorCount` for the donor line, and `daysLeft` — when `endsAt` is
  null render nothing rather than a fake "12 days left".
- Keep every existing class name and the visual structure identical.
- Keep `KindredHeader`, `BottomNav`, `PageFrame` working as they do now.

## 6. `app/explore/page.tsx`
Async server component using `listCampaigns()`. Keep the existing hero. The search box is
currently a dead `<span>` — make it a real `<form action="/explore" method="get">` with a
named `q` input, and have the page filter on `q` (case-insensitive match on title) via
`searchParams`. Next.js 16: `searchParams` is a **Promise**, await it.

## 7. `app/campaigns/[id]/page.tsx`
Async server component. `params` is a Promise — await it. Call `getCampaign(id)` and call
`notFound()` from `next/navigation` when it returns null — the current fallback to
`seededCampaigns[0]` silently shows the wrong campaign for any unknown id.
Render the real description, real owner name and initials, real totals.
Replace the dead `/?donate=<id>` link with a link to `/campaigns/<id>/donate`.
Add `export async function generateMetadata()` returning the campaign title and description.

Do not touch app/create/page.tsx, app/saved/page.tsx, or any file under app/api/.
