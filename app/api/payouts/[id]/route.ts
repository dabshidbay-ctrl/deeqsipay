import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'
import { rpcFailure } from '@/lib/server/auth'
import { isUuid } from '@/lib/server/validation'

// The requester withdraws their own still-'requested' payout, releasing the reservation.
// cancel_payout owns that rule; this route only proves who is asking. The pre-check keeps a
// stranger's probe from reaching the function at all, and never reveals more than "not
// yours" — the 404 below is for a payout id that does not exist for anyone.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request)
  if (!user) return json({ error: 'Authentication required' }, 401)
  const { id } = await params
  if (!isUuid(id)) return json({ error: 'Invalid payout id' }, 400)

  const supabase = createAdminClient()
  const { data, error: loadError } = await supabase.from('payouts').select('id,requested_by').eq('id', id).maybeSingle()
  if (loadError) return json({ error: 'Unable to load payout' }, 500)
  const payout = data as { id: string; requested_by: string } | null
  if (!payout) return json({ error: 'Payout not found' }, 404)
  if (payout.requested_by !== user.id) return json({ error: 'Forbidden' }, 403)

  const { error } = await supabase.rpc('cancel_payout', { p_payout_id: id, p_owner_id: user.id })
  if (error) {
    const failure = rpcFailure(error)
    return json({ error: failure.error }, failure.status)
  }

  const { data: updated } = await supabase.from('payouts').select('id,campaign_id,amount_minor,currency,status,created_at').eq('id', id).maybeSingle()
  const row = updated as { id: string; campaign_id: string; amount_minor: number; currency: string | null; status: string; created_at: string } | null
  if (!row) return json({ error: 'Payout not found' }, 404)
  return json({ payout: { id: row.id, campaignId: row.campaign_id, amountMinor: Number(row.amount_minor), currency: row.currency ?? 'USD', status: row.status, createdAt: row.created_at } })
}
