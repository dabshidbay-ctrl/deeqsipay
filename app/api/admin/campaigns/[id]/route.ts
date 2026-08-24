import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getRole, rpcFailure } from '@/lib/server/auth'
import { isUuid } from '@/lib/server/validation'

// Admin-only moderation. A moderator sees this campaign in the list but gets 403 here:
// read-only is enforced on the server, not by hiding a button (CONTRACT rule 5).
// The status change itself goes through set_campaign_status, which re-checks the actor's
// role inside the function — this route never UPDATEs campaigns.status directly.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const STATUSES = new Set(['under_review', 'active', 'paused', 'hidden', 'completed', 'rejected', 'removed'])

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getRole(request)
  if (!actor) return json({ error: 'Authentication required' }, 401)
  if (actor.role !== 'admin') return json({ error: 'Forbidden' }, 403)

  const { id } = await params
  if (!isUuid(id)) return json({ error: 'Invalid campaign id' }, 400)

  try {
    const body = await request.json() as { status?: unknown; note?: unknown }
    if (typeof body.status !== 'string' || !STATUSES.has(body.status)) return json({ error: 'Invalid status' }, 400)
    if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') return json({ error: 'Invalid note' }, 400)

    const supabase = createAdminClient()
    const { error } = await supabase.rpc('set_campaign_status', { p_campaign_id: id, p_admin_id: actor.user.id, p_status: body.status, p_note: typeof body.note === 'string' ? body.note : null })
    if (error) {
      const failure = rpcFailure(error)
      return json({ error: failure.error }, failure.status)
    }

    const { data } = await supabase.from('campaigns').select('id,title,status,owner_id,created_at').eq('id', id).maybeSingle()
    const row = data as { id: string; title: string; status: string; owner_id: string; created_at: string } | null
    if (!row) return json({ error: 'Not found' }, 404)
    return json({ campaign: { id: row.id, title: row.title, status: row.status, ownerId: row.owner_id, createdAt: row.created_at } })
  } catch { return json({ error: 'Invalid request' }, 400) }
}
