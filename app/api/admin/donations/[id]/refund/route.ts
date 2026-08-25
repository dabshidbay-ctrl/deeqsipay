import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getRole, rpcFailure } from '@/lib/server/auth'
import { isUuid } from '@/lib/server/validation'

/**
 * Refunds a succeeded donation.
 *
 * ADMIN ONLY. A moderator cannot move money, and an organiser must never be able to
 * refund donations to their own campaign — that would let them zero out a balance to
 * dodge a payout dispute, or churn a campaign's numbers at will.
 *
 * All the real work is in refund_donation(), which re-checks the admin role itself,
 * takes a row lock, refuses anything not exactly 'succeeded', writes the negative ledger
 * entry, and decrements the counters in one transaction. This route only authenticates,
 * validates shape, and translates a raised exception into a clean status.
 *
 * NOTE: this records the refund in OUR books. Returning the money to the payer is a
 * separate manual step in the Sifalo portal — their API exposes no refund call. The
 * response says so explicitly so nobody assumes the payer has been paid back.
 */

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getRole(request)
  if (!actor) return json({ error: 'Authentication required' }, 401)
  if (actor.role !== 'admin') return json({ error: 'Forbidden' }, 403)

  const { id } = await params
  if (!isUuid(id)) return json({ error: 'Invalid donation id' }, 400)

  let note = ''
  try {
    const body = await request.json() as { note?: unknown }
    if (body.note !== undefined && body.note !== null) {
      if (typeof body.note !== 'string' || body.note.length > 500) return json({ error: 'Invalid note' }, 400)
      note = body.note.trim()
    }
  } catch {
    // An empty body is fine; a note is optional.
  }
  if (note === '') return json({ error: 'Say why this donation is being refunded' }, 400)

  const supabase = createAdminClient()
  const { error } = await supabase.rpc('refund_donation', { p_donation_id: id, p_admin_id: actor.user.id, p_note: note })
  if (error) {
    const failure = rpcFailure(error)
    return json({ error: failure.error }, failure.status)
  }

  return json({
    refunded: true,
    note: 'Recorded in the ledger and deducted from the campaign. Return the money to the payer in the Sifalo portal — that step is manual.',
  })
}
