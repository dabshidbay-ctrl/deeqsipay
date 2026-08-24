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

    // Campaign currency drives the charge — it must not be assumed to be USD.
    const { data: campaign } = await supabase.from('campaigns').select('id,currency').eq('id', body.campaignId).eq('status', 'active').maybeSingle()
    if (!campaign) return json({ error: 'Campaign unavailable' }, 404)
    const currency = typeof campaign.currency === 'string' ? campaign.currency : 'USD'

    const { data: donation, error } = await supabase.from('donations').insert({ campaign_id: campaign.id, donor_id: user.id, amount_minor: body.amountMinor, currency, idempotency_key: body.idempotencyKey }).select('id').single()
    if (error || !donation) {
      // 23505 on (donor_id, idempotency_key): a concurrent request for the SAME logical
      // donation won the race. Return its row rather than 500-ing and inviting a retry
      // that the user would experience as a possible double charge.
      if (error?.code === '23505') {
        const { data: raced } = await supabase.from('donations').select('id,status,provider_reference').eq('donor_id', user.id).eq('idempotency_key', body.idempotencyKey).maybeSingle()
        if (raced) return json({ donationId: raced.id, status: raced.status, providerReference: raced.provider_reference })
      }
      return json({ error: 'Unable to create donation' }, 500)
    }

    try {
      const payment = await createSifaloPayment({ amountMinor: body.amountMinor, currency, phone: body.phone, reference: donation.id, callbackUrl: `${new URL(request.url).origin}/api/webhooks/sifalo` })
      await supabase.from('payment_attempts').insert({ donation_id: donation.id, provider_reference: payment.providerReference, phone_last4: body.phone.slice(-4), status: payment.status })
      if (payment.status === 'succeeded') await supabase.rpc('credit_donation', { p_donation_id: donation.id, p_provider_reference: payment.providerReference })
      if (payment.status === 'failed' || payment.status === 'expired') await supabase.from('donations').update({ status: payment.status }).eq('id', donation.id).eq('status', 'pending')
      return json({ donationId: donation.id, status: payment.status, providerReference: payment.providerReference }, 201)
    } catch {
      // The provider call may have timed out AFTER the charge was created upstream, so
      // leave the donation pending for reconciliation rather than marking it failed.
      return json({ donationId: donation.id, status: 'pending', error: 'Payment provider unavailable' }, 502)
    }
  } catch { return json({ error: 'Invalid request' }, 400) }
}

export async function GET(request: Request) {
  const user = await requireUser(request)
  if (!user) return json({ error: 'Authentication required' }, 401)
  const { data, error } = await createAdminClient()
    .from('donations')
    .select('id,status,amount_minor,currency,created_at,campaigns(id,title,image_url)')
    .eq('donor_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return json({ error: 'Unable to load donations' }, 500)
  return json({ donations: data })
}
