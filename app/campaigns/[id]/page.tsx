import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Heart } from 'lucide-react'
import { daysLeft, feeMinor, formatMoney, initials, netMinor, progressPercent } from '@/lib/campaigns'
import { getCampaign } from '@/lib/server/campaigns'
import { CampaignGallery } from '@/components/campaign-gallery'
import { DonorList } from '@/components/donor-list'
import { ShareButton } from '@/components/share-button'

type CampaignPageProps = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: CampaignPageProps): Promise<Metadata> {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (!campaign) return { title: 'Campaign not found' }
  const text = campaign.description.slice(0, 160)
  return { title: campaign.title, description: text }
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (!campaign) notFound()
  const organizer = campaign.owner?.fullName || campaign.owner?.displayName || 'Anonymous'
  const percent = progressPercent(campaign.raisedMinor, campaign.goalMinor)
  const remaining = daysLeft(campaign.endsAt)
  const net = netMinor(campaign.raisedMinor, campaign.feePercent)
  const fee = feeMinor(campaign.raisedMinor, campaign.feePercent)
  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto min-h-screen max-w-[470px] border-x border-border bg-background pb-10">
    <div className="relative">
      <CampaignGallery photos={campaign.photos} coverUrl={campaign.imageUrl} title={campaign.title} />
      <div className="absolute left-5 top-6 flex gap-2">
        <Link href="/" aria-label="Back" className="icon-button"><ArrowLeft size={18} /></Link>
        <ShareButton path={`/campaigns/${campaign.id}`} title={campaign.title} />
      </div>
    </div>
    <section className="px-5 pt-5">
      <span className="category-badge static inline-block">{campaign.category}</span>
      <h1 className="mt-4 font-serif text-[36px] font-semibold leading-tight tracking-[-0.04em]">{campaign.title}</h1>
      <div className="mt-4 flex items-center gap-2">
        <span className="mini-avatar sky">{initials(organizer)}</span>
        <span className="text-sm text-muted-foreground">Organized by <strong className="text-foreground">{organizer}</strong></span>
      </div>

      {/* Plain text description */}
      <p className="mt-6 text-sm leading-7 text-muted-foreground whitespace-pre-line">{campaign.description}</p>

      {/* Fundraising progress */}
      <div className="mt-7 rounded-2xl bg-card p-4">
        <div className="flex justify-between text-sm">
          <strong>{formatMoney(campaign.raisedMinor, campaign.currency)} raised</strong>
          <span className="text-muted-foreground">of {formatMoney(campaign.goalMinor, campaign.currency)}</span>
        </div>
        <div className="progress-track mt-3"><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
        <div className="mt-3 flex justify-between text-xs text-muted-foreground">
          <span>{campaign.donorCount} donors</span>
          {remaining !== null && <span>{remaining} days left</span>}
        </div>
        {/* Net earnings after fee */}
        {campaign.raisedMinor > 0 && (
          <div className="mt-3 rounded-xl bg-accent-softer p-3 text-xs leading-5">
            <p className="text-muted-foreground">
              After the <strong>{campaign.feePercent}%</strong> platform fee,{' '}
              <strong className="text-foreground">{formatMoney(net, campaign.currency)}</strong>{' '}
              would reach the organiser.
            </p>
            <p className="mt-1 text-muted-foreground">
              Fee: {formatMoney(fee, campaign.currency)}
            </p>
          </div>
        )}
      </div>

      <DonorList campaignId={campaign.id} />
      <Link href={`/campaigns/${campaign.id}/donate`} className="confirm-button mt-6">
        Donate to this story <Heart size={17} fill="currentColor" />
      </Link>
    </section>
  </div></main>
}
