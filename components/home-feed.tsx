'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { CampaignCard } from '@/components/kindred-shell'
import type { Campaign } from '@/lib/campaigns'

const categories = ['For you', 'Medical', 'Emergency', 'Community', 'Nonprofit', 'Education']

export function HomeFeed({ campaigns }: { campaigns: Campaign[] }) {
  const [active, setActive] = useState('For you')
  const filtered = useMemo(() => (active === 'For you' ? campaigns : campaigns.filter((campaign) => campaign.category === active)), [active, campaigns])

  return <>
    <section className="scrollbar-hidden flex gap-2 overflow-x-auto px-5 pb-7" aria-label="Campaign categories">{categories.map((category) => <button key={category} onClick={() => setActive(category)} aria-pressed={active === category} className={`pill ${active === category ? 'pill-active' : ''}`}>{category}</button>)}</section>
    <section className="px-5"><div className="mb-4 flex items-end justify-between"><div><p className="eyebrow">Curated for you</p><h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.03em]">Stories worth sharing</h2></div><Link href="/explore" className="flex items-center gap-1 text-xs font-semibold text-primary">See all <ChevronRight size={14} /></Link></div>
      {filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-8 text-center"><p className="eyebrow">Nothing here yet</p><h3 className="mt-2 font-serif text-xl font-semibold tracking-[-0.03em]">No stories in this category</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Be the first — start a fundraiser for the cause you care about.</p></div> : <div className="space-y-5">{filtered.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}</div>}
    </section>
  </>
}
