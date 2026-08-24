'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError, AuthRequiredError, authedFetch } from '@/lib/supabase/session'
import type { CampaignStatus } from '../../_lib/admin'

const ACTIONS: ReadonlyArray<{ status: CampaignStatus; label: string; hint: string }> = [
  { status: 'active', label: 'Approve', hint: 'Publishes it. Only active campaigns are visible to the public.' },
  { status: 'paused', label: 'Pause', hint: 'Takes it off the feed for now. The organiser can restart it.' },
  { status: 'hidden', label: 'Hide', hint: 'Hides it everywhere, including its direct link.' },
  { status: 'rejected', label: 'Reject', hint: 'Turns it down after review.' },
  { status: 'removed', label: 'Remove', hint: 'For campaigns that break the rules outright.' },
]

export function CampaignActions({ campaignId, currentStatus }: { campaignId: string; currentStatus: string }) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [pending, setPending] = useState<CampaignStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function applyStatus(status: CampaignStatus): Promise<void> {
    if (pending !== null) return
    setError(null)
    setDone(null)
    setPending(status)
    const trimmed = note.trim()
    try {
      await authedFetch(`/api/admin/campaigns/${campaignId}`, {
        method: 'PATCH',
        body: JSON.stringify(trimmed === '' ? { status } : { status, note: trimmed }),
      })
      setNote('')
      setDone(`Status set to ${status.replace(/_/g, ' ')}.`)
      router.refresh()
    } catch (err) {
      if (err instanceof AuthRequiredError) { router.push(`/login?next=/admin/campaigns/${campaignId}`); return }
      setError(err instanceof ApiError ? err.message : 'We could not reach the server. Please try again.')
    } finally {
      setPending(null)
    }
  }

  return <section className="mt-8">
    <p className="eyebrow">Moderator actions</p>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">The note is optional and stays internal — the organiser never sees it.</p>
    <label className="mt-3 block text-sm font-semibold">Note
      <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={1000}
        placeholder="Why you are making this call" className="amount-input resize-none font-normal" />
    </label>
    <div className="mt-4 grid gap-2 md:grid-cols-2">{ACTIONS.map((action) => {
      const current = action.status === currentStatus
      const busy = pending === action.status
      return <button key={action.status} type="button" disabled={current || pending !== null}
        onClick={() => { void applyStatus(action.status) }}
        className="flex flex-col items-start gap-1 rounded-xl border border-border bg-card p-3 text-left disabled:opacity-50">
        <span className="text-sm font-bold text-foreground">{busy ? 'Saving…' : action.label}{current && ' · current'}</span>
        <span className="text-xs leading-5 text-muted-foreground">{action.hint}</span>
      </button>
    })}</div>
    {error !== null && <p className="mt-3 text-xs font-semibold text-red-500" role="alert">{error}</p>}
    {done !== null && <p className="mt-3 text-xs font-semibold text-primary" role="status">{done}</p>}
  </section>
}
