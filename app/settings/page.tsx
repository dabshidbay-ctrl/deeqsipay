import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, ChevronRight, LogOut, Lock, Mail, ShieldCheck } from 'lucide-react'
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server'
import { FullNameEditor } from '@/components/full-name-editor'

export default async function SettingsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login?next=/settings')
  const supabase = await createSupabaseServerClient()
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()

  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto min-h-screen max-w-[470px] border-x border-border bg-background px-5">
    <header className="flex items-center gap-4 pb-8 pt-7"><Link href="/profile" aria-label="Back" className="icon-button"><ArrowLeft size={18} /></Link><h1 className="font-serif text-2xl">Account settings</h1></header>
    <section className="space-y-3">
      <FullNameEditor initial={(profile as { full_name?: string | null } | null)?.full_name ?? null} />
      <div className="rounded-2xl bg-card p-4"><p className="eyebrow">Account</p>
        <div className="mt-4 flex items-center justify-between border-b border-border pb-4"><span className="flex items-center gap-3 text-sm"><Mail size={18} className="text-primary" /> Email address</span><span className="text-xs text-muted-foreground">{user.email}</span></div>
        <Link href="/forgot-password" className="flex items-center justify-between pt-4"><span className="flex items-center gap-3 text-sm"><Lock size={18} className="text-primary" /> Change password</span><ChevronRight size={18} className="text-muted-foreground" /></Link>
      </div>
      <div className="rounded-2xl bg-card p-4"><p className="eyebrow">Trust &amp; safety</p><div className="mt-4 flex gap-3"><ShieldCheck size={20} className="text-primary" /><p className="text-xs leading-5 text-muted-foreground">Payments are processed securely through Sifalo Pay. We never store your mobile money PIN.</p></div></div>
      <form action="/auth/signout" method="post"><button type="submit" className="flex w-full items-center justify-between rounded-2xl border border-border bg-card p-4 text-left"><span className="flex items-center gap-3 text-sm font-semibold"><LogOut size={18} className="text-primary" /> Sign out</span><ChevronRight size={18} className="text-muted-foreground" /></button></form>
    </section>
  </div></main>
}
