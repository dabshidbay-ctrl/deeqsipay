import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { formatMoney, initials, progressPercent } from '@/lib/campaigns'
import { ReadOnlyNote, StatusBadge } from '../../_components/admin-ui'
import { embedded, requireStaff, shortDate } from '../../_lib/admin'
import { CampaignActions } from './campaign-actions'

type OwnerEmbed = { display_name: string | null }
type CampaignDetail = {
  id: string
  title: string
  description: string
  category: string
  status: string
  goal_minor: number
  raised_minor: number
  donor_count: number
  currency: string
  image_url: string | null
  ends_at: string | null
  created_at: string
  owner_id: string
  review_note: string | null
  reviewed_at: string | null
  profiles: OwnerEmbed | OwnerEmbed[] | null
}

export default async function AdminCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { role, supabase } = await requireStaff()
  const { id } = await params

  const { data } = await supabase
    .from('campaigns')
    .select('id,title,description,category,status,goal_minor,raised_minor,donor_count,currency,image_url,ends_at,created_at,owner_id,review_note,reviewed_at,profiles!campaigns_owner_id_fkey(display_name)')
    .eq('id', id)
    .maybeSingle()

  const campaign = (data ?? null) as unknown as CampaignDetail | null
  if (campaign === null) notFound()

  const owner = embedded(campaign.profiles)
  const person = owner?.display_name?.trim() || 'Unnamed organiser'
  const percent = progressPercent(campaign.raised_minor, campaign.goal_minor)

  return <div>
    <header className="flex items-center gap-4 pb-5 pt-2">
      <Link href="/admin/campaigns" aria-label="Back to campaigns" className="icon-button"><ArrowLeft size={18} /></Link>
      <div className="min-w-0">
        <p className="eyebrow">Campaign review</p>
        <h1 className="font-serif text-2xl leading-tight tracking-[-0.03em]">{campaign.title}</h1>
      </div>
    </header>

    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="mini-avatar" aria-hidden="true">{initials(person)}</span>
          <span className="truncate text-xs text-muted-foreground">by <strong className="text-foreground">{person}</strong></span>
        </span>
        <StatusBadge status={campaign.status} />
      </div>
      <div className="progress-track mt-4"><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span><strong className="text-foreground">{formatMoney(campaign.raised_minor, campaign.currency)}</strong> of {formatMoney(campaign.goal_minor, campaign.currency)}</span>
        <span>{campaign.donor_count} {campaign.donor_count === 1 ? 'donor' : 'donors'} · {percent}%</span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 text-xs md:grid-cols-4">
        <div><dt className="text-muted-foreground">Category</dt><dd className="mt-1 font-semibold">{campaign.category}</dd></div>
        <div><dt className="text-muted-foreground">Started</dt><dd className="mt-1 font-semibold">{shortDate(campaign.created_at)}</dd></div>
        <div><dt className="text-muted-foreground">Ends</dt><dd className="mt-1 font-semibold">{campaign.ends_at === null ? 'Open ended' : shortDate(campaign.ends_at)}</dd></div>
        <div><dt className="text-muted-foreground">Last reviewed</dt><dd className="mt-1 font-semibold">{campaign.reviewed_at === null ? 'Never' : shortDate(campaign.reviewed_at)}</dd></div>
      </dl>
      {campaign.review_note !== null && campaign.review_note.trim() !== '' && <p className="mt-5 rounded-xl bg-muted p-3 text-xs leading-6"><strong className="block font-semibold">Last review note</strong>{campaign.review_note}</p>}
    </section>

    <section className="mt-6">
      <p className="eyebrow">The story as told</p>
      {campaign.image_url !== null && <img src={campaign.image_url} alt="" className="campaign-image mt-3 rounded-2xl" />}
      <p className="mt-3 whitespace-pre-line text-sm leading-7">{campaign.description}</p>
    </section>

    <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold text-primary">
      <Link href={`/admin/transactions?campaignId=${campaign.id}`}>Donations to this campaign</Link>
      <span className="text-muted-foreground">·</span>
      <Link href={`/admin/payouts?campaignId=${campaign.id}`}>Payouts</Link>
      <span className="text-muted-foreground">·</span>
      <Link href={`/campaigns/${campaign.id}`} className="inline-flex items-center gap-1">Public page <ExternalLink size={12} /></Link>
    </div>

    {role === 'admin'
      ? <CampaignActions campaignId={campaign.id} currentStatus={campaign.status} />
      : <div className="mt-8 rounded-2xl border border-dashed border-border p-5">
          <p className="eyebrow">Moderator actions</p>
          <ReadOnlyNote className="mt-2 text-sm leading-6" />
        </div>}
  </div>
}
