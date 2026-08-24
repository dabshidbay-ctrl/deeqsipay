import { Search } from 'lucide-react'
import { CampaignCard, PageFrame, seededCampaigns } from '@/components/kindred-shell'

export default function ExplorePage() {
  return <PageFrame active="explore" eyebrow="explore with purpose"><section className="px-5 pb-6 pt-8"><p className="eyebrow">Find your next cause</p><h1 className="mt-2 font-serif text-[39px] font-semibold leading-none tracking-[-0.045em]">Explore <em className="text-primary">good.</em></h1><div className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-muted-foreground"><Search size={18} /><span className="text-sm">Search campaigns, people, or places</span></div></section><section className="space-y-5 px-5">{seededCampaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}</section></PageFrame>
}
