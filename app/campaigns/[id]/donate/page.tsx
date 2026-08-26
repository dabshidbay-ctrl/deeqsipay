import { notFound } from 'next/navigation'
import { getCampaign } from '@/lib/server/campaigns'
import { isDirectChargeEnabled } from '@/lib/server/sifalo'
import { DonateForm } from '@/components/donate-form'

export default async function DonatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (campaign === null) notFound()
  // Server-side flag: the client is told which flow to render, never the reverse.
  return <DonateForm campaign={campaign} directCharge={isDirectChargeEnabled()} />
}
