import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'

// Public donor list. This endpoint is unauthenticated, so what it returns is what the
// whole internet sees. Two rules hold the privacy model together:
//   1. donor_id is NEVER returned. profiles are publicly readable, so leaking the id
//      would let anyone resolve an "Anonymous" donation back to a real person.
//   2. Anonymous rows are collapsed to the literal string 'Anonymous' before the
//      response is built, so no real name is ever serialised for them.
// Only succeeded donations appear; pending ones would leak intent to pay.

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_LIMIT = 5
const MAX_LIMIT = 50

type DonorRow = {
  amount_minor: number
  currency: string
  created_at: string
  is_anonymous: boolean
  profiles: { display_name: string | null } | { display_name: string | null }[] | null
}

function displayNameOf(row: DonorRow): string {
  if (row.is_anonymous) return 'Anonymous'
  const profile = Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles
  const name = profile?.display_name?.trim() ?? ''
  return name.length > 0 ? name : 'Anonymous'
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!uuidPattern.test(id)) return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })

  const url = new URL(request.url)
  const requested = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const limit = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT
  const offsetRaw = Number(url.searchParams.get('offset') ?? 0)
  const offset = Number.isSafeInteger(offsetRaw) && offsetRaw >= 0 ? Math.min(offsetRaw, 5000) : 0

  const supabase = createAdminClient()

  // Only expose donors for a campaign the public can actually see.
  const { data: campaign } = await supabase.from('campaigns').select('id').eq('id', id).eq('status', 'active').maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const { data, error, count } = await supabase
    .from('donations')
    .select('amount_minor,currency,created_at,is_anonymous,profiles!donations_donor_id_fkey(display_name)', { count: 'exact' })
    .eq('campaign_id', id)
    .eq('status', 'succeeded')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) return NextResponse.json({ error: 'Unable to load donors' }, { status: 500 })

  const rows = (data ?? []) as unknown as DonorRow[]
  const total = count ?? rows.length
  return NextResponse.json({
    donors: rows.map((row) => ({
      name: displayNameOf(row),
      amountMinor: Number(row.amount_minor),
      currency: row.currency ?? 'USD',
      createdAt: row.created_at,
      anonymous: row.is_anonymous,
    })),
    total,
    hasMore: offset + rows.length < total,
  })
}
