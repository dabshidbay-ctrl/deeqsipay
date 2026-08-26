import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'
import { createSifaloCheckout, SifaloUnknownError } from '@/lib/server/sifalo'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? '0.0.0.0'
  return request.headers.get('x-real-ip') ?? '0.0.0.0'
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    if (!user) return json({ error: 'Authentication required' }, 401)
    const body = await request.json() as { campaignId?: string; amountMinor?: number; idempotencyKey?: string; anonymous?: boolean }
    if (!body.campaignId || !body.idempotencyKey || typeof body.amountMinor !== 'number' || !Number.isSafeInteger(body.amountMinor) || body.amountMinor < 100 || body.amountMinor > 1000000000) {
      return json({ error: 'Invalid donation request' }, 400)
    }
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(body.idempotencyKey)) return json({ error: 'Invalid idempotency key' }, 400)

    const supabase = createAdminClient()

    // Rate limit payment initiation. Counted in the DB so it holds across instances.
    const since = new Date(Date.now() - 60_000).toISOString()
    const { count: recent } = await supabase.from('donations').select('id', { count: 'exact', head: true }).eq('donor_id', user.id).gte('created_at', since)
    if ((recent ?? 0) >= 8) return json({ error: 'Too many donation attempts. Please wait a moment.' }, 429)

    const { data: existing } = await supabase.from('donations').select('id,status,provider_reference').eq('donor_id', user.id).eq('idempotency_key', body.idempotencyKey).maybeSingle()
    if (existing) return json({ donationId: existing.id, status: existing.status, providerReference: existing.provider_reference })

    // Campaign currency drives the charge — it must not be assumed to be USD.
    const { data: campaign } = await supabase.from('campaigns').select('id,currency').eq('id', body.campaignId).eq('status', 'active').maybeSingle()
    if (!campaign) return json({ error: 'Campaign unavailable' }, 404)
    const currency = typeof campaign.currency === 'string' ? campaign.currency : 'USD'

    const { data: donation, error } = await supabase.from('donations').insert({ campaign_id: campaign.id, donor_id: user.id, amount_minor: body.amountMinor, currency, is_anonymous: body.anonymous === true, idempotency_key: body.idempotencyKey }).select('id').single()
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
      // Hosted checkout: Sifalo collects the wallet number and PIN on their own page, so
      // we never handle the payer's mobile-money number. Direct API charging returns an
      // empty body on this merchant account — it is not provisioned for it.
      const origin = new URL(request.url).origin
      const checkout = await createSifaloCheckout({
        amountMinor: body.amountMinor,
        currency,
        reference: donation.id,
        // Sifalo appends ?sid=... to this; the donation id identifies which row it settles.
        returnUrl: `${origin}/donate/complete?d=${donation.id}`,
        ip: clientIp(request),
      })

      await supabase.from('payment_attempts').insert({
        donation_id: donation.id,
        provider_reference: checkout.key,
        status: 'pending',
        raw_status: 'checkout_created',
      })

      return json({ donationId: donation.id, status: 'pending', checkoutUrl: checkout.checkoutUrl }, 201)
    } catch (caught) {
      // The donation row EXISTS and its outcome is unknown. Returning 502 here was wrong
      // twice over: it says the whole request failed when it did not, and every non-2xx
      // makes authedFetch throw, which the donate form rendered as "payment failed" — the
      // one thing we must never claim when we do not know. 202 Accepted is the honest
      // code: accepted, not yet resolved.
      console.error('[donations] Sifalo charge unresolved for donation %s: %s', donation.id, caught instanceof Error ? caught.message : caught)
      const unknown = caught instanceof SifaloUnknownError
      return json({
        donationId: donation.id,
        status: 'pending',
        unresolved: true,
        error: unknown
          ? 'We could not confirm this with Sifalo. If money left your account it will be credited once we reconcile — do not pay again.'
          : 'Mobile money is temporarily unavailable. Nothing has been charged.',
      }, 202)
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
