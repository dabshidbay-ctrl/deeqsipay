# TASK: Real donation flow, create-fundraiser form, and persisted saves

These are the three remaining fake interactions. All three must hit real APIs.

@include app/api/donations/route.ts
@include app/create/page.tsx
@include app/saved/page.tsx
@include lib/campaigns.ts

API contracts you are consuming (already implemented — do not modify them):
- `POST /api/donations` body `{ campaignId, amountMinor, phone, idempotencyKey }`
  → 201 `{ donationId, status, providerReference }`; 401/400/404/502 with `{ error }`.
- `GET /api/donations/:id` → `{ donation: { id, status, amountMinor, campaignId, providerReference, createdAt } }`
- `POST /api/campaigns` body `{ title, description, category, goalMinor, imageUrl? }` → 201 `{ campaign }`
- `GET|POST|DELETE /api/saved` — POST/DELETE take `{ campaignId }`.
- All authenticated calls go through `authedFetch` from `lib/supabase/session` (throws
  `AuthRequiredError` when signed out, `ApiError` with `.status` and `.message` otherwise).

## 1. `app/campaigns/[id]/donate/page.tsx`
Server component: await `params`, `getCampaign(id)` from `lib/server/campaigns`,
`notFound()` if null, render `<DonateForm campaign={campaign} />`.

## 2. `components/donate-form.tsx` — `'use client'`
This is the core of the product. Requirements:

**Amount.** Preset buttons 25 / 50 / 100 plus a custom field. Parse the custom input with a
strict decimal regex and convert to **integer minor units** — `Math.round(value * 100)`.
Reject NaN, negatives, more than 2 decimal places, anything under the API's 100-minor
floor or over 1_000_000_000. The current UI accepts the literal string "abc" as an amount;
that must be impossible. Show the validation message inline, disable submit while invalid.

**Phone.** Required — the API rejects the request without it, and the current modal never
collects one. Validate against the same rule the API uses: `/^\+?[1-9]\d{7,14}$/`.
Label it as the mobile money number.

**Idempotency key.** Generate ONCE per form instance with `crypto.randomUUID()` held in a
ref, and regenerate it only after a terminal outcome. Retrying a failed submit must reuse
the same key — that is the whole point of the API's replay check.

**Submit + poll.** Mobile money confirms asynchronously on the payer's handset, so a 201
with `status: 'pending'` is the normal path, not an error. After a pending response, poll
`GET /api/donations/:id` every 3s for up to 2 minutes. Stop on `succeeded`/`failed`/`expired`,
and clear the interval in a `useEffect` cleanup so it cannot leak.

**States**, each with distinct copy in the app's warm voice:
`idle` → `submitting` → `awaiting_confirmation` (tell them to approve the prompt on their
phone) → `succeeded` | `failed` | `expired` | `timeout` (still pending after 2 min — tell
them it may still complete and link to their profile).
On `AuthRequiredError`, redirect to `/login?next=/campaigns/<id>/donate`.

Reuse `.amount-option`, `.amount-active`, `.amount-input`, `.confirm-button`, `.eyebrow`.
Keep the "Mobile money payments secured by Sifalo Pay" reassurance line.

## 3. `app/create/page.tsx` — REWRITE
The form currently discards everything on submit (`setSubmitted(true)`, no state, no
`name` attributes). Make it real:
- Controlled inputs for title / description / category (a `<select>` over the five allowed
  categories) / goal amount.
- Client validation matching the API exactly: title 8..120, description 20..5000,
  goal >= 100 minor units. Convert the goal to minor units the same way as above.
- `POST /api/campaigns` via `authedFetch`; on success `router.push('/campaigns/' + id)`.
- Show server error text inline; disable submit while in flight.
- `AuthRequiredError` → redirect to `/login?next=/create`.
- Keep the existing header and success-panel styling.
- The image upload input is currently a no-op `sr-only` file input. Leave the field visible
  but clearly disabled with the caption "Photo upload coming soon" — do NOT fake an upload.

## 4. `app/saved/page.tsx` + `components/saved-list.tsx`
Saves are currently `useState` that resets on reload, and the page renders a hardcoded
slice of two with a hardcoded "2 saved" count. Replace with a client component that loads
`GET /api/saved` on mount, renders real `CampaignCard`s, shows the real count, has a
loading skeleton and a genuine empty state, and lets the user unsave (DELETE, optimistic,
reverting on failure).

## 5. `components/save-button.tsx` — `'use client'`
Reusable bookmark toggle: props `{ campaignId, initialSaved }`. POST/DELETE `/api/saved`,
optimistic with revert on error, `aria-pressed`, reuses the `.save-button` class.
Signed-out users get sent to `/login`.
