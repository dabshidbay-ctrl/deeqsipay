import { HomeFeed } from '@/components/home-feed'
import { PageFrame } from '@/components/kindred-shell'
import Link from 'next/link'
import { listCampaigns } from '@/lib/server/campaigns'

export default async function Page() {
  const campaigns = await listCampaigns()
  return <PageFrame active="home" eyebrow="Fundraising for people and causes">
    <section className="px-5 pb-5 pt-8"><h1 className="max-w-[360px] font-serif text-[34px] font-semibold leading-[1.08] tracking-[-0.02em]">Fund causes you care about.</h1><p className="mt-3 max-w-[330px] text-sm leading-6 text-muted-foreground">Browse active fundraisers and give directly to the people running them.</p></section>
    <HomeFeed campaigns={campaigns} />
    <section className="mx-5 mt-8 rounded-xl border border-border p-5"><h2 className="font-serif text-xl font-semibold tracking-[-0.01em]">Running a fundraiser?</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Create one and share it with your community. Every campaign is reviewed before it goes live.</p><Link href="/create" className="confirm-button mt-4 inline-flex w-auto px-4">Start a fundraiser</Link></section>
  </PageFrame>
}
