import { notFound } from 'next/navigation'
import { getCampaign } from '@/lib/server/campaigns'
import { DonateForm } from '@/components/donate-form'

export default async function DonatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (campaign === null) notFound()
  return <DonateForm campaign={campaign} />
}
