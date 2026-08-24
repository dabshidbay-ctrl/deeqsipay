'use client'

import { useMemo, useState } from 'react'
import { Bell, Bookmark, ChevronRight, Compass, Heart, Home, Plus, Search, Share2, Sparkles, UserRound, X } from 'lucide-react'

const campaigns = [
  { id: 1, title: 'Help Maya get back on her feet', category: 'Medical', raised: 18420, goal: 25000, donors: 312, days: 12, image: 'https://images.unsplash.com/photo-1542810634-71277d95dcbb?auto=format&fit=crop&w=1200&q=85', person: 'Maya Thompson', initials: 'MT', tint: 'sun' },
  { id: 2, title: 'A warm home for the Rivera family', category: 'Emergency', raised: 9200, goal: 12000, donors: 186, days: 8, image: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1200&q=85', person: 'Ana Rivera', initials: 'AR', tint: 'sky' },
  { id: 3, title: 'Keep our neighborhood garden growing', category: 'Community', raised: 6780, goal: 10000, donors: 94, days: 23, image: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=85', person: 'Greenway Collective', initials: 'GC', tint: 'mint' },
]

const categories = ['For you', 'Medical', 'Emergency', 'Nonprofit', 'Education']

export default function Page() {
  const [active, setActive] = useState('For you')
  const [saved, setSaved] = useState<number[]>([])
  const [selected, setSelected] = useState<(typeof campaigns)[number] | null>(null)
  const [amount, setAmount] = useState('50')
  const filtered = useMemo(() => active === 'For you' ? campaigns : campaigns.filter((campaign) => campaign.category === active), [active])

  const saveCampaign = (id: number) => setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const donate = async () => {
    setSelected(null)
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto min-h-screen max-w-[470px] border-x border-border bg-background pb-24 shadow-[0_0_60px_rgba(25,50,40,0.05)]">
        <header className="flex items-center justify-between px-5 pb-3 pt-7">
          <div><p className="font-serif text-[29px] font-semibold leading-none tracking-[-0.04em] text-foreground">kindred</p><p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">funding good things</p></div>
          <div className="flex items-center gap-2"><button aria-label="Search" className="icon-button"><Search size={19} /></button><button aria-label="Notifications" className="icon-button relative"><Bell size={19} /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" /></button><div className="avatar">JD</div></div>
        </header>
        <section className="px-5 pb-5 pt-8"><p className="eyebrow">Good morning, Jordan</p><h1 className="mt-2 max-w-[350px] font-serif text-[39px] font-semibold leading-[1.04] tracking-[-0.045em]">Small acts.<br /><em className="text-primary">Big ripples.</em></h1><p className="mt-4 max-w-[320px] text-sm leading-6 text-muted-foreground">Discover people and causes making a difference — and be part of their story.</p></section>
        <section className="scrollbar-hidden flex gap-2 overflow-x-auto px-5 pb-7" aria-label="Campaign categories">{categories.map((category) => <button key={category} onClick={() => setActive(category)} className={`pill ${active === category ? 'pill-active' : ''}`}>{category}</button>)}</section>
        <section className="px-5"><div className="mb-4 flex items-end justify-between"><div><p className="eyebrow">Curated for you</p><h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.03em]">Stories worth sharing</h2></div><button className="flex items-center gap-1 text-xs font-semibold text-primary">See all <ChevronRight size={14} /></button></div>
          <div className="space-y-5">{filtered.map((campaign, index) => <article key={campaign.id} className="campaign-card" style={{ animationDelay: `${index * 80}ms` }}><div className="relative"><img src={campaign.image} alt="" className="campaign-image" /><div className="image-fade" /><button onClick={() => saveCampaign(campaign.id)} aria-label="Save campaign" className="save-button"><Bookmark size={17} fill={saved.includes(campaign.id) ? 'currentColor' : 'none'} /></button><span className="category-badge">{campaign.category}</span></div><div className="p-4"><h3 className="font-serif text-[21px] font-semibold leading-tight tracking-[-0.025em]">{campaign.title}</h3><div className="mt-3 flex items-center gap-2"><span className={`mini-avatar ${campaign.tint}`}>{campaign.initials}</span><span className="text-xs font-medium text-muted-foreground">by <strong className="text-foreground">{campaign.person}</strong></span></div><div className="mt-4"><div className="progress-track"><div className="progress-fill" style={{ width: `${campaign.raised / campaign.goal * 100}%` }} /></div><div className="mt-2 flex justify-between text-xs"><span><strong className="text-sm">${campaign.raised.toLocaleString()}</strong> raised of ${campaign.goal.toLocaleString()}</span><span className="font-medium text-muted-foreground">{campaign.days} days left</span></div></div><div className="mt-4 flex items-center justify-between border-t border-border pt-3"><span className="text-xs text-muted-foreground">{campaign.donors} people donated</span><button onClick={() => setSelected(campaign)} className="donate-button">Donate <Heart size={14} fill="currentColor" /></button></div></div></article>)}</div></section>
        <section className="mx-5 mt-7 rounded-2xl bg-primary p-5 text-primary-foreground"><div className="flex items-start justify-between"><div><Sparkles size={19} /><h2 className="mt-3 font-serif text-[23px] font-semibold leading-tight">Your kindness<br />can start a story.</h2></div><div className="rounded-full border border-primary-foreground/20 p-2"><Plus size={20} /></div></div><p className="mt-3 text-xs leading-5 text-primary-foreground/70">Have a cause close to your heart? Create a fundraiser and invite your community in.</p><button className="mt-4 rounded-full bg-background px-4 py-2.5 text-xs font-bold text-foreground">Start a fundraiser</button></section>
        <nav className="bottom-nav"><button className="nav-item nav-active"><Home size={20} /><span>Home</span></button><button className="nav-item"><Compass size={20} /><span>Explore</span></button><button className="create-button" aria-label="Create fundraiser"><Plus size={22} /></button><button className="nav-item"><Bookmark size={20} /><span>Saved</span></button><button className="nav-item"><UserRound size={20} /><span>Profile</span></button></nav>
      </div>
      {selected && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="donation-sheet"><button onClick={() => setSelected(null)} aria-label="Close" className="modal-close"><X size={19} /></button><div className="sheet-handle" /><p className="eyebrow">Make an impact</p><h2 className="mt-2 font-serif text-3xl font-semibold leading-tight tracking-[-0.04em]">Support {selected.person}&apos;s story</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Your donation helps move this campaign closer to its goal.</p><div className="mt-6 grid grid-cols-3 gap-2">{['25', '50', '100'].map((value) => <button key={value} onClick={() => setAmount(value)} className={`amount-option ${amount === value ? 'amount-active' : ''}`}>${value}</button>)}</div><label className="mt-3 block text-xs font-semibold text-muted-foreground">Custom amount<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="amount-input" /></label><button onClick={donate} className="confirm-button">Donate ${amount} <Heart size={17} fill="currentColor" /></button><p className="mt-3 text-center text-[11px] text-muted-foreground">Mobile money payments secured by Sifalo Pay</p></div></div>}
    </main>
  )
}
