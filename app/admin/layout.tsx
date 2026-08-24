import Link from 'next/link'
import { AdminNav } from './_components/admin-nav'
import { ReadOnlyNote } from './_components/admin-ui'
import { requireStaff } from './_lib/admin'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireStaff()
  return <main className="min-h-screen bg-background text-foreground">
    <div className="mx-auto min-h-screen max-w-[470px] border-x border-border bg-background px-5 pb-16 shadow-[0_0_60px_rgba(25,50,40,0.05)] md:max-w-[900px] md:px-8">
      <header className="pb-6 pt-7">
        <div className="flex items-start justify-between gap-4">
          <Link href="/admin" className="block">
            <p className="font-serif text-[29px] font-semibold leading-none tracking-[-0.04em] text-foreground">kindred</p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">admin</p>
          </Link>
          <span className="rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">{role}</span>
        </div>
        <AdminNav />
        {role === 'moderator' && <ReadOnlyNote className="mt-3" />}
      </header>
      {children}
    </div>
  </main>
}
