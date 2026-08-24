import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Heart, Share2 } from 'lucide-react'
import { daysLeft, formatMoney, initials, progressPercent } from '@/lib/campaigns'
import { getCampaign } from '@/lib/server/campaigns'
import { DonorList } from '@/components/donor-list'

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
  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto min-h-screen max-w-[470px] border-x border-border bg-background pb-10"><div className="relative"><img src={campaign.imageUrl ?? '/placeholder.jpg'} alt={campaign.title} className="campaign-image h-72" /><div className="absolute left-5 top-6 flex gap-2"><Link href="/" aria-label="Back" className="icon-button"><ArrowLeft size={18} /></Link><button aria-label="Share" className="icon-button"><Share2 size={18} /></button></div></div><section className="px-5 pt-6"><span className="category-badge static inline-block">{campaign.category}</span><h1 className="mt-4 font-serif text-[36px] font-semibold leading-tight tracking-[-0.04em]">{campaign.title}</h1><div className="mt-4 flex items-center gap-2"><span className="mini-avatar sky">{initials(organizer)}</span><span className="text-sm text-muted-foreground">Organized by <strong className="text-foreground">{organizer}</strong></span></div><p className="mt-6 text-sm leading-7 text-muted-foreground">{campaign.description}</p><div className="mt-7 rounded-2xl bg-card p-4"><div className="flex justify-between text-sm"><strong>{formatMoney(campaign.raisedMinor, campaign.currency)} raised</strong><span className="text-muted-foreground">of {formatMoney(campaign.goalMinor, campaign.currency)}</span></div><div className="progress-track mt-3"><div className="progress-fill" style={{ width: `${percent}%` }} /></div><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{campaign.donorCount} donors</span>{remaining !== null && <span>{remaining} days left</span>}</div></div><DonorList campaignId={campaign.id} /><Link href={`/campaigns/${campaign.id}/donate`} className="confirm-button mt-6">Donate to this story <Heart size={17} fill="currentColor" /></Link></section></div></main>
}
