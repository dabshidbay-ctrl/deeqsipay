import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getRole } from '@/lib/server/auth'
import { isUuid } from '@/lib/server/validation'

/**
 * The append-only money history for one campaign: every donation, refund and payout as a
 * signed entry, plus the derived totals.
 *
 * Visible to the campaign owner and to staff. It is the auditable counterpart to
 * campaigns.raised_minor — if the two ever disagree, the ledger is right and the counter
 * is the thing that drifted.
 */

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

type LedgerRow = { id: string; kind: string; amount_minor: number; currency: string; note: string | null; created_at: string; donation_id: string | null; payout_id: string | null }

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getRole(request)
  if (!actor) return json({ error: 'Authentication required' }, 401)

  const { id } = await params
  if (!isUuid(id)) return json({ error: 'Invalid campaign id' }, 400)

  const supabase = createAdminClient()
  const { data: campaign } = await supabase.from('campaigns').select('owner_id,currency').eq('id', id).maybeSingle()
  if (!campaign) return json({ error: 'Campaign not found' }, 404)

  const isStaff = actor.role === 'admin' || actor.role === 'moderator'
  // 404 rather than 403 for a stranger: do not confirm which campaign ids exist.
  if (!isStaff && campaign.owner_id !== actor.user.id) return json({ error: 'Campaign not found' }, 404)

  const { data, error } = await supabase
    .from('ledger_entries')
    .select('id,kind,amount_minor,currency,note,created_at,donation_id,payout_id')
    .eq('campaign_id', id)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) return json({ error: 'Unable to load the ledger' }, 500)

  const entries = (data ?? []) as LedgerRow[]
  const totals = entries.reduce((acc, entry) => {
    const amount = Number(entry.amount_minor)
    if (entry.kind === 'donation') acc.donatedMinor += amount
    if (entry.kind === 'refund') acc.refundedMinor += amount
    if (entry.kind === 'payout') acc.paidOutMinor += amount
    acc.netMinor += amount
    return acc
  }, { donatedMinor: 0, refundedMinor: 0, paidOutMinor: 0, netMinor: 0 })

  // Signed, unclamped: a campaign refunded after payout is legitimately negative and an
  // admin needs to see that rather than a reassuring zero.
  const { data: balance } = await supabase.rpc('campaign_balance_minor', { p_campaign_id: id })

  return json({
    entries: entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      amountMinor: Number(entry.amount_minor),
      currency: entry.currency,
      note: entry.note,
      createdAt: entry.created_at,
      donationId: entry.donation_id,
      payoutId: entry.payout_id,
    })),
    totals,
    balanceMinor: typeof balance === 'number' ? balance : totals.netMinor,
    currency: campaign.currency ?? 'USD',
  })
}
