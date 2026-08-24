import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getRole } from '@/lib/server/auth'
import { isUuid } from '@/lib/server/validation'

// Every donation across every campaign. Read-only, so moderators are allowed in.
// `is_anonymous` only hides a donor from the PUBLIC donor list; the admin ledger needs the
// real name for support and fraud work, so the flag is returned alongside the name rather
// than used to blank it.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const STAFF = new Set(['admin', 'moderator'])
const STATUSES = new Set(['pending', 'succeeded', 'failed', 'expired'])
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

type Ref<T> = T | T[] | null
type DonationRow = {
  id: string
  amount_minor: number
  currency: string | null
  status: string
  is_anonymous: boolean
  provider_reference: string | null
  created_at: string
  campaign_id: string
  donor_id: string
  campaigns: Ref<{ id: string; title: string }>
  profiles: Ref<{ display_name: string | null }>
}

function one<T>(value: Ref<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

export async function GET(request: Request) {
  const actor = await getRole(request)
  if (!actor) return json({ error: 'Authentication required' }, 401)
  if (!STAFF.has(actor.role)) return json({ error: 'Forbidden' }, 403)

  const url = new URL(request.url)
  const requested = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const limit = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT
  const offsetRaw = Number(url.searchParams.get('offset') ?? 0)
  const offset = Number.isSafeInteger(offsetRaw) && offsetRaw >= 0 ? Math.min(offsetRaw, 100000) : 0

  const status = url.searchParams.get('status')
  if (status !== null && !STATUSES.has(status)) return json({ error: 'Invalid status filter' }, 400)
  const campaignId = url.searchParams.get('campaignId')
  if (campaignId !== null && !isUuid(campaignId)) return json({ error: 'Invalid campaign id' }, 400)

  let query = createAdminClient()
    .from('donations')
    .select('id,amount_minor,currency,status,is_anonymous,provider_reference,created_at,campaign_id,donor_id,campaigns(id,title),profiles!donations_donor_id_fkey(display_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
  if (status !== null) query = query.eq('status', status)
  if (campaignId !== null) query = query.eq('campaign_id', campaignId)

  const { data, error, count } = await query.range(offset, offset + limit - 1)
  if (error) return json({ error: 'Unable to load transactions' }, 500)

  const rows = (data ?? []) as unknown as DonationRow[]
  return json({
    transactions: rows.map((row) => ({
      id: row.id,
      amountMinor: Number(row.amount_minor),
      currency: row.currency ?? 'USD',
      status: row.status,
      anonymous: row.is_anonymous === true,
      providerReference: row.provider_reference,
      createdAt: row.created_at,
      campaign: { id: row.campaign_id, title: one(row.campaigns)?.title ?? null },
      donor: { id: row.donor_id, displayName: one(row.profiles)?.display_name ?? null },
    })),
    total: count ?? rows.length,
  })
}
