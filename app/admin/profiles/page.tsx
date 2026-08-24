import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { formatMoney, initials } from '@/lib/campaigns'
import { EmptyState, SectionHeading } from '../_components/admin-ui'
import { embedded, requireStaff, shortDate } from '../_lib/admin'

type OwnerEmbed = { display_name: string | null; created_at: string }
type CampaignRow = {
  owner_id: string
  status: string
  raised_minor: number
  donor_count: number
  currency: string
  profiles: OwnerEmbed | OwnerEmbed[] | null
}

type Organiser = {
  id: string
  name: string
  joinedAt: string | null
  currency: string
  campaignCount: number
  activeCount: number
  raisedMinor: number
  donorCount: number
}

export default async function AdminProfilesPage() {
  const { supabase } = await requireStaff()

  // An organiser is a profile that owns at least one campaign, so the campaigns table is
  // the source list. Profiles with no campaign are none of this console's business.
  const { data } = await supabase
    .from('campaigns')
    .select('owner_id,status,raised_minor,donor_count,currency,profiles!campaigns_owner_id_fkey(display_name,created_at)')
    .limit(1000)

  const rows = (data ?? []) as unknown as CampaignRow[]
  const byOwner = new Map<string, Organiser>()
  for (const row of rows) {
    const profile = embedded(row.profiles)
    const existing = byOwner.get(row.owner_id) ?? {
      id: row.owner_id,
      name: profile?.display_name?.trim() || 'Unnamed organiser',
      joinedAt: profile?.created_at ?? null,
      currency: row.currency,
      campaignCount: 0,
      activeCount: 0,
      raisedMinor: 0,
      donorCount: 0,
    }
    existing.campaignCount += 1
    if (row.status === 'active') existing.activeCount += 1
    existing.raisedMinor += Number(row.raised_minor)
    existing.donorCount += Number(row.donor_count)
    byOwner.set(row.owner_id, existing)
  }

  const organisers = [...byOwner.values()].sort((a, b) => b.raisedMinor - a.raisedMinor)

  return <div>
    <SectionHeading eyebrow="the people behind it" title="Organisers on kindred." />

    {organisers.length === 0 ? <EmptyState title="No organisers yet." body="Anyone who starts a campaign shows up here with what they have raised." /> : <>
      <p className="mt-4 text-xs text-muted-foreground">{organisers.length} {organisers.length === 1 ? 'person has' : 'people have'} started a campaign</p>
      <ul className="mt-3 space-y-2.5">{organisers.map((organiser) => <li key={organiser.id}>
        <Link href={`/admin/campaigns?owner=${organiser.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          <span className="mini-avatar" aria-hidden="true">{initials(organiser.name)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{organiser.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {organiser.campaignCount} {organiser.campaignCount === 1 ? 'campaign' : 'campaigns'} · {organiser.activeCount} active · {organiser.donorCount} {organiser.donorCount === 1 ? 'donor' : 'donors'}
              {organiser.joinedAt !== null && ` · joined ${shortDate(organiser.joinedAt)}`}
            </span>
          </span>
          <span className="shrink-0 text-right"><span className="block text-sm font-bold">{formatMoney(organiser.raisedMinor, organiser.currency)}</span><span className="text-[10px] text-muted-foreground">raised</span></span>
          <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
        </Link>
      </li>)}</ul>
    </>}
  </div>
}
