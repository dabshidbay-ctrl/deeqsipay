import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getRole, rpcFailure } from '@/lib/server/auth'
import { isUuid } from '@/lib/server/validation'

// Admin-only. A moderator reaches the queue and stops here with a 403 (CONTRACT rule 5).
// The route never touches payouts.status: decide_payout / mark_payout_paid are SECURITY
// DEFINER, re-check the actor's role themselves, and reject illegal transitions. The role
// check below is a fast fail, not the security boundary.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const MAX_NOTE = 1000
const MAX_REFERENCE = 200

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getRole(request)
  if (!actor) return json({ error: 'Authentication required' }, 401)
  if (actor.role !== 'admin') return json({ error: 'Forbidden' }, 403)

  const { id } = await params
  if (!isUuid(id)) return json({ error: 'Invalid payout id' }, 400)

  try {
    const body = await request.json() as { decision?: unknown; note?: unknown; reference?: unknown }
    const decision = body.decision
    if (decision !== 'approved' && decision !== 'rejected' && decision !== 'paid') return json({ error: 'Invalid decision' }, 400)
    if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') return json({ error: 'Invalid note' }, 400)
    if (body.reference !== undefined && body.reference !== null && typeof body.reference !== 'string') return json({ error: 'Invalid reference' }, 400)
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_NOTE) : null
    const reference = typeof body.reference === 'string' ? body.reference.trim().slice(0, MAX_REFERENCE) : null

    const supabase = createAdminClient()
    const { error } = decision === 'paid'
      ? await supabase.rpc('mark_payout_paid', { p_payout_id: id, p_admin_id: actor.user.id, p_reference: reference })
      : await supabase.rpc('decide_payout', { p_payout_id: id, p_admin_id: actor.user.id, p_decision: decision, p_note: note })
    if (error) {
      const failure = rpcFailure(error)
      return json({ error: failure.error }, failure.status)
    }

    const { data } = await supabase.from('payouts').select('id,campaign_id,requested_by,amount_minor,currency,status,reviewed_by,reviewed_at,decision_note,provider_reference,created_at').eq('id', id).maybeSingle()
    const row = data as {
      id: string
      campaign_id: string
      requested_by: string
      amount_minor: number
      currency: string | null
      status: string
      reviewed_by: string | null
      reviewed_at: string | null
      decision_note: string | null
      provider_reference: string | null
      created_at: string
    } | null
    if (!row) return json({ error: 'Not found' }, 404)
    return json({
      payout: {
        id: row.id,
        campaignId: row.campaign_id,
        requestedBy: row.requested_by,
        amountMinor: Number(row.amount_minor),
        currency: row.currency ?? 'USD',
        status: row.status,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at,
        decisionNote: row.decision_note,
        providerReference: row.provider_reference,
        createdAt: row.created_at,
      },
    })
  } catch { return json({ error: 'Invalid request' }, 400) }
}
