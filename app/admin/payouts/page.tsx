import Link from 'next/link'
import { formatMoney, initials } from '@/lib/campaigns'
import { EmptyState, FilterPills, ReadOnlyNote, SectionHeading, StatusBadge } from '../_components/admin-ui'
import { PAYOUT_STATUSES, embedded, firstParam, pickStatus, requireStaff, shortDate, statusLabel } from '../_lib/admin'
import { PayoutActions } from './payout-actions'

const PAGE_LIMIT = 200
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RequesterEmbed = { display_name: string | null }
type CampaignEmbed = { id: string; title: string }
type PayoutRow = {
  id: string
  campaign_id: string
  amount_minor: number
  currency: string
  status: string
  created_at: string
  reviewed_at: string | null
  decision_note: string | null
  provider_reference: string | null
  campaigns: CampaignEmbed | CampaignEmbed[] | null
  profiles: RequesterEmbed | RequesterEmbed[] | null
}

export default async function AdminPayoutsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { role, supabase } = await requireStaff()
  const params = await searchParams
  const status = pickStatus(firstParam(params, 'status'), PAYOUT_STATUSES)
  const campaignIdParam = firstParam(params, 'campaignId')
  const campaignId = UUID.test(campaignIdParam) ? campaignIdParam : null

  let query = supabase
    .from('payouts')
    .select('id,campaign_id,amount_minor,currency,status,created_at,reviewed_at,decision_note,provider_reference,campaigns!payouts_campaign_id_fkey(id,title),profiles!payouts_requested_by_fkey(display_name)')
    .order('created_at', { ascending: false })
    .limit(PAGE_LIMIT)
  if (status !== null) query = query.eq('status', status)
  if (campaignId !== null) query = query.eq('campaign_id', campaignId)

  const { data } = await query
  const payouts = (data ?? []) as unknown as PayoutRow[]

  const open = payouts.filter((payout) => payout.status === 'requested')
  const openMinor = open.reduce((sum, payout) => sum + Number(payout.amount_minor), 0)
  const currency = payouts[0]?.currency ?? 'USD'
  const scopeTitle = embedded(payouts[0]?.campaigns)?.title ?? null

  return <div>
    <SectionHeading eyebrow="payout queue" title="Money on its way out." />
    {campaignId !== null && <p className="mt-2 text-sm text-muted-foreground">Filtered to {scopeTitle === null ? 'one campaign' : `“${scopeTitle}”`}. <Link href="/admin/payouts" className="font-bold text-primary">Show all campaigns</Link></p>}
    <FilterPills base="/admin/payouts" current={status} options={PAYOUT_STATUSES} extra={campaignId === null ? undefined : { campaignId }} />

    {payouts.length === 0 ? <EmptyState
      title={status === null ? 'No payout requests yet.' : `Nothing is ${statusLabel(status)}.`}
      body={status === null ? 'When an organiser asks to withdraw what they have raised, the request waits here.' : 'Try another filter, or clear it to see the whole queue.'}
    /> : <>
      <p className="mt-5 text-xs text-muted-foreground">{open.length} awaiting a decision{open.length > 0 && <> · <strong className="text-foreground">{formatMoney(openMinor, currency)}</strong> reserved</>}</p>
      {role === 'moderator' && <ReadOnlyNote className="mt-2" />}
      <ul className="mt-3 space-y-3">{payouts.map((payout) => {
        const campaign = embedded(payout.campaigns)
        const requester = embedded(payout.profiles)
        const person = requester?.display_name?.trim() || 'Unnamed organiser'
        return <li key={payout.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-serif text-lg leading-tight">{campaign === null ? 'Campaign removed' : <Link href={`/admin/campaigns/${campaign.id}`}>{campaign.title}</Link>}</h2>
              <span className="mt-2 flex items-center gap-2">
                <span className="mini-avatar" aria-hidden="true">{initials(person)}</span>
                <span className="truncate text-xs text-muted-foreground">asked by <strong className="text-foreground">{person}</strong> · {shortDate(payout.created_at)}</span>
              </span>
            </div>
            <span className="shrink-0 text-right">
              <span className="block font-serif text-xl">{formatMoney(payout.amount_minor, payout.currency)}</span>
              <span className="mt-1 block"><StatusBadge status={payout.status} /></span>
            </span>
          </div>

          {payout.decision_note !== null && payout.decision_note.trim() !== '' && <p className="mt-3 rounded-xl bg-muted p-3 text-xs leading-6"><strong className="block font-semibold">Decision note</strong>{payout.decision_note}</p>}
          {(payout.reviewed_at !== null || payout.provider_reference !== null) && <p className="mt-2 text-xs text-muted-foreground">
            {payout.reviewed_at !== null && `Decided ${shortDate(payout.reviewed_at)}`}
            {payout.reviewed_at !== null && payout.provider_reference !== null && ' · '}
            {payout.provider_reference !== null && `Reference ${payout.provider_reference}`}
          </p>}

          {role === 'admin' && <PayoutActions payoutId={payout.id} status={payout.status} />}
        </li>
      })}</ul>
      {payouts.length === PAGE_LIMIT && <p className="mt-4 text-xs text-muted-foreground">Showing the {PAGE_LIMIT} most recent. Filter by status to see further back.</p>}
    </>}
  </div>
}
