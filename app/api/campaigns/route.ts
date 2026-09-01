import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'
import { isSafeImageUrl } from '@/lib/server/validation'
import { sendNotificationEmail, campaignReviewEmail } from '@/lib/server/email'

const categories = new Set(['Medical', 'Emergency', 'Community', 'Nonprofit', 'Education'])
const PHONE = /^\+?[1-9]\d{7,14}$/

/**
 * Abuse limits on campaign creation.
 *
 * Every new campaign lands in `under_review` and costs a human being time. Without a cap
 * one account can fill the review queue faster than staff can empty it — the cheapest
 * denial-of-service this platform has, and the first thing a fraudster reaches for while
 * hunting for a listing that slips through.
 *
 * Two limits, because one alone is escapable:
 *   - OPEN: how many campaigns may be live or awaiting review at once. Terminal states
 *     (rejected, removed, completed) are excluded — a finished fundraiser should not stop
 *     an organiser starting the next one.
 *   - DAILY: how many may be CREATED in a rolling day, terminal or not. This is what stops
 *     the create -> rejected -> create loop, which the OPEN cap alone never sees.
 */
const OPEN_STATUSES = ['under_review', 'active', 'paused'] as const
const MAX_OPEN_CAMPAIGNS = 3
const MAX_CAMPAIGNS_PER_DAY = 5

/** Same title modulo case, punctuation and spacing. "Help Amina!" == "help  amina". */
function normalisedTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** At least two distinct, reachable numbers so a reviewer can verify a real person. */
function validPhones(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const phones = value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter((entry) => entry !== '')
  if (phones.length < 2 || phones.length > 5) return null
  if (new Set(phones).size !== phones.length) return null
  if (phones.some((phone) => !PHONE.test(phone))) return null
  return phones
}

export async function GET() {
  const { data, error } = await createAdminClient().from('campaigns').select('id,title,description,category,goal_minor,raised_minor,status,image_url,created_at').eq('status', 'active').order('created_at', { ascending: false }).limit(50)
  if (error) return NextResponse.json({ error: 'Unable to load campaigns' }, { status: 500 })
  return NextResponse.json({ campaigns: data })
}

export async function POST(request: Request) {
  const user = await requireUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  try {
    const body = await request.json() as { title?: string; description?: string; category?: string; goalMinor?: number; imageUrl?: string; photos?: string[]; feePercent?: number; contactPhones?: unknown; identityDocumentPath?: string }
    const phones = validPhones(body.contactPhones)
    if (phones === null) return NextResponse.json({ error: 'Add at least two different contact numbers' }, { status: 400 })
    // The client sends a storage PATH it claims to have uploaded. Uploads are foldered by
    // uid, so requiring that prefix is what stops someone attaching another organiser's
    // identity document — or probing for one — by guessing a path.
    if (typeof body.identityDocumentPath !== 'string' || !body.identityDocumentPath.startsWith(`${user.id}/`) || body.identityDocumentPath.includes('..')) {
      return NextResponse.json({ error: 'Upload a photo of your passport or NIRA card' }, { status: 400 })
    }
    if (!body.title || body.title.length < 8 || body.title.length > 120 || !body.description || body.description.length < 20 || body.description.length > 10000 || !body.category || !categories.has(body.category) || typeof body.goalMinor !== 'number' || !Number.isSafeInteger(body.goalMinor) || body.goalMinor < 100) return NextResponse.json({ error: 'Invalid campaign details' }, { status: 400 })
    if (body.imageUrl !== undefined && body.imageUrl !== null && !isSafeImageUrl(body.imageUrl)) return NextResponse.json({ error: 'Campaign image must be a public https URL' }, { status: 400 })
    // Validate photos array
    const photos = Array.isArray(body.photos) ? body.photos.filter((p): p is string => typeof p === 'string' && isSafeImageUrl(p)) : []
    if (photos.length > 30) return NextResponse.json({ error: 'Maximum 30 photos per campaign' }, { status: 400 })
    // Validate fee percent
    const feePercent = typeof body.feePercent === 'number' && body.feePercent >= 0 && body.feePercent <= 100 ? body.feePercent : 6

    const supabase = createAdminClient()
    const title = body.title.trim()

    // Counted server-side against the service-role client, never inferred from anything the
    // client sent: a limit the caller can describe is not a limit.
    const { data: openRows, error: openError } = await supabase
      .from('campaigns')
      .select('id,title')
      .eq('owner_id', user.id)
      .in('status', OPEN_STATUSES)
    if (openError) return NextResponse.json({ error: 'Unable to create campaign' }, { status: 500 })
    const open = (openRows ?? []) as Array<{ id: string; title: string }>
    if (open.length >= MAX_OPEN_CAMPAIGNS) {
      return NextResponse.json({ error: `You already have ${MAX_OPEN_CAMPAIGNS} fundraisers open. Finish or close one before starting another.` }, { status: 409 })
    }

    // A resubmitted duplicate is nearly always either a double-tapped submit button or
    // someone gaming the feed with the same story twice. Both are worth refusing here
    // rather than in a reviewer's queue.
    if (open.some((row) => normalisedTitle(row.title) === normalisedTitle(title))) {
      return NextResponse.json({ error: 'You already have a fundraiser with this title.' }, { status: 409 })
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: today, error: countError } = await supabase
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .gte('created_at', since)
    if (countError) return NextResponse.json({ error: 'Unable to create campaign' }, { status: 500 })
    if ((today ?? 0) >= MAX_CAMPAIGNS_PER_DAY) {
      return NextResponse.json({ error: 'You have started too many fundraisers today. Please try again tomorrow.' }, { status: 429 })
    }

    const { data, error } = await supabase.from('campaigns').insert({ owner_id: user.id, title, description: body.description.trim(), category: body.category, goal_minor: body.goalMinor, image_url: body.imageUrl ?? null, photos, fee_percent: feePercent, contact_phones: phones, identity_document_path: body.identityDocumentPath, status: 'under_review' }).select('id,title,status').single()
    if (error) return NextResponse.json({ error: 'Unable to create campaign' }, { status: 500 })

    // Notify staff about the new campaign awaiting review (fire-and-forget)
    sendNotificationEmail(campaignReviewEmail({ id: String((data as Record<string, unknown>).id), title, ownerEmail: user.email })).catch(() => {})

    return NextResponse.json({ campaign: data }, { status: 201 })
  } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
}
