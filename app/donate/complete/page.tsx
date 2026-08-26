import Link from 'next/link'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { verifySifaloPayment, SifaloUnknownError } from '@/lib/server/sifalo'
import { formatMoney } from '@/lib/campaigns'
import { isUuid } from '@/lib/server/validation'

/**
 * Where Sifalo returns the payer after hosted checkout, as `?d=<donationId>&sid=<sid>`.
 *
 * SECURITY: everything in that query string is attacker-controlled — anyone can open this
 * URL with any values. So the sid is never believed on its own:
 *   1. the donation must exist and still be 'pending'
 *   2. Sifalo is asked directly what that sid actually settled
 *   3. the amount Sifalo reports must match the amount we recorded
 * Only then is credit_donation called. A forged sid fails at step 2, and a real sid for a
 * smaller payment fails at step 3.
 */

type Outcome = 'succeeded' | 'failed' | 'expired' | 'unverified' | 'mismatch' | 'invalid'

async function settle(donationId: string, sid: string): Promise<{ outcome: Outcome; amountMinor: number; currency: string; campaignId: string | null }> {
  const fallback = { amountMinor: 0, currency: 'USD', campaignId: null as string | null }
  if (!isUuid(donationId) || sid === '' || sid.length > 200) return { outcome: 'invalid', ...fallback }

  const supabase = createAdminClient()
  const { data: donation } = await supabase
    .from('donations')
    .select('id,status,amount_minor,currency,campaign_id')
    .eq('id', donationId)
    .maybeSingle()
  if (!donation) return { outcome: 'invalid', ...fallback }

  const context = {
    amountMinor: Number(donation.amount_minor),
    currency: typeof donation.currency === 'string' ? donation.currency : 'USD',
    campaignId: typeof donation.campaign_id === 'string' ? donation.campaign_id : null,
  }

  // Already settled by an earlier visit — this page is safe to reload.
  if (donation.status === 'succeeded') return { outcome: 'succeeded', ...context }
  if (donation.status === 'failed' || donation.status === 'expired') return { outcome: donation.status, ...context }

  let verified
  try {
    verified = await verifySifaloPayment(sid)
  } catch (caught) {
    console.error('[donate/complete] verify failed for %s: %s', donationId, caught instanceof SifaloUnknownError ? caught.message : caught)
    return { outcome: 'unverified', ...context }
  }

  if (verified.status !== 'succeeded') {
    await supabase.from('donations').update({ status: verified.status, updated_at: new Date().toISOString() }).eq('id', donationId).eq('status', 'pending')
    await supabase.from('payment_attempts').update({ status: verified.status, raw_status: verified.rawCode, updated_at: new Date().toISOString() }).eq('donation_id', donationId)
    return { outcome: verified.status, ...context }
  }

  // Paid — but only credit what Sifalo confirms, and only if it matches our record.
  if (verified.amountMinor !== null && verified.amountMinor !== context.amountMinor) {
    console.error('[donate/complete] amount mismatch on %s: sifalo=%s ours=%s', donationId, verified.amountMinor, context.amountMinor)
    await supabase.from('payment_attempts').update({ status: 'amount_mismatch', raw_status: verified.rawCode, updated_at: new Date().toISOString() }).eq('donation_id', donationId)
    return { outcome: 'mismatch', ...context }
  }

  await supabase.rpc('credit_donation', { p_donation_id: donationId, p_provider_reference: sid })
  await supabase.from('payment_attempts').update({ status: 'succeeded', raw_status: verified.rawCode, updated_at: new Date().toISOString() }).eq('donation_id', donationId)
  return { outcome: 'succeeded', ...context }
}

const COPY: Record<Outcome, { eyebrow: string; title: string; body: string }> = {
  succeeded: { eyebrow: 'Thank you', title: 'Your donation went through.', body: 'The organiser has been notified and the campaign total is updated.' },
  failed: { eyebrow: 'Not completed', title: 'That payment did not go through.', body: 'No money has left your account. You can try again whenever you are ready.' },
  expired: { eyebrow: 'Timed out', title: 'The request expired.', body: 'The confirmation window closed before the payment was approved. Starting again takes a moment.' },
  unverified: { eyebrow: 'Not confirmed', title: 'We could not reach Sifalo to confirm.', body: 'Your donation is recorded as pending. Do not pay again — if money left your account it will be credited once we reconcile.' },
  mismatch: { eyebrow: 'Needs review', title: 'The amount did not match.', body: 'Sifalo reported a different amount than we recorded, so nothing was credited. Our team will review this and contact you.' },
  invalid: { eyebrow: 'Not found', title: 'We could not find that donation.', body: 'The link may be incomplete. Check your profile to see whether the payment completed.' },
}

export default async function DonateCompletePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const pick = (key: string) => { const raw = params[key]; return (Array.isArray(raw) ? raw[0] : raw) ?? '' }

  const result = await settle(pick('d'), pick('sid'))
  const copy = COPY[result.outcome]

  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto flex min-h-screen max-w-[470px] flex-col justify-center border-x border-border px-6">
    <p className="eyebrow">{copy.eyebrow}</p>
    <h1 className="mt-3 font-serif text-[30px] font-semibold leading-tight tracking-[-0.02em]">{copy.title}</h1>
    {result.outcome === 'succeeded' && result.amountMinor > 0 && (
      <p className="mt-4 font-serif text-2xl tnum">{formatMoney(result.amountMinor, result.currency)}</p>
    )}
    <p className="mt-3 text-sm leading-7 text-muted-foreground">{copy.body}</p>
    <div className="mt-8 space-y-3">
      {result.campaignId !== null && (
        <Link href={`/campaigns/${result.campaignId}`} className="confirm-button">Back to the campaign</Link>
      )}
      <Link href="/profile" className="block py-1 text-center text-xs font-bold text-primary">See your donations</Link>
    </div>
  </div></main>
}
