import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { providerAmountMinor } from '@/lib/server/validation'

const SUCCESS = new Set(['success', 'succeeded', 'paid', 'completed'])
const FAILURE = new Set(['failed', 'declined', 'cancelled', 'expired'])

// This endpoint is the only thing on the internet that can move money into a campaign.
// Everything below is a gate a forged request has to pass:
//   1. HMAC-SHA256 over the RAW body, compared in constant time.
//   2. unique(provider, event_id) — a captured-and-replayed event is rejected once.
//   3. The credited amount comes from OUR donation row, never from the payload, and
//      when the payload states an amount it must match or we refuse to credit.
function validSignature(raw: string, signature: string | null) {
  const secret = process.env.SIFALO_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  const raw = await request.text()
  if (raw.length > 100_000 || !validSignature(raw, request.headers.get('x-sifalo-signature'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const payload = JSON.parse(raw) as Record<string, unknown> & { id?: string; event_id?: string; reference?: string; payment_id?: string; status?: string }
    const eventId = payload.event_id ?? payload.id
    const providerReference = payload.payment_id ?? payload.reference
    if (!eventId || !providerReference || !payload.status) return NextResponse.json({ error: 'Invalid event' }, { status: 400 })

    const supabase = createAdminClient()
    const payloadHash = createHash('sha256').update(raw).digest('hex')
    const { error: eventError } = await supabase.from('webhook_events').insert({ provider: 'sifalo', event_id: eventId, payload_hash: payloadHash })
    if (eventError) {
      // 23505 = unique violation on (provider, event_id): a genuine replay, already handled.
      if (eventError.code === '23505') return NextResponse.json({ received: true })
      // Anything else is our failure. Return 500 so Sifalo retries — acknowledging here
      // would silently drop a real payment.
      return NextResponse.json({ error: 'Unable to process event' }, { status: 500 })
    }

    const status = payload.status.toLowerCase()
    const settled = SUCCESS.has(status) ? 'succeeded' : FAILURE.has(status) ? (status === 'expired' ? 'expired' : 'failed') : 'pending'
    const { data: attempt } = await supabase.from('payment_attempts').select('donation_id').eq('provider', 'sifalo').eq('provider_reference', providerReference).maybeSingle()

    if (attempt?.donation_id) {
      let amountMismatch = false
      if (settled === 'succeeded') {
        // Defence in depth: credit only what we recorded, and only if the provider agrees.
        const stated = providerAmountMinor(payload)
        if (stated !== null) {
          const { data: donation } = await supabase.from('donations').select('amount_minor').eq('id', attempt.donation_id).maybeSingle()
          const expected = donation ? Number(donation.amount_minor) : null
          amountMismatch = expected !== null && stated !== expected
        }
      }

      if (settled === 'succeeded' && !amountMismatch) await supabase.rpc('credit_donation', { p_donation_id: attempt.donation_id, p_provider_reference: providerReference })
      if (settled === 'failed' || settled === 'expired') await supabase.from('donations').update({ status: settled, updated_at: new Date().toISOString() }).eq('id', attempt.donation_id).eq('status', 'pending')

      await supabase.from('payment_attempts').update({
        status: amountMismatch ? 'amount_mismatch' : settled,
        raw_status: payload.status,
        updated_at: new Date().toISOString(),
      }).eq('donation_id', attempt.donation_id).eq('provider_reference', providerReference)

      // Leave the donation pending and the event unprocessed so a human reconciles it.
      if (amountMismatch) return NextResponse.json({ received: true, credited: false })
    }

    await supabase.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_id', eventId).eq('provider', 'sifalo')
    return NextResponse.json({ received: true })
  } catch { return NextResponse.json({ error: 'Invalid event' }, { status: 400 }) }
}
