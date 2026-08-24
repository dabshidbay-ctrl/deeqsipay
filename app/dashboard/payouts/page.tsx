import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Banknote } from 'lucide-react'
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server'
import { PayoutPanel } from '@/components/payout-panel'

type OwnedCampaign = { id: string; title: string; currency: string }

export default async function PayoutsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login?next=/dashboard/payouts')
  const supabase = await createSupabaseServerClient()

  // Owner-scoped read. RLS is the boundary; the .eq() is the narrowing filter, and every
  // balance and payout figure below is fetched per campaign by the owner-only API routes.
  const { data: campaignRows } = await supabase
    .from('campaigns')
    .select('id,title,currency')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  const owned = (campaignRows ?? []) as OwnedCampaign[]

  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto min-h-screen max-w-[470px] border-x border-border bg-background px-5 pb-16">
    <header className="flex items-center gap-4 pb-6 pt-7">
      <Link href="/dashboard" aria-label="Back" className="icon-button"><ArrowLeft size={18} /></Link>
      <div><p className="eyebrow">Organiser dashboard</p><h1 className="font-serif text-2xl leading-tight">Your payouts</h1></div>
    </header>

    {owned.length === 0 ? <section className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center">
      <Banknote className="mx-auto text-primary" size={24} />
      <p className="mt-3 font-serif text-xl">Nothing to pay out yet.</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Once you start a fundraiser and donations settle, you can ask for the money here.</p>
      <Link href="/create" className="confirm-button mt-6 inline-flex">Start a fundraiser</Link>
    </section> : <>
      <p className="text-sm leading-6 text-muted-foreground">
        Ask for money whenever you need it. An admin reviews each request before anything is sent, and you will see every step of it below.
      </p>
      <div className="mt-5 space-y-4">
        {owned.map((campaign) => <PayoutPanel key={campaign.id} campaignId={campaign.id} campaignTitle={campaign.title} currency={campaign.currency} />)}
      </div>
    </>}
  </div></main>
}
