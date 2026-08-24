import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'
import { rpcFailure } from '@/lib/server/auth'
import { isUuid } from '@/lib/server/validation'

// Owner-only view of what a campaign can still pay out.
//
// availableMinor comes from campaign_available_minor() and from nowhere else: it is the
// number that gates money, it is derived inside the database, and no value the client sends
// can influence it (CONTRACT rule 1). raisedMinor and reservedMinor are context for the UI —
// reservedMinor is summed from the payouts that hold money back ('requested','approved',
// 'paid'), so `raised - reserved` visibly reconciles with the available figure.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const RESERVING = ['requested', 'approved', 'paid']

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request)
  if (!user) return json({ error: 'Authentication required' }, 401)
  const { id } = await params
  if (!isUuid(id)) return json({ error: 'Invalid campaign id' }, 400)

  const supabase = createAdminClient()
  const { data: campaignData, error: campaignError } = await supabase.from('campaigns').select('id,owner_id,currency,raised_minor').eq('id', id).maybeSingle()
  if (campaignError) return json({ error: 'Unable to load balance' }, 500)
  const campaign = campaignData as { id: string; owner_id: string; currency: string | null; raised_minor: number } | null
  if (!campaign) return json({ error: 'Campaign not found' }, 404)
  if (campaign.owner_id !== user.id) return json({ error: 'Forbidden' }, 403)

  const { data: available, error: availableError } = await supabase.rpc('campaign_available_minor', { p_campaign_id: id })
  if (availableError) {
    const failure = rpcFailure(availableError)
    return json({ error: failure.error }, failure.status)
  }

  const { data: payoutData, error: payoutError } = await supabase.from('payouts').select('amount_minor').eq('campaign_id', id).in('status', RESERVING)
  if (payoutError) return json({ error: 'Unable to load balance' }, 500)
  const reservedMinor = ((payoutData ?? []) as unknown as { amount_minor: number }[]).reduce((sum, row) => sum + Number(row.amount_minor), 0)

  return json({
    availableMinor: Number(available ?? 0),
    raisedMinor: Number(campaign.raised_minor ?? 0),
    reservedMinor,
    currency: campaign.currency ?? 'USD',
  })
}
