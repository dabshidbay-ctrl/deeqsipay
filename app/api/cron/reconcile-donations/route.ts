import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'

/**
 * Sifalo's gateway API is synchronous and offers NO webhook and NO way to look a charge
 * up after the fact. So a donation can only be left 'pending' when our request to Sifalo
 * timed out or the connection dropped — and in that case the true outcome is genuinely
 * unknowable from our side.
 *
 * This job therefore does NOT confirm payments; it cannot. It ages out stale unknowns so
 * they stop sitting in the UI forever, and reports what it found so a human can settle
 * them against the Sifalo merchant portal. Anything it expires may still have been paid,
 * which is exactly why it never touches raised_minor.
 */

const STALE_AFTER_MS = 30 * 60 * 1000
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const BATCH = 200

function authorised(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  const a = Buffer.from(header)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function reconcile(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const now = Date.now()
  const { data, error } = await supabase
    .from('donations')
    .select('id,created_at,amount_minor,currency,campaign_id')
    .eq('status', 'pending')
    .lt('created_at', new Date(now - STALE_AFTER_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(BATCH)
  if (error) return NextResponse.json({ error: 'Unable to load pending donations' }, { status: 500 })

  const pending = data ?? []
  const expirable = pending.filter((donation) => now - new Date(donation.created_at).getTime() > MAX_AGE_MS)

  if (expirable.length > 0) {
    await supabase
      .from('donations')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .in('id', expirable.map((donation) => donation.id))
      .eq('status', 'pending')
  }

  // Everything still listed here needs a person to check the Sifalo portal.
  return NextResponse.json({
    needsManualSettlement: pending.length - expirable.length,
    expired: expirable.length,
    oldestPendingAt: pending[0]?.created_at ?? null,
  })
}

/**
 * Vercel Cron calls the schedule in vercel.json with a GET, and — because CRON_SECRET is
 * set in the project — attaches `Authorization: Bearer $CRON_SECRET` itself, which is
 * exactly what authorised() checks. POST is kept so an operator can force a run by hand:
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/reconcile-donations
 *
 * Both verbs run the same body; neither is safe to expose without the secret.
 */
export async function GET(request: Request) { return reconcile(request) }
export async function POST(request: Request) { return reconcile(request) }
