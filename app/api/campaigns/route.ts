import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'
import { isSafeImageUrl } from '@/lib/server/validation'

const categories = new Set(['Medical', 'Emergency', 'Community', 'Nonprofit', 'Education'])
const PHONE = /^\+?[1-9]\d{7,14}$/

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
    const body = await request.json() as { title?: string; description?: string; category?: string; goalMinor?: number; imageUrl?: string; contactPhones?: unknown; identityDocumentPath?: string }
    const phones = validPhones(body.contactPhones)
    if (phones === null) return NextResponse.json({ error: 'Add at least two different contact numbers' }, { status: 400 })
    // The client sends a storage PATH it claims to have uploaded. Uploads are foldered by
    // uid, so requiring that prefix is what stops someone attaching another organiser's
    // identity document — or probing for one — by guessing a path.
    if (typeof body.identityDocumentPath !== 'string' || !body.identityDocumentPath.startsWith(`${user.id}/`) || body.identityDocumentPath.includes('..')) {
      return NextResponse.json({ error: 'Upload a photo of your passport or NIRA card' }, { status: 400 })
    }
    if (!body.title || body.title.length < 8 || body.title.length > 120 || !body.description || body.description.length < 20 || body.description.length > 5000 || !body.category || !categories.has(body.category) || typeof body.goalMinor !== 'number' || !Number.isSafeInteger(body.goalMinor) || body.goalMinor < 100) return NextResponse.json({ error: 'Invalid campaign details' }, { status: 400 })
    if (body.imageUrl !== undefined && body.imageUrl !== null && !isSafeImageUrl(body.imageUrl)) return NextResponse.json({ error: 'Campaign image must be a public https URL' }, { status: 400 })
    const { data, error } = await createAdminClient().from('campaigns').insert({ owner_id: user.id, title: body.title.trim(), description: body.description.trim(), category: body.category, goal_minor: body.goalMinor, image_url: body.imageUrl ?? null, contact_phones: phones, identity_document_path: body.identityDocumentPath, status: 'under_review' }).select('id,title,status').single()
    if (error) return NextResponse.json({ error: 'Unable to create campaign' }, { status: 500 })
    return NextResponse.json({ campaign: data }, { status: 201 })
  } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
}
