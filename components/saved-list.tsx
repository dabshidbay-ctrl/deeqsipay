'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bookmark, ChevronRight, Share2 } from 'lucide-react'
import { CampaignCard } from '@/components/kindred-shell'
import { SaveButton } from '@/components/save-button'
import { ApiError, AuthRequiredError, authedFetch } from '@/lib/supabase/session'
import type { Campaign } from '@/lib/campaigns'

function toCampaignList(data: unknown): Campaign[] {
  if (typeof data !== 'object' || data === null) return []
  const campaigns = (data as { campaigns?: unknown }).campaigns
  return Array.isArray(campaigns) ? (campaigns as Campaign[]) : []
}

export function SavedList() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    authedFetch('/api/saved')
      .then((data) => toCampaignList(data))
      .then((list) => { if (!cancelled) setCampaigns(list) })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof AuthRequiredError) { router.replace('/login?next=/saved'); return }
        setCampaigns([])
        setError(err instanceof ApiError ? err.message : 'We could not load your saves. Please refresh.')
      })
    return () => { cancelled = true }
  }, [router])

  function unsave(campaignId: string): void {
    if (campaigns === null) return
    const removed = campaigns.find((entry) => entry.id === campaignId)
    if (removed === undefined) return
    const index = campaigns.indexOf(removed)
    setCampaigns(campaigns.filter((entry) => entry.id !== campaignId))
    authedFetch('/api/saved', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId }),
    }).catch(() => {
      setCampaigns((current) => {
        const next = [...(current ?? [])]
        next.splice(Math.min(index, next.length), 0, removed)
        return next
      })
      setError('That save could not be removed. Please try again.')
    })
  }

  const loaded = campaigns !== null
  const count = campaigns?.length ?? 0

  return (
    <>
      <section className="px-5 pb-6 pt-8">
        <p className="eyebrow">Keep close</p>
        <div className="flex items-end justify-between gap-3">
          <h1 className="mt-2 font-serif text-[39px] font-semibold leading-none tracking-[-0.045em]">Saved <em className="text-primary">stories.</em></h1>
          <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-primary">{count} saved</span>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">Campaigns you want to remember, revisit, and share.</p>
      </section>
      {!loaded ? (
        <section className="space-y-5 px-5" aria-label="Loading saved campaigns">
          {[0, 1].map((index) => (
            <div key={index} className="animate-pulse space-y-3 rounded-2xl border border-border bg-card p-5">
              <div className="h-36 rounded-xl bg-muted" />
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
          ))}
        </section>
      ) : count === 0 ? (
        <section className="mx-5 mt-2 rounded-2xl border border-dashed border-border p-6 text-center">
          <Bookmark className="mx-auto text-primary" size={24} />
          <p className="mt-3 font-serif text-xl">Nothing saved yet.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Tap the bookmark on any campaign and it will wait for you here.</p>
          <Link href="/explore" className="mt-3 inline-block text-xs font-bold text-primary">Explore more campaigns</Link>
        </section>
      ) : (
        <>
          <section className="space-y-5 px-5">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="relative">
                <div className="absolute right-3 top-3 z-10">
                  <SaveButton campaignId={campaign.id} initialSaved onSavedChange={(saved) => { if (!saved) unsave(campaign.id) }} />
                </div>
                <CampaignCard campaign={campaign} />
              </div>
            ))}
          </section>
          <section className="mx-5 mt-8 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-full bg-muted text-primary"><Share2 size={17} /></div>
              <div>
                <p className="font-semibold">Good stories travel</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Share a campaign with someone who might care.</p>
              </div>
              <ChevronRight className="ml-auto text-muted-foreground" size={18} />
            </div>
          </section>
        </>
      )}
      {error !== null && <p className="mx-5 mt-4 text-xs font-semibold text-red-500" role="alert">{error}</p>}
    </>
  )
}
