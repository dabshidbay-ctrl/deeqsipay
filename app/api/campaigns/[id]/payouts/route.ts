import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'
import { rpcFailure } from '@/lib/server/auth'
import { isUuid } from '@/lib/server/validation'

// Owner-only. POST sends an AMOUNT and nothing else — no balance, no status, no approval
// (CONTRACT rule 2). request_payout locks the campaign row, re-derives the available figure
// inside the same transaction and raises if the amount does not fit, so two concurrent
// requests for the whole balance cannot both succeed. The ownership check below is a fast
// fail that returns a clean 403; the function re-checks it regardless.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const MIN_AMOUNT_MINOR = 100
const MAX_AMOUNT_MINOR = 1_000_000_000
const MAX_LIMIT = 100

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
}

const mapPayout = (row: PayoutRow) => ({
  id: row.id,
  campaignId: row.campaign_id,
  requestedBy: row.requested_by,
  amountMinor: Number(row.amount_minor),
  currency: row.currency ?? 'USD',
  status: row.status,
  reviewedAt: row.reviewed_at,
  decisionNote: row.decision_note,
  providerReference: row.provider_reference,
  createdAt: row.created_at,
})

async function requireOwnership(request: Request, id: string) {
  const user = await requireUser(request)
  if (!user) return { user: null, response: json({ error: 'Authentication required' }, 401) }
  if (!isUuid(id)) return { user: null, response: json({ error: 'Invalid campaign id' }, 400) }
  const { data, error } = await createAdminClient().from('campaigns').select('id,owner_id').eq('id', id).maybeSingle()
  if (error) return { user: null, response: json({ error: 'Unable to load campaign' }, 500) }
  const campaign = data as { id: string; owner_id: string } | null
  if (!campaign) return { user: null, response: json({ error: 'Campaign not found' }, 404) }
  if (campaign.owner_id !== user.id) return { user: null, response: json({ error: 'Forbidden' }, 403) }
  return { user, response: null }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireOwnership(request, id)
  if (!gate.user) return gate.response

  const url = new URL(request.url)
  const requested = Number(url.searchParams.get('limit') ?? MAX_LIMIT)
  const limit = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : MAX_LIMIT

  const { data, error } = await createAdminClient()
    .from('payouts')
    .select('id,campaign_id,requested_by,amount_minor,currency,status,reviewed_at,decision_note,provider_reference,created_at')
    .eq('campaign_id', id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return json({ error: 'Unable to load payouts' }, 500)
  return json({ payouts: ((data ?? []) as unknown as PayoutRow[]).map(mapPayout) })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireOwnership(request, id)
  if (!gate.user) return gate.response

  try {
    const body = await request.json() as { amountMinor?: unknown }
    const amountMinor = body.amountMinor
    if (typeof amountMinor !== 'number' || !Number.isSafeInteger(amountMinor) || amountMinor < MIN_AMOUNT_MINOR || amountMinor > MAX_AMOUNT_MINOR) return json({ error: 'Invalid amount' }, 400)

    const { data, error } = await createAdminClient().rpc('request_payout', { p_campaign_id: id, p_owner_id: gate.user.id, p_amount_minor: amountMinor })
    if (error) {
      const failure = rpcFailure(error)
      return json({ error: failure.error }, failure.status)
    }
    const payoutId = typeof data === 'string' ? data : null
    if (!payoutId) return json({ error: 'Unable to request payout' }, 500)
    return json({ payoutId }, 201)
  } catch { return json({ error: 'Invalid request' }, 400) }
}
