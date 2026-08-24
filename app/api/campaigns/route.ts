import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'
import { isSafeImageUrl } from '@/lib/server/validation'

const categories = new Set(['Medical', 'Emergency', 'Community', 'Nonprofit', 'Education'])

export async function GET() {
  const { data, error } = await createAdminClient().from('campaigns').select('id,title,description,category,goal_minor,raised_minor,status,image_url,created_at').eq('status', 'active').order('created_at', { ascending: false }).limit(50)
  if (error) return NextResponse.json({ error: 'Unable to load campaigns' }, { status: 500 })
  return NextResponse.json({ campaigns: data })
}

export async function POST(request: Request) {
  const user = await requireUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  try {
    const body = await request.json() as { title?: string; description?: string; category?: string; goalMinor?: number; imageUrl?: string }
    if (!body.title || body.title.length < 8 || body.title.length > 120 || !body.description || body.description.length < 20 || body.description.length > 5000 || !body.category || !categories.has(body.category) || typeof body.goalMinor !== 'number' || !Number.isSafeInteger(body.goalMinor) || body.goalMinor < 100) return NextResponse.json({ error: 'Invalid campaign details' }, { status: 400 })
    if (body.imageUrl !== undefined && body.imageUrl !== null && !isSafeImageUrl(body.imageUrl)) return NextResponse.json({ error: 'Campaign image must be a public https URL' }, { status: 400 })
    const { data, error } = await createAdminClient().from('campaigns').insert({ owner_id: user.id, title: body.title.trim(), description: body.description.trim(), category: body.category, goal_minor: body.goalMinor, image_url: body.imageUrl ?? null, status: 'active' }).select('id,title,status').single()
    if (error) return NextResponse.json({ error: 'Unable to create campaign' }, { status: 500 })
    return NextResponse.json({ campaign: data }, { status: 201 })
  } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
}
