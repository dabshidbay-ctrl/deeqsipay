import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowUpRight, BarChart3, ChevronRight, Heart, Plus, Settings, ShieldCheck, Wallet } from 'lucide-react'
import { PageFrame } from '@/components/kindred-shell'
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server'
import { formatMoney, initials, progressPercent } from '@/lib/campaigns'

type OwnedCampaign = { id: string; title: string; status: string; goal_minor: number; raised_minor: number; donor_count: number; currency: string }
type DonationRow = { amount_minor: number; campaign_id: string }

export default async function ProfilePage() {
  const user = await getSessionUser()
  if (!user) redirect('/login?next=/profile')
  const supabase = await createSupabaseServerClient()

  const [{ data: profileRow }, { data: campaignRows }, { data: donationRows }] = await Promise.all([
    supabase.from('profiles').select('display_name, full_name').eq('id', user.id).maybeSingle(),
    supabase.from('campaigns').select('id,title,status,goal_minor,raised_minor,donor_count,currency').eq('owner_id', user.id).order('created_at', { ascending: false }),
    supabase.from('donations').select('amount_minor,campaign_id').eq('donor_id', user.id).eq('status', 'succeeded'),
  ])

  const profile = (profileRow ?? null) as { display_name?: string | null; full_name?: string | null } | null
  const name = profile?.display_name?.trim() || user.email?.split('@')[0] || 'Friend'
  const fullName = profile?.full_name?.trim() || null
  const owned = (campaignRows ?? []) as OwnedCampaign[]
  const donations = (donationRows ?? []) as DonationRow[]

  const currency = owned[0]?.currency ?? 'USD'
  const givenMinor = donations.reduce((sum, donation) => sum + Number(donation.amount_minor), 0)
  const supportedCount = new Set(donations.map((donation) => donation.campaign_id)).size
  const raisedMinor = owned.reduce((sum, campaign) => sum + Number(campaign.raised_minor), 0)
  const donorTotal = owned.reduce((sum, campaign) => sum + Number(campaign.donor_count), 0)

  return <PageFrame active="profile" eyebrow="your deeqsipay profile">
    <section className="px-5 pb-6 pt-8"><div className="flex items-center gap-4"><div className="grid size-20 place-items-center rounded-full bg-accent-soft text-xl font-bold text-primary">{initials(name)}</div><div><p className="eyebrow">Welcome back</p><h1 className="mt-1 font-serif text-3xl">{name}</h1>{fullName && <p className="text-xs text-muted-foreground mt-0.5">{fullName}</p>}<p className="text-sm text-muted-foreground">{user.email}</p></div></div></section>
    <section className="space-y-3 px-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-card p-4"><Heart className="text-primary" size={18} /><p className="mt-4 font-serif text-2xl">{supportedCount}</p><p className="text-xs text-muted-foreground">campaigns supported</p></div>
        <div className="rounded-2xl bg-card p-4"><ShieldCheck className="text-primary" size={18} /><p className="mt-4 font-serif text-2xl">{formatMoney(givenMinor, currency)}</p><p className="text-xs text-muted-foreground">given with care</p></div>
      </div>
      <div className="flex items-center justify-between pt-5"><div><p className="eyebrow">Organization dashboard</p><h2 className="mt-1 font-serif text-2xl">Your fundraisers</h2></div><Link href="/create" aria-label="Add campaign" className="icon-button"><Plus size={18} /></Link></div>
      <Link href="/dashboard" className="flex items-center justify-between rounded-2xl border border-border bg-card p-4"><span className="flex items-center gap-3 text-sm font-semibold"><BarChart3 size={18} className="text-primary" /> Full dashboard</span><ChevronRight size={18} className="text-muted-foreground" /></Link>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-border bg-card p-3"><BarChart3 size={16} className="text-primary" /><p className="mt-3 font-serif text-xl">{formatMoney(raisedMinor, currency)}</p><p className="text-[10px] text-muted-foreground">raised</p></div>
        <div className="rounded-xl border border-border bg-card p-3"><Heart size={16} className="text-primary" /><p className="mt-3 font-serif text-xl">{donorTotal}</p><p className="text-[10px] text-muted-foreground">donors</p></div>
        <div className="rounded-xl border border-border bg-card p-3"><Wallet size={16} className="text-primary" /><p className="mt-3 font-serif text-xl">{owned.length}</p><p className="text-[10px] text-muted-foreground">campaigns</p></div>
      </div>
      {owned.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-6 text-center"><p className="font-serif text-xl">You haven&apos;t started a fundraiser yet.</p><p className="mt-2 text-xs leading-5 text-muted-foreground">When you do, it will show up here with its progress.</p></div> : owned.map((campaign) => <article key={campaign.id} className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3"><div><span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold capitalize text-primary">{campaign.status}</span><h3 className="mt-3 font-serif text-lg leading-tight">{campaign.title}</h3></div><Link href={`/campaigns/${campaign.id}`} aria-label={`Open ${campaign.title}`}><ArrowUpRight size={17} className="text-muted-foreground" /></Link></div>
        <div className="progress-track mt-4"><div className="progress-fill" style={{ width: `${progressPercent(campaign.raised_minor, campaign.goal_minor)}%` }} /></div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span><strong className="text-foreground">{formatMoney(campaign.raised_minor, campaign.currency)}</strong> of {formatMoney(campaign.goal_minor, campaign.currency)}</span><span>{campaign.donor_count} donors</span></div>
      </article>)}
      <Link href="/create" className="flex items-center justify-between rounded-2xl bg-primary p-4 text-primary-foreground"><span><p className="font-serif text-xl">Add another campaign</p><p className="mt-1 text-xs text-primary-foreground/70">Give your next cause a place to grow.</p></span><ChevronRight size={19} /></Link>
      <Link href="/settings" className="flex items-center justify-between rounded-2xl border border-border bg-card p-4"><span className="flex items-center gap-3 text-sm font-semibold"><Settings size={18} className="text-primary" /> Account settings</span><ChevronRight size={18} className="text-muted-foreground" /></Link>
    </section>
  </PageFrame>
}
