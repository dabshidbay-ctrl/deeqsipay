# TASK: Missing API endpoints

Existing routes for reference — match their exact style, error shape
(`{ error: string }` + status), and validation rigour:

@include app/api/campaigns/route.ts
@include app/api/donations/route.ts
@include lib/server/supabase-admin.ts

Produce these files:

## 1. `app/api/campaigns/[id]/route.ts`
`GET` — public, no auth. Next.js 16: `params` is a **Promise**, await it.
- Validate `id` is a UUID; 400 if not.
- Select `id,owner_id,title,description,category,goal_minor,raised_minor,donor_count,currency,status,image_url,ends_at,created_at`
  plus the owner via `profiles!campaigns_owner_id_fkey(display_name,avatar_url)`.
- Only return campaigns with `status='active'`; otherwise 404 `{ error: 'Campaign not found' }`.
- Respond `{ campaign }`.

`PATCH` — owner only. Requires `requireUser`; 401 if absent.
- Accept only `title`, `description`, `category`, `imageUrl`, `status`.
- Re-apply the SAME validation bounds as the POST in campaigns/route.ts
  (title 8..120, description 20..5000, category in the allowed set).
- `status` may only be one of `'active' | 'paused' | 'completed'`.
- Scope the update with `.eq('id', id).eq('owner_id', user.id)`; if zero rows come
  back, return 404 — never leak that the campaign exists.

## 2. `app/api/donations/[id]/route.ts`
`GET` — the polling endpoint for async mobile-money confirmation.
- `requireUser`; 401 if absent. Validate UUID.
- Fetch the donation and return 404 unless `donor_id === user.id`.
- Respond `{ donation: { id, status, amountMinor, campaignId, providerReference, createdAt } }`.
- Set header `Cache-Control: no-store`.

## 3. `app/api/saved/route.ts`
All three require `requireUser`; 401 if absent.
- `GET` → the user's saved campaigns joined to campaign fields
  (`id,title,category,goal_minor,raised_minor,donor_count,image_url`), newest first.
  Respond `{ campaigns }` — shape it as a flat array of campaigns, not nested join rows.
- `POST` `{ campaignId }` → validate UUID, verify the campaign exists and is active
  (404 otherwise), then `upsert` into `saved_campaigns` so double-saving is a no-op.
  Respond `{ saved: true }`.
- `DELETE` `{ campaignId }` → remove the row, respond `{ saved: false }`.

## Schema you are writing against
@include supabase/migrations/0001_init.sql
