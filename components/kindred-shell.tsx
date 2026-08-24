import Link from 'next/link'
import { Bookmark, Compass, Home, Plus, UserRound } from 'lucide-react'
import { KindredFooter } from '@/components/kindred-footer'
import { KindredHeader } from '@/components/kindred-header'

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

export const seededCampaigns = [
  { id: 1, title: 'Help Maya get back on her feet', category: 'Medical', raised: 18420, goal: 25000, donors: 312, days: 12, image: 'https://images.unsplash.com/photo-1542810634-71277d95dcbb?auto=format&fit=crop&w=1200&q=85', person: 'Maya Thompson', initials: 'MT', tint: 'sun' },
  { id: 2, title: 'A warm home for the Rivera family', category: 'Emergency', raised: 9200, goal: 12000, donors: 186, days: 8, image: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1200&q=85', person: 'Ana Rivera', initials: 'AR', tint: 'sky' },
  { id: 3, title: 'Keep our neighborhood garden growing', category: 'Community', raised: 6780, goal: 10000, donors: 94, days: 23, image: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=85', person: 'Greenway Collective', initials: 'GC', tint: 'mint' },
]

type Campaign = typeof seededCampaigns[number]
export function CampaignCard({ campaign }: { campaign: Campaign }) {
  return <article className="campaign-card"><div className="relative"><img src={campaign.image} alt={campaign.title} className="campaign-image" /><div className="image-fade" /><span className="category-badge">{campaign.category}</span></div><div className="p-4"><h3 className="font-serif text-[21px] font-semibold leading-tight tracking-[-0.025em]">{campaign.title}</h3><div className="mt-3 flex items-center gap-2"><span className={`mini-avatar ${campaign.tint}`}>{campaign.initials}</span><span className="text-xs font-medium text-muted-foreground">by <strong className="text-foreground">{campaign.person}</strong></span></div><div className="mt-4"><div className="progress-track"><div className="progress-fill" style={{ width: `${campaign.raised / campaign.goal * 100}%` }} /></div><div className="mt-2 flex justify-between text-xs"><span><strong className="text-sm">${campaign.raised.toLocaleString()}</strong> raised of ${campaign.goal.toLocaleString()}</span><span className="font-medium text-muted-foreground">{campaign.days} days left</span></div></div><div className="mt-4 flex items-center justify-between border-t border-border pt-3"><span className="text-xs text-muted-foreground">{campaign.donors} people donated</span><Link href={`/campaigns/${campaign.id}`} className="donate-button">View story</Link></div></div></article>
}
