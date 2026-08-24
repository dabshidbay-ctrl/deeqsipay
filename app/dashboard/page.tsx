import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Banknote, BarChart3, Clock, Heart, TrendingUp, Users, Wallet } from 'lucide-react'
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server'
import { formatMoney, initials, progressPercent } from '@/lib/campaigns'

type OwnedCampaign = { id: string; title: string; status: string; goal_minor: number; raised_minor: number; donor_count: number; currency: string; created_at: string }
type DonationRow = {
  id: string
  amount_minor: number
  currency: string
  status: string
  created_at: string
  is_anonymous: boolean
  campaign_id: string
  profiles: { display_name: string | null } | { display_name: string | null }[] | null
}

// The organiser sees THAT a donation happened, never who made it when the donor asked
// to be anonymous — the same guarantee the public donor list gives.
function donorName(row: DonationRow): string {
  if (row.is_anonymous) return 'Anonymous'
  const profile = Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles
  const name = profile?.display_name?.trim() ?? ''
  return name.length > 0 ? name : 'Anonymous'
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function DashboardPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login?next=/dashboard')
  const supabase = await createSupabaseServerClient()

  const { data: campaignRows } = await supabase
    .from('campaigns')
    .select('id,title,status,goal_minor,raised_minor,donor_count,currency,created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  const owned = (campaignRows ?? []) as OwnedCampaign[]
  const campaignIds = owned.map((campaign) => campaign.id)

  // RLS (donations_select_own_or_campaign_owner) is what authorises this read; the
  // .in() is a narrowing filter, not the security boundary.
  const { data: donationRows } = campaignIds.length > 0
    ? await supabase
        .from('donations')
        .select('id,amount_minor,currency,status,created_at,is_anonymous,campaign_id,profiles!donations_donor_id_fkey(display_name)')
        .in('campaign_id', campaignIds)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: [] }

  const donations = (donationRows ?? []) as unknown as DonationRow[]
  const succeeded = donations.filter((donation) => donation.status === 'succeeded')
  const pending = donations.filter((donation) => donation.status === 'pending')

  const currency = owned[0]?.currency ?? 'USD'
  const raisedMinor = owned.reduce((sum, campaign) => sum + Number(campaign.raised_minor), 0)
  const donorTotal = owned.reduce((sum, campaign) => sum + Number(campaign.donor_count), 0)
  const activeCount = owned.filter((campaign) => campaign.status === 'active').length

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const weekMinor = succeeded
    .filter((donation) => new Date(donation.created_at).getTime() >= weekAgo)
    .reduce((sum, donation) => sum + Number(donation.amount_minor), 0)

  const averageMinor = succeeded.length > 0
    ? Math.round(succeeded.reduce((sum, donation) => sum + Number(donation.amount_minor), 0) / succeeded.length)
    : 0

  const titleFor = (id: string) => owned.find((campaign) => campaign.id === id)?.title ?? 'Campaign'

  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto min-h-screen max-w-[470px] border-x border-border bg-background px-5 pb-16">
    <header className="flex items-center gap-4 pb-6 pt-7">
      <Link href="/profile" aria-label="Back" className="icon-button"><ArrowLeft size={18} /></Link>
      <div><p className="eyebrow">Organiser dashboard</p><h1 className="font-serif text-2xl leading-tight">Your fundraising</h1></div>
    </header>

    {owned.length === 0 ? <section className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center">
      <BarChart3 className="mx-auto text-primary" size={24} />
      <p className="mt-3 font-serif text-xl">No campaigns yet.</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Once you start a fundraiser, its performance shows up here.</p>
      <Link href="/create" className="confirm-button mt-6 inline-flex">Start a fundraiser</Link>
    </section> : <>
      <section className="rounded-2xl bg-primary p-5 text-primary-foreground">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary-foreground/70">Total raised</p>
        <p className="mt-2 font-serif text-[40px] leading-none tracking-[-0.04em]">{formatMoney(raisedMinor, currency)}</p>
        <p className="mt-3 text-xs text-primary-foreground/75">across {owned.length} {owned.length === 1 ? 'campaign' : 'campaigns'} · {activeCount} active</p>
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4"><Users size={16} className="text-primary" /><p className="mt-3 font-serif text-2xl">{donorTotal}</p><p className="text-xs text-muted-foreground">total donors</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><TrendingUp size={16} className="text-primary" /><p className="mt-3 font-serif text-2xl">{formatMoney(weekMinor, currency)}</p><p className="text-xs text-muted-foreground">last 7 days</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><Wallet size={16} className="text-primary" /><p className="mt-3 font-serif text-2xl">{formatMoney(averageMinor, currency)}</p><p className="text-xs text-muted-foreground">average gift</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><Clock size={16} className="text-primary" /><p className="mt-3 font-serif text-2xl">{pending.length}</p><p className="text-xs text-muted-foreground">awaiting confirmation</p></div>
      </section>

      <section className="mt-8">
        <p className="eyebrow">By campaign</p>
        <div className="mt-4 space-y-3">{owned.map((campaign) => <article key={campaign.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-serif text-lg leading-tight">{campaign.title}</h2>
            <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-bold capitalize text-primary">{campaign.status}</span>
          </div>
          <div className="progress-track mt-3"><div className="progress-fill" style={{ width: `${progressPercent(campaign.raised_minor, campaign.goal_minor)}%` }} /></div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span><strong className="text-foreground">{formatMoney(campaign.raised_minor, campaign.currency)}</strong> of {formatMoney(campaign.goal_minor, campaign.currency)}</span>
            <span>{campaign.donor_count} donors · {progressPercent(campaign.raised_minor, campaign.goal_minor)}%</span>
          </div>
          <Link href={`/campaigns/${campaign.id}`} className="mt-3 inline-block text-xs font-bold text-primary">View public page</Link>
        </article>)}</div>
      </section>

      <section className="mt-8">
        <p className="eyebrow">Recent donations</p>
        {donations.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No donations yet. Share your campaign to get the first one.</p>
          : <ul className="mt-4 space-y-2.5">{donations.slice(0, 20).map((donation) => <li key={donation.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <span className="mini-avatar" aria-hidden="true">{donation.is_anonymous ? '?' : initials(donorName(donation))}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{donorName(donation)}</span>
              <span className="text-xs text-muted-foreground">{titleFor(donation.campaign_id)} · {shortDate(donation.created_at)}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-bold">{formatMoney(donation.amount_minor, donation.currency ?? currency)}</span>
              {donation.status !== 'succeeded' && <span className="text-[10px] font-semibold capitalize text-muted-foreground">{donation.status}</span>}
            </span>
          </li>)}</ul>}
      </section>

      <Link href="/dashboard/payouts" className="mt-8 flex items-center justify-between rounded-2xl border border-border bg-card p-4">
        <span><span className="block font-serif text-xl">Payouts</span><span className="mt-1 block text-xs text-muted-foreground">See what&rsquo;s available and ask for your money.</span></span>
        <Banknote size={19} className="text-primary" />
      </Link>

      <Link href="/create" className="mt-3 flex items-center justify-between rounded-2xl bg-primary p-4 text-primary-foreground">
        <span><span className="block font-serif text-xl">Start another campaign</span><span className="mt-1 block text-xs text-primary-foreground/70">Give your next cause a place to grow.</span></span>
        <Heart size={19} fill="currentColor" />
      </Link>
    </>}
  </div></main>
}
