import Link from 'next/link'
import { formatMoney, initials } from '@/lib/campaigns'
import { EmptyState, FilterPills, ReadOnlyNote, SectionHeading, StatusBadge } from '../_components/admin-ui'
import { DONATION_STATUSES, embedded, firstParam, pickStatus, requireStaff, shortDate, statusLabel } from '../_lib/admin'
import { RefundAction } from './refund-action'

const PAGE_LIMIT = 200
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type DonorEmbed = { display_name: string | null }
type CampaignEmbed = { id: string; title: string; currency: string }
type DonationRow = {
  id: string
  amount_minor: number
  status: string
  created_at: string
  is_anonymous: boolean
  guest_name: string | null
  campaign_id: string
  campaigns: CampaignEmbed | CampaignEmbed[] | null
  profiles: DonorEmbed | DonorEmbed[] | null
}

export default async function AdminTransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { role, supabase } = await requireStaff()
  const params = await searchParams
  const status = pickStatus(firstParam(params, 'status'), DONATION_STATUSES)
  const campaignIdParam = firstParam(params, 'campaignId')
  const campaignId = UUID.test(campaignIdParam) ? campaignIdParam : null

  let query = supabase
    .from('donations')
    .select('id,amount_minor,status,created_at,is_anonymous,guest_name,campaign_id,campaigns!donations_campaign_id_fkey(id,title,currency),profiles!donations_donor_id_fkey(display_name)')
    .order('created_at', { ascending: false })
    .limit(PAGE_LIMIT)
  if (status !== null) query = query.eq('status', status)
  if (campaignId !== null) query = query.eq('campaign_id', campaignId)

  const { data } = await query
  const donations = (data ?? []) as unknown as DonationRow[]

  const succeeded = donations.filter((donation) => donation.status === 'succeeded')
  const succeededMinor = succeeded.reduce((sum, donation) => sum + Number(donation.amount_minor), 0)
  const refundedCount = donations.filter((donation) => donation.status === 'refunded').length
  const currency = embedded(donations[0]?.campaigns)?.currency ?? 'USD'
  const scopeTitle = embedded(donations[0]?.campaigns)?.title ?? null

  return <div>
    <SectionHeading eyebrow="donation ledger" title="Every gift, across every campaign." />
    {campaignId !== null && <p className="mt-2 text-sm text-muted-foreground">Filtered to {scopeTitle === null ? 'one campaign' : `“${scopeTitle}”`}. <Link href="/admin/transactions" className="font-bold text-primary">Show all campaigns</Link></p>}
    <FilterPills base="/admin/transactions" current={status} options={DONATION_STATUSES} extra={campaignId === null ? undefined : { campaignId }} />

    {donations.length === 0 ? <EmptyState
      title={status === null ? 'No donations yet.' : `Nothing is ${statusLabel(status)}.`}
      body={status === null ? 'The moment someone gives, the donation lands here.' : 'Try another filter, or clear it to see the whole ledger.'}
    /> : <>
      <p className="mt-5 text-xs text-muted-foreground">{succeeded.length} succeeded · <strong className="text-foreground">{formatMoney(succeededMinor, currency)}</strong> settled in this view{refundedCount > 0 && ` · ${refundedCount} refunded`}</p>
      {role === 'moderator' && <ReadOnlyNote className="mt-2" />}
      <ul className="mt-3 space-y-2.5">{donations.map((donation) => {
        const campaign = embedded(donation.campaigns)
        const donor = embedded(donation.profiles)
        const name = donation.guest_name?.trim() || donor?.display_name?.trim() || 'Unnamed donor'
        const refunded = donation.status === 'refunded'
        return <li key={donation.id} className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-3">
            <span className="mini-avatar" aria-hidden="true">{initials(name)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{name}{donation.is_anonymous && <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">shown as anonymous</span>}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {campaign === null ? 'Campaign removed' : <Link href={`/admin/campaigns/${campaign.id}`} className="hover:text-foreground">{campaign.title}</Link>} · {shortDate(donation.created_at)}
              </span>
            </span>
            <span className="shrink-0 text-right">
              {/* A refunded gift keeps its original amount on screen — struck through, so the
                  row reads as reversed rather than as money the campaign still holds. */}
              <span className={`block text-sm font-bold ${refunded ? 'text-muted-foreground line-through' : ''}`}>{formatMoney(donation.amount_minor, campaign?.currency ?? currency)}</span>
            </span>
            <StatusBadge status={donation.status} />
          </div>
          {/* Admins only. The API 403s a moderator, so the control is not rendered for one. */}
          {role === 'admin' && <RefundAction donationId={donation.id} amountMinor={donation.amount_minor} currency={campaign?.currency ?? currency} status={donation.status} />}
        </li>
      })}</ul>
      {donations.length === PAGE_LIMIT && <p className="mt-4 text-xs text-muted-foreground">Showing the {PAGE_LIMIT} most recent. Filter by status or campaign to see further back.</p>}
    </>}
  </div>
}
