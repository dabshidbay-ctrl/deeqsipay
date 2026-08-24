import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'
import { createSifaloPayment } from '@/lib/server/sifalo'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })

export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    if (!user) return json({ error: 'Authentication required' }, 401)
    const body = await request.json() as { campaignId?: string; amountMinor?: number; phone?: string; idempotencyKey?: string }
    if (!body.campaignId || !body.idempotencyKey || !body.phone || typeof body.amountMinor !== 'number' || !Number.isSafeInteger(body.amountMinor) || body.amountMinor < 100 || body.amountMinor > 1000000000) {
      return json({ error: 'Invalid donation request' }, 400)
    }
    if (!/^\+?[1-9]\d{7,14}$/.test(body.phone)) return json({ error: 'Invalid mobile number' }, 400)
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(body.idempotencyKey)) return json({ error: 'Invalid idempotency key' }, 400)

    const supabase = createAdminClient()
    const { data: existing } = await supabase.from('donations').select('id,status,provider_reference').eq('donor_id', user.id).eq('idempotency_key', body.idempotencyKey).maybeSingle()
    if (existing) return json({ donationId: existing.id, status: existing.status, providerReference: existing.provider_reference })
    const { data: campaign } = await supabase.from('campaigns').select('id,status').eq('id', body.campaignId).eq('status', 'active').maybeSingle()
    if (!campaign) return json({ error: 'Campaign unavailable' }, 404)

    const { data: donation, error } = await supabase.from('donations').insert({ campaign_id: campaign.id, donor_id: user.id, amount_minor: body.amountMinor, idempotency_key: body.idempotencyKey }).select('id').single()
    if (error || !donation) return json({ error: 'Unable to create donation' }, 500)
    try {
      const payment = await createSifaloPayment({ amountMinor: body.amountMinor, currency: 'USD', phone: body.phone, reference: donation.id, callbackUrl: `${new URL(request.url).origin}/api/webhooks/sifalo` })
      await supabase.from('payment_attempts').insert({ donation_id: donation.id, provider_reference: payment.providerReference, phone_last4: body.phone.slice(-4), status: payment.status })
      if (payment.status === 'succeeded') await supabase.rpc('credit_donation', { p_donation_id: donation.id, p_provider_reference: payment.providerReference })
      return json({ donationId: donation.id, status: payment.status, providerReference: payment.providerReference }, 201)
    } catch {
      await supabase.from('donations').update({ status: 'failed' }).eq('id', donation.id).eq('status', 'pending')
      return json({ error: 'Payment provider unavailable' }, 502)
    }
  } catch { return json({ error: 'Invalid request' }, 400) }
}
