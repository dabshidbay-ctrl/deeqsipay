import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getSifaloPayment } from '@/lib/server/sifalo'

// This endpoint is the only thing on the internet that can move money into a campaign,
// so it never trusts the request body's own claim that a payment succeeded.
//
// Two trust modes, decided by whether SIFALO_WEBHOOK_SECRET is set:
//
//   SIGNED   — Sifalo shares a signing secret. We verify HMAC-SHA256 over the raw body
//              in constant time and may then believe the payload.
//   UNSIGNED — Sifalo does not sign callbacks. The payload is then just an untrusted
//              *hint* that something changed: we take only the payment reference from
//              it, and ask Sifalo's API for the real status. Anyone can POST here, but
//              forging a donation would require forging Sifalo's own API response.
//
// Never remove the unsigned path's callback. Without it, an unsigned webhook means
// anyone who can guess a reference can credit a campaign for free.

const FAILURE = new Set(['failed', 'expired'])

function signatureMode() {
  return process.env.SIFALO_WEBHOOK_SECRET ? 'signed' : 'unsigned'
}

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
  if (raw.length > 100_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 })

  const signed = signatureMode() === 'signed'
  if (signed && !validSignature(raw, request.headers.get('x-sifalo-signature'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = JSON.parse(raw) as Record<string, unknown> & { id?: string; event_id?: string; reference?: string; payment_id?: string; status?: string }
    const providerReference = payload.payment_id ?? payload.reference
    if (!providerReference) return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
    // Unsigned callers cannot be trusted to supply a stable event id, so fall back to
    // hashing the body — replay protection must not depend on attacker-controlled input.
    const eventId = (signed ? payload.event_id ?? payload.id : null) ?? createHash('sha256').update(raw).digest('hex')

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

    const { data: attempt } = await supabase.from('payment_attempts').select('donation_id').eq('provider', 'sifalo').eq('provider_reference', providerReference).maybeSingle()

    if (attempt?.donation_id) {
      // The authoritative status. Signed payloads may speak for themselves; unsigned ones
      // are confirmed against Sifalo before a single cent moves.
      let settled: string
      let statedMinor: number | null = null
      if (signed) {
        const status = (payload.status ?? '').toLowerCase()
        settled = ['success', 'succeeded', 'paid', 'completed'].includes(status) ? 'succeeded'
          : status === 'expired' ? 'expired'
            : ['failed', 'declined', 'cancelled'].includes(status) ? 'failed' : 'pending'
        const amount = payload.amount_minor ?? payload.amount
        if (typeof amount === 'number' && Number.isFinite(amount)) statedMinor = payload.amount_minor !== undefined ? Math.trunc(amount) : Math.round(amount * 100)
      } else {
        try {
          const confirmed = await getSifaloPayment(providerReference)
          settled = confirmed.status
          statedMinor = confirmed.amountMinor
        } catch {
          // Could not confirm — credit nothing and let Sifalo retry.
          return NextResponse.json({ error: 'Unable to confirm payment' }, { status: 500 })
        }
      }

      let amountMismatch = false
      if (settled === 'succeeded' && statedMinor !== null) {
        const { data: donation } = await supabase.from('donations').select('amount_minor').eq('id', attempt.donation_id).maybeSingle()
        const expected = donation ? Number(donation.amount_minor) : null
        amountMismatch = expected !== null && statedMinor !== expected
      }

      if (settled === 'succeeded' && !amountMismatch) await supabase.rpc('credit_donation', { p_donation_id: attempt.donation_id, p_provider_reference: providerReference })
      if (FAILURE.has(settled)) await supabase.from('donations').update({ status: settled, updated_at: new Date().toISOString() }).eq('id', attempt.donation_id).eq('status', 'pending')

      await supabase.from('payment_attempts').update({
        status: amountMismatch ? 'amount_mismatch' : settled,
        raw_status: typeof payload.status === 'string' ? payload.status : settled,
        updated_at: new Date().toISOString(),
      }).eq('donation_id', attempt.donation_id).eq('provider_reference', providerReference)

      if (amountMismatch) return NextResponse.json({ received: true, credited: false })
    }

    await supabase.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_id', eventId).eq('provider', 'sifalo')
    return NextResponse.json({ received: true })
  } catch { return NextResponse.json({ error: 'Invalid event' }, { status: 400 }) }
}
