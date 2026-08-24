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
