import { createAuthClient } from '@/lib/server/supabase-admin'
import { mapCampaignRow, type Campaign } from '@/lib/campaigns'

// Explicit columns, not '*': keeps the payload stable if the table gains columns.
const CAMPAIGN_SELECT = 'id,title,description,category,goal_minor,raised_minor,donor_count,currency,image_url,ends_at,created_at, profiles!campaigns_owner_id_fkey(display_name, avatar_url)'
const DEFAULT_LIMIT = 50

export async function listCampaigns(opts?: { category?: string; limit?: number }): Promise<Campaign[]> {
  const supabase = createAuthClient()
  let query = supabase
    .from('campaigns')
    .select(CAMPAIGN_SELECT)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  const category = opts?.category
  if (category !== undefined && category !== 'For you') query = query.eq('category', category)

  const { data, error } = await query.limit(opts?.limit ?? DEFAULT_LIMIT)
  if (error !== null || data === null) return []
  return (data as Record<string, unknown>[]).map(mapCampaignRow)
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const supabase = createAuthClient()
  const { data, error } = await supabase
    .from('campaigns')
    .select(CAMPAIGN_SELECT)
    .eq('id', id)
    .eq('status', 'active')
    .maybeSingle()

  if (error !== null || data === null) return null
  return mapCampaignRow(data as Record<string, unknown>)
}
