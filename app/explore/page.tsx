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
    <section className="px-5 pb-6 pt-8"><h1 className="font-serif text-[30px] font-semibold leading-tight tracking-[-0.02em]">Explore</h1><form action="/explore" method="get" className="mt-5 flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5 text-muted-foreground"><Search size={18} /><input name="q" defaultValue={rawQuery} placeholder="Search fundraisers" className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" /></form></section>
    <section className="space-y-5 px-5">{filtered.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}</section>
  </PageFrame>
}
