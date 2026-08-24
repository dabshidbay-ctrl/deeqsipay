import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'

const categories = new Set(['Medical', 'Emergency', 'Community', 'Nonprofit', 'Education'])
const statuses = new Set(['active', 'paused', 'completed'])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!uuidPattern.test(id)) return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
  const { data, error } = await createAdminClient().from('campaigns').select('id,owner_id,title,description,category,goal_minor,raised_minor,donor_count,currency,status,image_url,ends_at,created_at,profiles!campaigns_owner_id_fkey(display_name,avatar_url)').eq('id', id).eq('status', 'active').maybeSingle()
  if (error) return NextResponse.json({ error: 'Unable to load campaign' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  return NextResponse.json({ campaign: data })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const { id } = await params
  if (!uuidPattern.test(id)) return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
  try {
    const body = await request.json() as { title?: string; description?: string; category?: string; imageUrl?: string | null; status?: string }
    const patch: { title?: string; description?: string; category?: string; image_url?: string | null; status?: string } = {}
    if (body.title !== undefined) {
      const title = body.title.trim()
      if (title.length < 8 || title.length > 120) return NextResponse.json({ error: 'Invalid campaign details' }, { status: 400 })
      patch.title = title
    }
    if (body.description !== undefined) {
      const description = body.description.trim()
      if (description.length < 20 || description.length > 5000) return NextResponse.json({ error: 'Invalid campaign details' }, { status: 400 })
      patch.description = description
    }
    if (body.category !== undefined) {
      if (!categories.has(body.category)) return NextResponse.json({ error: 'Invalid campaign details' }, { status: 400 })
      patch.category = body.category
    }
    if (body.imageUrl !== undefined) {
      if (body.imageUrl !== null && typeof body.imageUrl !== 'string') return NextResponse.json({ error: 'Invalid campaign details' }, { status: 400 })
      patch.image_url = body.imageUrl
    }
    if (body.status !== undefined) {
      if (!statuses.has(body.status)) return NextResponse.json({ error: 'Invalid campaign details' }, { status: 400 })
      patch.status = body.status
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Invalid campaign details' }, { status: 400 })
    const { data, error } = await createAdminClient().from('campaigns').update(patch).eq('id', id).eq('owner_id', user.id).select('id,title,status').maybeSingle()
    if (error) return NextResponse.json({ error: 'Unable to update campaign' }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    return NextResponse.json({ campaign: data })
  } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
}
