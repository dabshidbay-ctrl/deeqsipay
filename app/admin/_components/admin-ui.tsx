import Link from 'next/link'

/**
 * Defined here rather than imported from _lib/admin, and re-exported by that module so
 * every existing caller is unaffected. _lib/admin reaches for the server-only Supabase
 * client, so importing it from this file would drag `next/headers` into the bundle of any
 * client component that reuses these presentational pieces — and they are meant to be
 * reusable from both sides of the boundary.
 */
export function statusLabel(status: string): string {
  return status.replace(/_/g, ' ')
}

// Statuses that mean "this is live and well", "this needs a human", and "this is over".
const GOOD = new Set(['active', 'completed', 'succeeded', 'approved', 'paid'])
const WAITING = new Set(['under_review', 'pending', 'requested', 'paused', 'open'])

export function StatusBadge({ status }: { status: string }) {
  const tone = GOOD.has(status)
    ? 'bg-accent-soft text-primary'
    : WAITING.has(status)
      ? 'bg-muted text-foreground'
      : 'bg-muted text-muted-foreground'
  return <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold capitalize ${tone}`}>{statusLabel(status)}</span>
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center">
    <p className="font-serif text-xl">{title}</p>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
  </div>
}

export function ReadOnlyNote({ className = '' }: { className?: string }) {
  return <p className={`text-xs text-muted-foreground ${className}`}>Read-only access — you can see everything here, and change nothing.</p>
}

/** Filter pills. Server-rendered links, so a filtered list is shareable and back works. */
export function FilterPills({ base, current, options, extra }: { base: string; current: string | null; options: readonly string[]; extra?: Record<string, string> }) {
  // Built with URLSearchParams so a filter stacked on top of another (say a campaign
  // scope) keeps both instead of producing a second '?'.
  const hrefFor = (status: string | null): string => {
    const search = new URLSearchParams(extra ?? {})
    if (status !== null) search.set('status', status)
    const query = search.toString()
    return query === '' ? base : `${base}?${query}`
  }
  return <nav className="scrollbar-hidden -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
    <Link href={hrefFor(null)} className={`pill capitalize ${current === null ? 'pill-active' : ''}`}>All</Link>
    {options.map((option) => <Link key={option} href={hrefFor(option)} className={`pill capitalize ${current === option ? 'pill-active' : ''}`}>{statusLabel(option)}</Link>)}
  </nav>
}

export function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return <div className="pb-1 pt-2">
    <p className="eyebrow">{eyebrow}</p>
    <h1 className="mt-1 font-serif text-[28px] leading-tight tracking-[-0.03em]">{title}</h1>
    {children}
  </div>
}
