import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { formatMoney, initials, progressPercent } from '@/lib/campaigns'
import { EmptyState, FilterPills, SectionHeading, StatusBadge } from '../_components/admin-ui'
import { CAMPAIGN_STATUSES, embedded, firstParam, pickStatus, requireStaff, shortDate, statusLabel } from '../_lib/admin'

const PAGE_LIMIT = 200
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type OwnerEmbed = { display_name: string | null }
type CampaignRow = {
  id: string
  title: string
  status: string
  goal_minor: number
  raised_minor: number
  donor_count: number
  currency: string
  created_at: string
  profiles: OwnerEmbed | OwnerEmbed[] | null
}

export default async function AdminCampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await requireStaff()
  const params = await searchParams
  const status = pickStatus(firstParam(params, 'status'), CAMPAIGN_STATUSES)
  const ownerParam = firstParam(params, 'owner')
  const owner = UUID.test(ownerParam) ? ownerParam : null

  let query = supabase
    .from('campaigns')
    .select('id,title,status,goal_minor,raised_minor,donor_count,currency,created_at,profiles!campaigns_owner_id_fkey(display_name)')
    .order('created_at', { ascending: false })
    .limit(PAGE_LIMIT)
  if (status !== null) query = query.eq('status', status)
  if (owner !== null) query = query.eq('owner_id', owner)

  const { data } = await query
  const campaigns = (data ?? []) as unknown as CampaignRow[]

  return <div>
    <SectionHeading eyebrow="moderation queue" title="Every campaign, in every state." />
    {owner !== null && <p className="mt-2 text-sm text-muted-foreground">Filtered to one organiser. <Link href="/admin/campaigns" className="font-bold text-primary">Show every organiser</Link></p>}
    <FilterPills base="/admin/campaigns" current={status} options={CAMPAIGN_STATUSES} extra={owner === null ? undefined : { owner }} />

    {campaigns.length === 0 ? <EmptyState
      title={status === null ? 'No campaigns yet.' : `Nothing is ${statusLabel(status)}.`}
      body={status === null ? 'When someone starts a fundraiser it arrives here for review.' : 'Try another filter, or clear it to see every campaign.'}
    /> : <>
      <ul className="mt-5 space-y-3">{campaigns.map((campaign) => {
        const owner = embedded(campaign.profiles)
        const person = owner?.display_name?.trim() || 'Unnamed organiser'
        const percent = progressPercent(campaign.raised_minor, campaign.goal_minor)
        return <li key={campaign.id}>
          <Link href={`/admin/campaigns/${campaign.id}`} className="block rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-serif text-lg leading-tight">{campaign.title}</h2>
                <span className="mt-2 flex items-center gap-2">
                  <span className="mini-avatar" aria-hidden="true">{initials(person)}</span>
                  <span className="truncate text-xs text-muted-foreground">by <strong className="text-foreground">{person}</strong> · started {shortDate(campaign.created_at)}</span>
                </span>
              </div>
              <span className="flex shrink-0 items-center gap-2"><StatusBadge status={campaign.status} /><ChevronRight size={16} className="text-muted-foreground" /></span>
            </div>
            <div className="progress-track mt-3"><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span><strong className="text-foreground">{formatMoney(campaign.raised_minor, campaign.currency)}</strong> of {formatMoney(campaign.goal_minor, campaign.currency)}</span>
              <span>{campaign.donor_count} {campaign.donor_count === 1 ? 'donor' : 'donors'} · {percent}%</span>
            </div>
          </Link>
        </li>
      })}</ul>
      {campaigns.length === PAGE_LIMIT && <p className="mt-4 text-xs text-muted-foreground">Showing the {PAGE_LIMIT} most recent. Narrow it with a status filter to see further back.</p>}
    </>}
  </div>
}
