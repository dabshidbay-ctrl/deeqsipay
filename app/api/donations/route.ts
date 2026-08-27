import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'
import { chargeSifalo, isSifaloWallet, SifaloUnknownError, type SifaloWallet } from '@/lib/server/sifalo'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? '0.0.0.0'
  return request.headers.get('x-real-ip') ?? '0.0.0.0'
}

export async function POST(request: Request) {
  try {
    // Donating never requires an account. If the giver happens to be signed in we attach
    // the donation to them so it appears in their history; otherwise it is a guest gift.
    const user = await requireUser(request).catch(() => null)
    const body = await request.json() as { campaignId?: string; amountMinor?: number; idempotencyKey?: string; anonymous?: boolean; phone?: string; wallet?: unknown }
    if (!body.campaignId || !body.idempotencyKey || typeof body.amountMinor !== 'number' || !Number.isSafeInteger(body.amountMinor) || body.amountMinor < 100 || body.amountMinor > 1000000000) {
      return json({ error: 'Invalid donation request' }, 400)
    }
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(body.idempotencyKey)) return json({ error: 'Invalid idempotency key' }, 400)

    // Required now: the payment happens here, so we must have a number to charge.
    if (typeof body.phone !== 'string' || !/^\+?[1-9]\d{7,14}$/.test(body.phone)) {
      return json({ error: 'Enter a valid mobile money number' }, 400)
    }
    if (!isSifaloWallet(body.wallet)) return json({ error: 'Choose which mobile money account to pay from' }, 400)

    const supabase = createAdminClient()

    // Rate limit payment initiation. Counted in the DB so it holds across instances.
    const since = new Date(Date.now() - 60_000).toISOString()
    const limitQuery = supabase.from('donations').select('id', { count: 'exact', head: true }).gte('created_at', since)
    const { count: recent } = user ? await limitQuery.eq('donor_id', user.id) : await limitQuery.is('donor_id', null)
    if ((recent ?? 0) >= 8) return json({ error: 'Too many donation attempts. Please wait a moment.' }, 429)

    // idempotency_key is globally unique now (0006), so this replay guard works for guests too.
    const { data: existing } = await supabase.from('donations').select('id,status,provider_reference').eq('idempotency_key', body.idempotencyKey).maybeSingle()
    if (existing) return json({ donationId: existing.id, status: existing.status, providerReference: existing.provider_reference })

    // Campaign currency drives the charge — it must not be assumed to be USD.
    const { data: campaign } = await supabase.from('campaigns').select('id,currency').eq('id', body.campaignId).eq('status', 'active').maybeSingle()
    if (!campaign) return json({ error: 'Campaign unavailable' }, 404)
    const currency = typeof campaign.currency === 'string' ? campaign.currency : 'USD'

    const { data: donation, error } = await supabase.from('donations').insert({ campaign_id: campaign.id, donor_id: user?.id ?? null, amount_minor: body.amountMinor, currency, is_anonymous: body.anonymous === true, idempotency_key: body.idempotencyKey }).select('id').single()
    if (error || !donation) {
      // 23505 on (donor_id, idempotency_key): a concurrent request for the SAME logical
      // donation won the race. Return its row rather than 500-ing and inviting a retry
      // that the user would experience as a possible double charge.
      if (error?.code === '23505') {
        const { data: raced } = await supabase.from('donations').select('id,status,provider_reference').eq('idempotency_key', body.idempotencyKey).maybeSingle()
        if (raced) return json({ donationId: raced.id, status: raced.status, providerReference: raced.provider_reference })
      }
      return json({ error: 'Unable to create donation' }, 500)
    }

    try {
      // The payment happens INSIDE our site. The donor entered their number on our page
      // and Sifalo pushes a PIN prompt to that handset. We never hand the payer off to
      // pay.sifalo.com — no redirect, no hosted page.
      const outcome = await chargeSifalo({
        amountMinor: body.amountMinor,
        currency,
        account: body.phone as string,
        wallet: body.wallet as SifaloWallet,
        reference: donation.id,
        originUrl: new URL(request.url).origin,
        ip: clientIp(request),
      })

      await supabase.from('payment_attempts').insert({
        donation_id: donation.id,
        provider_reference: outcome.providerReference,
        phone_last4: (body.phone as string).slice(-4),
        status: outcome.status,
        raw_status: outcome.rawCode,
      })

      if (outcome.status === 'succeeded') {
        await supabase.rpc('credit_donation', { p_donation_id: donation.id, p_provider_reference: outcome.providerReference })
        return json({ donationId: donation.id, status: 'succeeded' }, 201)
      }

      await supabase.from('donations').update({ status: outcome.status, updated_at: new Date().toISOString() }).eq('id', donation.id).eq('status', 'pending')
      return json({ donationId: donation.id, status: outcome.status, error: outcome.message }, 200)
    } catch (caught) {
      // Sifalo never accepted the charge, so no PIN prompt was ever sent and no money can
      // have moved. That is a failure to START the payment — report it plainly rather than
      // leaving the donor staring at a pending state that will never resolve.
      console.error('[donations] could not start charge for %s: %s', donation.id, caught instanceof Error ? caught.message : caught)
      await supabase.from('donations').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', donation.id).eq('status', 'pending')
      await supabase.from('payment_attempts').insert({
        donation_id: donation.id,
        provider_reference: donation.id,
        phone_last4: typeof body.phone === 'string' ? body.phone.slice(-4) : null,
        status: 'failed',
        raw_status: caught instanceof SifaloUnknownError ? 'no_response' : 'error',
      })
      return json({
        donationId: donation.id,
        status: 'failed',
        error: 'We could not start the payment. Nothing has been charged — please try again.',
      }, 200)
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
