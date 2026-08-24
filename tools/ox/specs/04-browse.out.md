=== FILE: lib/campaigns.ts ===
export type Campaign = {
  id: string
  title: string
  description: string
  category: string
  goalMinor: number
  raisedMinor: number
  donorCount: number
  currency: string
  imageUrl: string | null
  endsAt: string | null
  createdAt: string
  owner: { displayName: string; avatarUrl: string | null } | null
}

export function formatMoney(minor: number, currency: string): string {
  const digits = minor % 100 === 0 ? 0 : 2
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 100)
}

export function progressPercent(raisedMinor: number, goalMinor: number): number {
  if (goalMinor <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((raisedMinor / goalMinor) * 100)))
}

export function daysLeft(endsAt: string | null): number | null {
  if (endsAt === null) return null
  const msRemaining = new Date(endsAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(msRemaining / 86_400_000))
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join('')
}

export function mapCampaignRow(row: Record<string, unknown>): Campaign {
  const profile = (row.profiles ?? null) as { display_name?: unknown; avatar_url?: unknown } | null
  const owner = profile
    ? {
        displayName: typeof profile.display_name === 'string' ? profile.display_name : '',
        avatarUrl: typeof profile.avatar_url === 'string' ? profile.avatar_url : null,
      }
    : null
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    category: String(row.category),
    goalMinor: Number(row.goal_minor),
    raisedMinor: Number(row.raised_minor),
    donorCount: Number(row.donor_count),
    currency: String(row.currency),
    imageUrl: typeof row.image_url === 'string' ? row.image_url : null,
    endsAt: typeof row.ends_at === 'string' ? row.ends_at : null,
    createdAt: String(row.created_at),
    owner,
  }
}
=== END FILE ===

=== FILE: lib/server/campaigns.ts ===
import { createAuthClient } from '@/lib/server/supabase-admin'
import { mapCampaignRow, type Campaign } from '@/lib/campaigns'

const CAMPAIGN_SELECT = '*, profiles(display_name, avatar_url)'
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
=== END FILE ===

=== FILE: components/kindred-shell.tsx ===
import Link from 'next/link'
import { Bookmark, Compass, Home, Plus, UserRound } from 'lucide-react'
import { KindredFooter } from '@/components/kindred-footer'
import { KindredHeader } from '@/components/kindred-header'
import { daysLeft, formatMoney, initials, progressPercent, type Campaign } from '@/lib/campaigns'

export { KindredHeader }

export function BottomNav({ active = 'home' }: { active?: string }) {
  return <nav className="bottom-nav">
    <Link href="/" className={`nav-item ${active === 'home' ? 'nav-active' : ''}`}><Home size={20} /><span>Home</span></Link>
    <Link href="/explore" className={`nav-item ${active === 'explore' ? 'nav-active' : ''}`}><Compass size={20} /><span>Explore</span></Link>
    <Link href="/create" className="create-button" aria-label="Create fundraiser"><Plus size={22} /></Link>
    <Link href="/saved" className={`nav-item ${active === 'saved' ? 'nav-active' : ''}`}><Bookmark size={20} /><span>Saved</span></Link>
    <Link href="/profile" className={`nav-item ${active === 'profile' ? 'nav-active' : ''}`}><UserRound size={20} /><span>Profile</span></Link>
  </nav>
}

export function PageFrame({ children, active, eyebrow }: { children: React.ReactNode; active?: string; eyebrow?: string }) {
  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto min-h-screen max-w-[470px] border-x border-border bg-background pb-24 shadow-[0_0_60px_rgba(25,50,40,0.05)]"><KindredHeader eyebrow={eyebrow} />{children}<KindredFooter /><BottomNav active={active} /></div></main>
}

const AVATAR_TINTS = ['sun', 'sky', 'mint'] as const

function avatarTint(id: string): string {
  let sum = 0
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i)
  return AVATAR_TINTS[sum % AVATAR_TINTS.length]
}

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const percent = progressPercent(campaign.raisedMinor, campaign.goalMinor)
  const remaining = daysLeft(campaign.endsAt)
  const person = campaign.owner?.displayName || 'Anonymous'
  return <article className="campaign-card"><div className="relative"><img src={campaign.imageUrl ?? '/placeholder.jpg'} alt={campaign.title} className="campaign-image" /><div className="image-fade" /><span className="category-badge">{campaign.category}</span></div><div className="p-4"><h3 className="font-serif text-[21px] font-semibold leading-tight tracking-[-0.025em]">{campaign.title}</h3><div className="mt-3 flex items-center gap-2"><span className={`mini-avatar ${avatarTint(campaign.id)}`}>{initials(person)}</span><span className="text-xs font-medium text-muted-foreground">by <strong className="text-foreground">{person}</strong></span></div><div className="mt-4"><div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%` }} /></div><div className="mt-2 flex justify-between text-xs"><span><strong className="text-sm">{formatMoney(campaign.raisedMinor, campaign.currency)}</strong> raised of {formatMoney(campaign.goalMinor, campaign.currency)}</span>{remaining !== null && <span className="font-medium text-muted-foreground">{remaining} days left</span>}</div></div><div className="mt-4 flex items-center justify-between border-t border-border pt-3"><span className="text-xs text-muted-foreground">{campaign.donorCount} people donated</span><Link href={`/campaigns/${campaign.id}`} className="donate-button">View story</Link></div></div></article>
}
=== END FILE ===

=== FILE: components/home-feed.tsx ===
'use client'

import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { CampaignCard } from '@/components/kindred-shell'
import type { Campaign } from '@/lib/campaigns'

const categories = ['For you', 'Medical', 'Emergency', 'Nonprofit', 'Education']

export function HomeFeed({ campaigns }: { campaigns: Campaign[] }) {
  const [active, setActive] = useState('For you')
  const filtered = useMemo(() => (active === 'For you' ? campaigns : campaigns.filter((campaign) => campaign.category === active)), [active, campaigns])

  return <>
    <section className="scrollbar-hidden flex gap-2 overflow-x-auto px-5 pb-7" aria-label="Campaign categories">{categories.map((category) => <button key={category} onClick={() => setActive(category)} className={`pill ${active === category ? 'pill-active' : ''}`}>{category}</button>)}</section>
    <section className="px-5"><div className="mb-4 flex items-end justify-between"><div><p className="eyebrow">Curated for you</p><h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.03em]">Stories worth sharing</h2></div><button className="flex items-center gap-1 text-xs font-semibold text-primary">See all <ChevronRight size={14} /></button></div>
      {filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-8 text-center"><p className="eyebrow">Nothing here yet</p><h3 className="mt-2 font-serif text-xl font-semibold tracking-[-0.03em]">No stories in this category</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Be the first — start a fundraiser for the cause you care about.</p></div> : <div className="space-y-5">{filtered.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}</div>}
    </section>
  </>
}
=== END FILE ===

=== FILE: app/page.tsx ===
import { Plus, Sparkles } from 'lucide-react'
import { HomeFeed } from '@/components/home-feed'
import { PageFrame } from '@/components/kindred-shell'
import { createAuthClient } from '@/lib/server/supabase-admin'
import { listCampaigns } from '@/lib/server/campaigns'

async function getDisplayName(): Promise<string> {
  const supabase = createAuthClient()
  const { data } = await supabase.auth.getUser()
  const userId = data.user?.id
  if (!userId) return 'there'
  const { data: profileData } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle()
  const profile = (profileData ?? null) as { display_name?: string | null } | null
  const name = profile?.display_name?.trim() ?? ''
  return name.length > 0 ? name : 'there'
}

export default async function Page() {
  const [campaigns, displayName] = await Promise.all([listCampaigns(), getDisplayName()])
  return <PageFrame active="home" eyebrow="funding good things">
    <section className="px-5 pb-5 pt-8"><p className="eyebrow">Good morning, {displayName}</p><h1 className="mt-2 max-w-[350px] font-serif text-[39px] font-semibold leading-[1.04] tracking-[-0.045em]">Small acts.<br /><em className="text-primary">Big ripples.</em></h1><p className="mt-4 max-w-[320px] text-sm leading-6 text-muted-foreground">Discover people and causes making a difference — and be part of their story.</p></section>
    <HomeFeed campaigns={campaigns} />
    <section className="mx-5 mt-7 rounded-2xl bg-primary p-5 text-primary-foreground"><div className="flex items-start justify-between"><div><Sparkles size={19} /><h2 className="mt-3 font-serif text-[23px] font-semibold leading-tight">Your kindness<br />can start a story.</h2></div><div className="rounded-full border border-primary-foreground/20 p-2"><Plus size={20} /></div></div><p className="mt-3 text-xs leading-5 text-primary-foreground/70">Have a cause close to your heart? Create a fundraiser and invite your community in.</p><button className="mt-4 rounded-full bg-background px-4 py-2.5 text-xs font-bold text-foreground">Start a fundraiser</button></section>
  </PageFrame>
}
=== END FILE ===

=== FILE: app/explore/page.tsx ===
import { Search } from 'lucide-react'
import { CampaignCard, PageFrame } from '@/components/kindred-shell'
import { listCampaigns } from '@/lib/server/campaigns'

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const rawQuery = (Array.isArray(params.q) ? params.q[0] : params.q) ?? ''
  const query = rawQuery.trim().toLowerCase()
  const campaigns = await listCampaigns()
  const filtered = query.length > 0 ? campaigns.filter((campaign) => campaign.title.toLowerCase().includes(query)) : campaigns
  return <PageFrame active="explore" eyebrow="explore with purpose">
    <section className="px-5 pb-6 pt-8"><p className="eyebrow">Find your next cause</p><h1 className="mt-2 font-serif text-[39px] font-semibold leading-none tracking-[-0.045em]">Explore <em className="text-primary">good.</em></h1><form action="/explore" method="get" className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-muted-foreground"><Search size={18} /><input name="q" defaultValue={rawQuery} placeholder="Search campaigns, people, or places" className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" /></form></section>
    <section className="space-y-5 px-5">{filtered.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}</section>
  </PageFrame>
}
=== END FILE ===

=== FILE: app/campaigns/[id]/page.tsx ===
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Heart, Share2 } from 'lucide-react'
import { daysLeft, formatMoney, initials, progressPercent } from '@/lib/campaigns'
import { getCampaign } from '@/lib/server/campaigns'

type CampaignPageProps = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: CampaignPageProps): Promise<Metadata> {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (!campaign) return { title: 'Campaign not found' }
  return { title: campaign.title, description: campaign.description }
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (!campaign) notFound()
  const organizer = campaign.owner?.displayName || 'Anonymous'
  const percent = progressPercent(campaign.raisedMinor, campaign.goalMinor)
  const remaining = daysLeft(campaign.endsAt)
  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto min-h-screen max-w-[470px] border-x border-border bg-background pb-10"><div className="relative"><img src={campaign.imageUrl ?? '/placeholder.jpg'} alt={campaign.title} className="campaign-image h-72" /><div className="absolute left-5 top-6 flex gap-2"><Link href="/" aria-label="Back" className="icon-button"><ArrowLeft size={18} /></Link><button aria-label="Share" className="icon-button"><Share2 size={18} /></button></div></div><section className="px-5 pt-6"><span className="category-badge static inline-block">{campaign.category}</span><h1 className="mt-4 font-serif text-[36px] font-semibold leading-tight tracking-[-0.04em]">{campaign.title}</h1><div className="mt-4 flex items-center gap-2"><span className="mini-avatar sky">{initials(organizer)}</span><span className="text-sm text-muted-foreground">Organized by <strong className="text-foreground">{organizer}</strong></span></div><p className="mt-6 text-sm leading-7 text-muted-foreground">{campaign.description}</p><div className="mt-7 rounded-2xl bg-card p-4"><div className="flex justify-between text-sm"><strong>{formatMoney(campaign.raisedMinor, campaign.currency)} raised</strong><span className="text-muted-foreground">of {formatMoney(campaign.goalMinor, campaign.currency)}</span></div><div className="progress-track mt-3"><div className="progress-fill" style={{ width: `${percent}%` }} /></div><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{campaign.donorCount} donors</span>{remaining !== null && <span>{remaining} days left</span>}</div></div><Link href={`/campaigns/${campaign.id}/donate`} className="confirm-button mt-6">Donate to this story <Heart size={17} fill="currentColor" /></Link></section></div></main>
}
=== END FILE ===

=== NOTES ===
- Assumed `createAuthClient()` is a synchronous factory returning a cookie-aware anon supabase-js client exposing `.auth.getUser()`. If it is not cookie-bound, the greeting safely falls back to "there"; if it is async, `app/page.tsx` needs one `await`.
- The home-feed empty-state panel approximates the dashed panel described at the bottom of app/saved/page.tsx (that file was not provided); tweak copy/classes if the real one differs.
- Real campaign rows carry no avatar tint, so `avatarTint` derives one deterministically by hashing the campaign id across the existing `sun`/`sky`/`mint` classes.
- `/placeholder.jpg` is used verbatim per spec; confirm the asset exists in `public/`.
- Assumed no other in-repo file imports `seededCampaigns`; out-of-scope pages (create, saved, api) were not touched.
- The home donation modal/save-bookmark UI is intentionally gone per spec (later task owns donations); cards now link to `/campaigns/[id]`.
- `listCampaigns`/`getCampaign` swallow errors and return `[]`/`null` per spec; an invalid uuid in `[id]` therefore renders `notFound()`.
=== END NOTES ===