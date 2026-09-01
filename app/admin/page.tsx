import Link from 'next/link'
import { ChevronRight, ClipboardCheck, Wallet } from 'lucide-react'
import { formatMoney } from '@/lib/campaigns'
import { EmptyState, SectionHeading, StatusBadge } from './_components/admin-ui'
import { CAMPAIGN_STATUSES, requireStaff, statusLabel } from './_lib/admin'

type CampaignRow = { status: string; raised_minor: number; currency: string }
type PayoutRow = { status: string; amount_minor: number; currency: string }

export default async function AdminOverviewPage() {
  const { supabase } = await requireStaff()

  const [{ data: campaignData }, { data: payoutData }] = await Promise.all([
    supabase.from('campaigns').select('status,raised_minor,currency'),
    supabase.from('payouts').select('status,amount_minor,currency'),
  ])

  const campaigns = (campaignData ?? []) as CampaignRow[]
  const payouts = (payoutData ?? []) as PayoutRow[]

  const currency = campaigns[0]?.currency ?? payouts[0]?.currency ?? 'USD'
  const raisedMinor = campaigns.reduce((sum, campaign) => sum + Number(campaign.raised_minor), 0)
  const countFor = (status: string) => campaigns.filter((campaign) => campaign.status === status).length
  const awaitingReview = countFor('under_review')
  const openPayouts = payouts.filter((payout) => payout.status === 'requested')
  const openPayoutMinor = openPayouts.reduce((sum, payout) => sum + Number(payout.amount_minor), 0)

  return <div>
    <SectionHeading eyebrow="platform overview" title="How deeqsipay is doing today." />

    {campaigns.length === 0 ? <EmptyState title="Nothing to moderate yet." body="No one has started a campaign on deeqsipay. When they do, the numbers land here." /> : <>
      <section className="mt-6 rounded-2xl bg-primary p-5 text-primary-foreground">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary-foreground/70">Total raised, platform-wide</p>
        <p className="mt-2 font-serif text-[40px] leading-none tracking-[-0.04em]">{formatMoney(raisedMinor, currency)}</p>
        <p className="mt-3 text-xs text-primary-foreground/75">across {campaigns.length} {campaigns.length === 1 ? 'campaign' : 'campaigns'}</p>
        <Link href="/admin/transactions" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-primary-foreground">Open the donation ledger <ChevronRight size={14} /></Link>
      </section>

      <section className="mt-3 grid gap-3 md:grid-cols-2">
        <Link href="/admin/campaigns?status=under_review" className="rounded-2xl border border-border bg-card p-4">
          <ClipboardCheck size={16} className="text-primary" />
          <p className="mt-3 font-serif text-2xl">{awaitingReview}</p>
          <p className="text-xs text-muted-foreground">{awaitingReview === 1 ? 'campaign is' : 'campaigns are'} awaiting review</p>
        </Link>
        <Link href="/admin/payouts?status=requested" className="rounded-2xl border border-border bg-card p-4">
          <Wallet size={16} className="text-primary" />
          <p className="mt-3 font-serif text-2xl">{openPayouts.length}</p>
          <p className="text-xs text-muted-foreground">{openPayouts.length === 1 ? 'payout is' : 'payouts are'} awaiting a decision{openPayouts.length > 0 && ` · ${formatMoney(openPayoutMinor, currency)}`}</p>
        </Link>
      </section>

      <section className="mt-8">
        <p className="eyebrow">Campaigns by status</p>
        <ul className="mt-4 grid gap-2 md:grid-cols-2">{CAMPAIGN_STATUSES.map((status) => {
          const count = countFor(status)
          return <li key={status}>
            <Link href={`/admin/campaigns?status=${status}`} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
              <span className="flex items-center gap-3"><StatusBadge status={status} /><span className="text-xs text-muted-foreground">{count === 0 ? `no campaigns ${statusLabel(status)}` : `${count} ${count === 1 ? 'campaign' : 'campaigns'}`}</span></span>
              <ChevronRight size={16} className="text-muted-foreground" />
            </Link>
          </li>
        })}</ul>
      </section>

      <section className="mt-8 grid gap-2 md:grid-cols-2">
        <Link href="/admin/profiles" className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-sm font-semibold">Organisers <ChevronRight size={16} className="text-muted-foreground" /></Link>
        <Link href="/admin/payouts" className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-sm font-semibold">All payouts <ChevronRight size={16} className="text-muted-foreground" /></Link>
      </section>
    </>}
  </div>
}
