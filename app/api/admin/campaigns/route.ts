import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getRole } from '@/lib/server/auth'

// Admin moderation queue: every status is visible here, unlike the public list which is
// pinned to 'active'. Read-only, so moderators are allowed in alongside admins.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const STAFF = new Set(['admin', 'moderator'])
const STATUSES = new Set(['under_review', 'active', 'paused', 'hidden', 'completed', 'rejected', 'removed'])
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

type ProfileRef = { display_name: string | null } | { display_name: string | null }[] | null
type CampaignRow = {
  id: string
  owner_id: string
  title: string
  category: string
  goal_minor: number
  raised_minor: number
  donor_count: number
  currency: string | null
  status: string
  image_url: string | null
  created_at: string
  profiles: ProfileRef
}

const one = (value: ProfileRef) => (Array.isArray(value) ? value[0] ?? null : value)

export async function GET(request: Request) {
  const actor = await getRole(request)
  if (!actor) return json({ error: 'Authentication required' }, 401)
  if (!STAFF.has(actor.role)) return json({ error: 'Forbidden' }, 403)

  const url = new URL(request.url)
  const requested = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const limit = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT
  const offsetRaw = Number(url.searchParams.get('offset') ?? 0)
  const offset = Number.isSafeInteger(offsetRaw) && offsetRaw >= 0 ? Math.min(offsetRaw, 100000) : 0

  const status = url.searchParams.get('status')
  if (status !== null && !STATUSES.has(status)) return json({ error: 'Invalid status filter' }, 400)

  // %, _ and , are PostgREST filter syntax, not user text: stripping them keeps `q` from
  // rewriting the filter it is embedded in.
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80).replace(/[%_,()"'\\*]/g, '')

  let query = createAdminClient()
    .from('campaigns')
    .select('id,owner_id,title,category,goal_minor,raised_minor,donor_count,currency,status,image_url,created_at,profiles!campaigns_owner_id_fkey(display_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
  if (status !== null) query = query.eq('status', status)
  if (q.length > 0) query = query.ilike('title', `%${q}%`)

  const { data, error, count } = await query.range(offset, offset + limit - 1)
  if (error) return json({ error: 'Unable to load campaigns' }, 500)

  const rows = (data ?? []) as unknown as CampaignRow[]
  return json({
    campaigns: rows.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      status: row.status,
      goalMinor: Number(row.goal_minor),
      raisedMinor: Number(row.raised_minor),
      donorCount: Number(row.donor_count),
      currency: row.currency ?? 'USD',
      imageUrl: row.image_url,
      createdAt: row.created_at,
      owner: { id: row.owner_id, displayName: one(row.profiles)?.display_name ?? null },
    })),
    total: count ?? rows.length,
  })
}
