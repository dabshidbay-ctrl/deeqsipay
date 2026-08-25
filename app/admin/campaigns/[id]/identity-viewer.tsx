'use client'

import { useState } from 'react'
import { ExternalLink, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { authedFetch } from '@/lib/supabase/session'

/**
 * Opens an organiser's identity document.
 *
 * The document is never embedded and never cached in component state as a URL that
 * outlives the click: the endpoint mints a 60-second signed URL, we hand it straight to
 * a new tab, and drop it. Rendering it inline would put a passport into the page's
 * history, screenshots and any error report that captures the DOM.
 */
export function IdentityViewer({ campaignId, hasDocument }: { campaignId: string; hasDocument: boolean }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!hasDocument) {
    return <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-xs leading-5 text-muted-foreground">
      No identity document on file. Campaigns created before verification was required will not have one.
    </p>
  }

  async function open() {
    setLoading(true)
    setError(null)
    try {
      const result = await authedFetch<{ url: string }>(`/api/admin/campaigns/${campaignId}/identity`)
      // Straight to a new tab; the URL is not stored anywhere.
      window.open(result.url, '_blank', 'noopener,noreferrer')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open the document.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="mt-3">
    <button type="button" onClick={() => void open()} disabled={loading}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-left disabled:opacity-50">
      <span className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-primary"><Lock size={16} /></span>
        <span className="text-xs leading-5">
          <strong className="block text-sm font-semibold">View proof of identity</strong>
          <span className="text-muted-foreground">Opens for 60 seconds, then the link dies.</span>
        </span>
      </span>
      {loading ? <Loader2 size={16} className="shrink-0 animate-spin text-primary" /> : <ExternalLink size={16} className="shrink-0 text-muted-foreground" />}
    </button>
    {error !== null && <p role="alert" className="mt-2 text-xs font-semibold text-red-500">{error}</p>}
    <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
      <ShieldCheck size={12} className="mt-0.5 shrink-0 text-primary" />
      Verify the name matches the organiser, then close the tab. Do not download or forward this document.
    </p>
  </div>
}
