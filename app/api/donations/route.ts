import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'
import { chargeSifalo, isSifaloWallet, SifaloUnknownError } from '@/lib/server/sifalo'

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
    const body = await request.json() as { campaignId?: string; amountMinor?: number; phone?: string; idempotencyKey?: string; anonymous?: boolean; wallet?: unknown }
    if (!body.campaignId || !body.idempotencyKey || !body.phone || typeof body.amountMinor !== 'number' || !Number.isSafeInteger(body.amountMinor) || body.amountMinor < 100 || body.amountMinor > 1000000000) {
      return json({ error: 'Invalid donation request' }, 400)
    }
    if (!/^\+?[1-9]\d{7,14}$/.test(body.phone)) return json({ error: 'Invalid mobile number' }, 400)
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(body.idempotencyKey)) return json({ error: 'Invalid idempotency key' }, 400)
    // Sifalo routes by wallet, so this is required — it is not inferable from the number.
    if (!isSifaloWallet(body.wallet)) return json({ error: 'Choose which mobile money account to pay from' }, 400)

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
      // Sifalo is synchronous: the payer approves on their handset while this call is
      // open, and the response is the final outcome. There is no webhook to wait for.
      const outcome = await chargeSifalo({
        amountMinor: body.amountMinor,
        currency,
        account: body.phone,
        wallet: body.wallet,
        reference: donation.id,
        originUrl: new URL(request.url).origin,
        ip: clientIp(request),
      })

      await supabase.from('payment_attempts').insert({
        donation_id: donation.id,
        provider_reference: outcome.providerReference,
        phone_last4: body.phone.slice(-4),
        status: outcome.status,
        raw_status: outcome.rawCode,
      })

      if (outcome.status === 'succeeded') {
        await supabase.rpc('credit_donation', { p_donation_id: donation.id, p_provider_reference: outcome.providerReference })
        return json({ donationId: donation.id, status: 'succeeded', providerReference: outcome.providerReference }, 201)
      }

      await supabase.from('donations').update({ status: outcome.status, updated_at: new Date().toISOString() }).eq('id', donation.id).eq('status', 'pending')
      return json({ donationId: donation.id, status: outcome.status, error: outcome.message }, 200)
    } catch (caught) {
      // Timeout or transport failure. Sifalo offers no way to look a charge up afterwards,
      // so the outcome is genuinely unknown: leave it pending for manual settlement rather
      // than guessing. Guessing 'failed' hides money that did arrive; guessing 'succeeded'
      // credits money that did not.
      const unknown = caught instanceof SifaloUnknownError
      return json({
        donationId: donation.id,
        status: 'pending',
        error: unknown
          ? 'We lost contact with Sifalo before confirming. If money left your account it will be credited once we reconcile — do not pay again.'
          : 'Payment provider unavailable',
      }, 502)
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
