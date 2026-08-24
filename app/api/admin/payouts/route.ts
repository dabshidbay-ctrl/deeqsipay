import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getRole } from '@/lib/server/auth'

// The payout queue. Read-only, so moderators may look; deciding happens in [id]/route.ts.
// payouts has two FKs to profiles (requested_by, reviewed_by), so the requester embed must
// name its constraint or PostgREST cannot pick a relationship.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const STAFF = new Set(['admin', 'moderator'])
const STATUSES = new Set(['requested', 'approved', 'rejected', 'paid', 'cancelled'])
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

type Ref<T> = T | T[] | null
type PayoutRow = {
  id: string
  campaign_id: string
  requested_by: string
  amount_minor: number
  currency: string | null
  status: string
  reviewed_at: string | null
  decision_note: string | null
  provider_reference: string | null
  created_at: string
  campaigns: Ref<{ id: string; title: string }>
  profiles: Ref<{ display_name: string | null }>
}

function one<T>(value: Ref<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

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

  let query = createAdminClient()
    .from('payouts')
    .select('id,campaign_id,requested_by,amount_minor,currency,status,reviewed_at,decision_note,provider_reference,created_at,campaigns(id,title),profiles!payouts_requested_by_fkey(display_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
  if (status !== null) query = query.eq('status', status)

  const { data, error, count } = await query.range(offset, offset + limit - 1)
  if (error) return json({ error: 'Unable to load payouts' }, 500)

  const rows = (data ?? []) as unknown as PayoutRow[]
  return json({
    payouts: rows.map((row) => ({
      id: row.id,
      amountMinor: Number(row.amount_minor),
      currency: row.currency ?? 'USD',
      status: row.status,
      reviewedAt: row.reviewed_at,
      decisionNote: row.decision_note,
      providerReference: row.provider_reference,
      createdAt: row.created_at,
      campaign: { id: row.campaign_id, title: one(row.campaigns)?.title ?? null },
      requester: { id: row.requested_by, displayName: one(row.profiles)?.display_name ?? null },
    })),
    total: count ?? rows.length,
  })
}
