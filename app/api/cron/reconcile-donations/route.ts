import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getSifaloPayment } from '@/lib/server/sifalo'

// Webhooks get lost: the provider drops one, our 500 exhausts its retries, or the
// create call timed out after the charge already existed upstream. Without this sweep
// those donations stay 'pending' forever and the campaign is never credited.

const STALE_AFTER_MS = 5 * 60 * 1000
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // older than this is written off as expired
const BATCH = 50

type PendingDonation = { id: string; created_at: string; payment_attempts: { provider_reference: string }[] | null }

function authorised(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  const a = Buffer.from(header)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString()
  const { data, error } = await supabase
    .from('donations')
    .select('id,created_at,payment_attempts(provider_reference)')
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(BATCH)
  if (error) return NextResponse.json({ error: 'Unable to load pending donations' }, { status: 500 })

  const pending = (data ?? []) as unknown as PendingDonation[]
  let credited = 0
  let failed = 0
  let stillPending = 0

  for (const donation of pending) {
    // Fall back to donation.id: that is the `reference` we sent the provider, and it is
    // all we have when the create call timed out before an attempt row was written.
    const reference = donation.payment_attempts?.[0]?.provider_reference ?? donation.id
    try {
      const result = await getSifaloPayment(reference)
      if (result.status === 'succeeded') {
        await supabase.rpc('credit_donation', { p_donation_id: donation.id, p_provider_reference: result.providerReference })
        credited += 1
      } else if (result.status === 'failed' || result.status === 'expired') {
        await supabase.from('donations').update({ status: result.status, updated_at: new Date().toISOString() }).eq('id', donation.id).eq('status', 'pending')
        failed += 1
      } else if (Date.now() - new Date(donation.created_at).getTime() > MAX_AGE_MS) {
        await supabase.from('donations').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', donation.id).eq('status', 'pending')
        failed += 1
      } else {
        stillPending += 1
      }
    } catch {
      // Provider unreachable for this one; the next sweep retries it.
      stillPending += 1
    }
  }

  return NextResponse.json({ examined: pending.length, credited, failed, stillPending })
}
