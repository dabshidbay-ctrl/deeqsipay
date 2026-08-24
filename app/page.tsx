import { Plus, Sparkles } from 'lucide-react'
import { HomeFeed } from '@/components/home-feed'
import { PageFrame } from '@/components/kindred-shell'
import Link from 'next/link'
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server'
import { listCampaigns } from '@/lib/server/campaigns'

// Must use the cookie-aware server client: createAuthClient() is a bare anon client
// with persistSession false, so auth.getUser() there is always null.
async function getDisplayName(): Promise<string> {
  try {
  const user = await getSessionUser()
  const userId = user?.id
  if (!userId) return 'there'
  const supabase = await createSupabaseServerClient()
  const { data: profileData } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle()
  const profile = (profileData ?? null) as { display_name?: string | null } | null
  const name = profile?.display_name?.trim() ?? ''
  return name.length > 0 ? name : 'there'
  } catch { return 'there' }
}

export default async function Page() {
  const [campaigns, displayName] = await Promise.all([listCampaigns(), getDisplayName()])
  return <PageFrame active="home" eyebrow="funding good things">
    <section className="px-5 pb-5 pt-8"><p className="eyebrow">Good morning, {displayName}</p><h1 className="mt-2 max-w-[350px] font-serif text-[39px] font-semibold leading-[1.04] tracking-[-0.045em]">Small acts.<br /><em className="text-primary">Big ripples.</em></h1><p className="mt-4 max-w-[320px] text-sm leading-6 text-muted-foreground">Discover people and causes making a difference — and be part of their story.</p></section>
    <HomeFeed campaigns={campaigns} />
    <section className="mx-5 mt-7 rounded-2xl bg-primary p-5 text-primary-foreground"><div className="flex items-start justify-between"><div><Sparkles size={19} /><h2 className="mt-3 font-serif text-[23px] font-semibold leading-tight">Your kindness<br />can start a story.</h2></div><div className="rounded-full border border-primary-foreground/20 p-2"><Plus size={20} /></div></div><p className="mt-3 text-xs leading-5 text-primary-foreground/70">Have a cause close to your heart? Create a fundraiser and invite your community in.</p><Link href="/create" className="mt-4 inline-block rounded-full bg-background px-4 py-2.5 text-xs font-bold text-foreground">Start a fundraiser</Link></section>
  </PageFrame>
}
