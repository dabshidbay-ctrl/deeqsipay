=== FILE: app/api/campaigns/[id]/route.ts ===
import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'

const categories = new Set(['Medical', 'Emergency', 'Community', 'Nonprofit', 'Education'])
const statuses = new Set(['active', 'paused', 'completed'])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!uuidPattern.test(id)) return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
  const { data, error } = await createAdminClient().from('campaigns').select('id,owner_id,title,description,category,goal_minor,raised_minor,donor_count,currency,status,image_url,ends_at,created_at,profiles!campaigns_owner_id_fkey(display_name,avatar_url)').eq('id', id).eq('status', 'active').maybeSingle()
  if (error) return NextResponse.json({ error: 'Unable to load campaign' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  return NextResponse.json({ campaign: data })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const { id } = await params
  if (!uuidPattern.test(id)) return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
  try {
    const body = await request.json() as { title?: string; description?: string; category?: string; imageUrl?: string | null; status?: string }
    const patch: { title?: string; description?: string; category?: string; image_url?: string | null; status?: string } = {}
    if (body.title !== undefined) {
      const title = body.title.trim()
      if (title.length < 8 || title.length > 120) return NextResponse.json({ error: 'Invalid campaign details' }, { status: 400 })
      patch.title = title
    }
    if (body.description !== undefined) {
      const description = body.description.trim()
      if (description.length < 20 || description.length > 5000) return NextResponse.json({ error: 'Invalid campaign details' }, { status: 400 })
      patch.description = description
    }
    if (body.category !== undefined) {
      if (!categories.has(body.category)) return NextResponse.json({ error: 'Invalid campaign details' }, { status: 400 })
      patch.category = body.category
    }
    if (body.imageUrl !== undefined) {
      if (body.imageUrl !== null && typeof body.imageUrl !== 'string') return NextResponse.json({ error: 'Invalid campaign details' }, { status: 400 })
      patch.image_url = body.imageUrl
    }
    if (body.status !== undefined) {
      if (!statuses.has(body.status)) return NextResponse.json({ error: 'Invalid campaign details' }, { status: 400 })
      patch.status = body.status
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Invalid campaign details' }, { status: 400 })
    const { data, error } = await createAdminClient().from('campaigns').update(patch).eq('id', id).eq('owner_id', user.id).select('id,title,status').maybeSingle()
    if (error) return NextResponse.json({ error: 'Unable to update campaign' }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    return NextResponse.json({ campaign: data })
  } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
}
=== END FILE ===

=== FILE: app/api/donations/[id]/route.ts ===
import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request)
  if (!user) return json({ error: 'Authentication required' }, 401)
  const { id } = await params
  if (!uuidPattern.test(id)) return json({ error: 'Invalid donation id' }, 400)
  const { data, error } = await createAdminClient().from('donations').select('id,status,amount_minor,campaign_id,provider_reference,created_at,donor_id').eq('id', id).maybeSingle()
  if (error) return json({ error: 'Unable to load donation' }, 500)
  if (!data || data.donor_id !== user.id) return json({ error: 'Donation not found' }, 404)
  return json({ donation: { id: data.id, status: data.status, amountMinor: data.amount_minor, campaignId: data.campaign_id, providerReference: data.provider_reference, createdAt: data.created_at } })
}
=== END FILE ===

=== FILE: app/api/saved/route.ts ===
import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type SavedCampaignRow = { campaigns: { id: string; title: string; category: string; goal_minor: number; raised_minor: number; donor_count: number; image_url: string | null } | null }

export async function GET(request: Request) {
  const user = await requireUser(request)
  if (!user) return json({ error: 'Authentication required' }, 401)
  const { data, error } = await createAdminClient().from('saved_campaigns').select('campaigns!saved_campaigns_campaign_id_fkey(id,title,category,goal_minor,raised_minor,donor_count,image_url)').eq('user_id', user.id).order('created_at', { ascending: false })
  if (error) return json({ error: 'Unable to load saved campaigns' }, 500)
  const rows = (data ?? []) as SavedCampaignRow[]
  return json({ campaigns: rows.flatMap((row) => (row.campaigns ? [row.campaigns] : [])) })
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    if (!user) return json({ error: 'Authentication required' }, 401)
    const body = await request.json() as { campaignId?: string }
    if (!body.campaignId || !uuidPattern.test(body.campaignId)) return json({ error: 'Invalid campaign id' }, 400)
    const supabase = createAdminClient()
    const { data: campaign } = await supabase.from('campaigns').select('id').eq('id', body.campaignId).eq('status', 'active').maybeSingle()
    if (!campaign) return json({ error: 'Campaign unavailable' }, 404)
    const { error } = await supabase.from('saved_campaigns').upsert({ user_id: user.id, campaign_id: campaign.id }, { ignoreDuplicates: true })
    if (error) return json({ error: 'Unable to save campaign' }, 500)
    return json({ saved: true })
  } catch { return json({ error: 'Invalid request' }, 400) }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser(request)
    if (!user) return json({ error: 'Authentication required' }, 401)
    const body = await request.json() as { campaignId?: string }
    if (!body.campaignId || !uuidPattern.test(body.campaignId)) return json({ error: 'Invalid campaign id' }, 400)
    const { error } = await createAdminClient().from('saved_campaigns').delete().eq('user_id', user.id).eq('campaign_id', body.campaignId)
    if (error) return json({ error: 'Unable to remove saved campaign' }, 500)
    return json({ saved: false })
  } catch { return json({ error: 'Invalid request' }, 400) }
}
=== END FILE ===

=== NOTES ===
- Embed aliases assume default Postgres FK constraint names (`campaigns_owner_id_fkey`, `saved_campaigns_campaign_id_fkey`); both follow from 0001_init.sql's unnamed foreign keys.
- PATCH validates trimmed title/description lengths (so the DB char_length checks can never reject a valid API payload) and returns 400 for an empty patch; unrecognized body keys are ignored, matching "accept only".
- DELETE /api/saved responds `{ saved: false }` even when no row existed — idempotent unsave.
- GET /api/saved orders by `saved_campaigns.created_at` desc (newest saves first); the ordering column is intentionally omitted from the select.
- Every response from `/api/donations/[id]` (including errors) carries `Cache-Control: no-store`, since any of them could be cached by an intermediary otherwise.
- Ownership checks on donations/campaigns are enforced in-query because the admin client bypasses RLS; non-owner reads return 404 without existence leaks.
=== END NOTES ===