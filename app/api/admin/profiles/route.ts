import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getRole } from '@/lib/server/auth'

// Organisers only: a profile appears here because it owns at least one campaign, so the
// listing is derived from campaigns rather than from profiles. That is also why no email
// can leak for a non-organiser — a plain donor is never in this result set at all. Nothing
// on this route selects an email column for anyone; identity is display_name + avatar.
//
// The aggregate is computed in JS because PostgREST cannot GROUP BY. SCAN_LIMIT bounds the
// work; the counts stay exact for any realistic campaign table and the route is staff-only.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const STAFF = new Set(['admin', 'moderator'])
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const SCAN_LIMIT = 5000

type ProfileRef = { display_name: string | null; avatar_url: string | null } | { display_name: string | null; avatar_url: string | null }[] | null
type OwnedRow = { owner_id: string; raised_minor: number; status: string; created_at: string; profiles: ProfileRef }
type Organiser = { id: string; displayName: string | null; avatarUrl: string | null; campaignCount: number; activeCampaignCount: number; totalRaisedMinor: number; firstCampaignAt: string }

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

  const { data, error } = await createAdminClient()
    .from('campaigns')
    .select('owner_id,raised_minor,status,created_at,profiles!campaigns_owner_id_fkey(display_name,avatar_url)')
    .order('created_at', { ascending: true })
    .limit(SCAN_LIMIT)
  if (error) return json({ error: 'Unable to load organisers' }, 500)

  const rows = (data ?? []) as unknown as OwnedRow[]
  const organisers = new Map<string, Organiser>()
  for (const row of rows) {
    const profile = one(row.profiles)
    const existing = organisers.get(row.owner_id) ?? {
      id: row.owner_id,
      displayName: profile?.display_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      campaignCount: 0,
      activeCampaignCount: 0,
      totalRaisedMinor: 0,
      firstCampaignAt: row.created_at,
    }
    existing.campaignCount += 1
    if (row.status === 'active') existing.activeCampaignCount += 1
    existing.totalRaisedMinor += Number(row.raised_minor)
    organisers.set(row.owner_id, existing)
  }

  const all = [...organisers.values()].sort((a, b) => b.totalRaisedMinor - a.totalRaisedMinor)
  return json({ profiles: all.slice(offset, offset + limit), total: all.length })
}
