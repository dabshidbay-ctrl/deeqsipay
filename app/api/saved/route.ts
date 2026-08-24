import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type SavedCampaign = { id: string; title: string; category: string; goal_minor: number; raised_minor: number; donor_count: number; image_url: string | null }
// PostgREST returns an object for this to-one embed, but supabase-js types embeds as
// arrays without generated DB types. Accept either shape.
type SavedCampaignRow = { campaigns: SavedCampaign | SavedCampaign[] | null }

export async function GET(request: Request) {
  const user = await requireUser(request)
  if (!user) return json({ error: 'Authentication required' }, 401)
  const { data, error } = await createAdminClient().from('saved_campaigns').select('campaigns!saved_campaigns_campaign_id_fkey(id,title,category,goal_minor,raised_minor,donor_count,image_url)').eq('user_id', user.id).order('created_at', { ascending: false })
  if (error) return json({ error: 'Unable to load saved campaigns' }, 500)
  const rows = (data ?? []) as unknown as SavedCampaignRow[]
  return json({ campaigns: rows.flatMap((row) => (row.campaigns ? (Array.isArray(row.campaigns) ? row.campaigns : [row.campaigns]) : [])) })
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    if (!user) return json({ error: 'Authentication required' }, 401)
    const body = await request.json() as { campaignId?: string }
    if (!body.campaignId || !uuidPattern.test(body.campaignId)) return json({ error: 'Invalid campaign id' }, 400)
    const supabase = createAdminClient()
    const { data: campaign } = await supabase.from('campaigns').select('id').eq('id', body.campaignId).eq('status', 'active').maybeSingle()
    if (!campaign) return json({ error: 'Campaign unavailable' }, 404)
    const { error } = await supabase.from('saved_campaigns').upsert({ user_id: user.id, campaign_id: campaign.id }, { ignoreDuplicates: true })
    if (error) return json({ error: 'Unable to save campaign' }, 500)
    return json({ saved: true })
  } catch { return json({ error: 'Invalid request' }, 400) }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser(request)
    if (!user) return json({ error: 'Authentication required' }, 401)
    const body = await request.json() as { campaignId?: string }
    if (!body.campaignId || !uuidPattern.test(body.campaignId)) return json({ error: 'Invalid campaign id' }, 400)
    const { error } = await createAdminClient().from('saved_campaigns').delete().eq('user_id', user.id).eq('campaign_id', body.campaignId)
    if (error) return json({ error: 'Unable to remove saved campaign' }, 500)
    return json({ saved: false })
  } catch { return json({ error: 'Invalid request' }, 400) }
}
