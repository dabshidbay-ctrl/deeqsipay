'use client'

import { useCallback, useEffect, useState } from 'react'
import { Heart, Loader2 } from 'lucide-react'
import { formatMoney, initials } from '@/lib/campaigns'

const PAGE_SIZE = 5

type Donor = { name: string; amountMinor: number; currency: string; createdAt: string; anonymous: boolean }
type DonorsResponse = { donors: Donor[]; total: number; hasMore: boolean }

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`
}

export function DonorList({ campaignId }: { campaignId: string }) {
  const [donors, setDonors] = useState<Donor[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async (offset: number) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/donors?limit=${PAGE_SIZE}&offset=${offset}`)
      if (!response.ok) throw new Error('failed')
      const data = await response.json() as DonorsResponse
      setDonors((current) => (offset === 0 ? data.donors : [...current, ...data.donors]))
      setTotal(data.total)
      setHasMore(data.hasMore)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => { void load(0) }, [load])

  if (error) return null
  if (loading && donors.length === 0) {
    return <section className="mt-8"><div className="h-5 w-32 animate-pulse rounded bg-muted" /><div className="mt-4 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />)}</div></section>
  }
  if (donors.length === 0) {
    return <section className="mt-8 rounded-2xl border border-dashed border-border p-6 text-center">
      <Heart className="mx-auto text-primary" size={22} />
      <p className="mt-3 font-serif text-lg">No donations yet.</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Be the first to support this story.</p>
    </section>
  }

  return <section className="mt-8">
    <div className="flex items-end justify-between">
      <div><p className="eyebrow">Kindness so far</p><h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.03em]">{total} {total === 1 ? 'donor' : 'donors'}</h2></div>
    </div>

    <ul className="mt-4 space-y-2.5">
      {donors.map((donor, index) => <li key={`${donor.createdAt}-${index}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
        <span className={`mini-avatar ${donor.anonymous ? '' : ['sun', 'sky', 'mint'][index % 3]}`} aria-hidden="true">{donor.anonymous ? '?' : initials(donor.name)}</span>
        <span className="min-w-0 flex-1 text-sm leading-5">
          <strong className={`block truncate font-semibold ${donor.anonymous ? 'text-muted-foreground' : 'text-foreground'}`}>{donor.name}</strong>
          <span className="text-xs text-muted-foreground">donated {formatMoney(donor.amountMinor, donor.currency)} · {timeAgo(donor.createdAt)}</span>
        </span>
      </li>)}
    </ul>

    {hasMore && <button onClick={() => void load(donors.length)} disabled={loading} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card py-3 text-xs font-bold disabled:opacity-50">
      {loading ? <><Loader2 size={14} className="animate-spin" /> Loading</> : `Show more donors`}
    </button>}
  </section>
}
