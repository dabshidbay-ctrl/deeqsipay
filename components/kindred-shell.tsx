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
