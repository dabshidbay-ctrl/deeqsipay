'use client'

import { useEffect, useState } from 'react'
import { formatMoney } from '@/lib/campaigns'
import { authedFetch } from '@/lib/supabase/session'
import { EmptyState } from '../../_components/admin-ui'

/**
 * The append-only money history for one campaign, read from /api/campaigns/[id]/ledger.
 *
 * Fetched on the client rather than on the server because the endpoint authenticates with
 * a bearer token the way every other authedFetch caller does, and because the ledger is
 * the slowest read on the page — the campaign detail above it should not wait for it.
 *
 * shortDate() is not imported from _lib/admin on purpose: that module pulls in the
 * server-only Supabase client, which cannot cross into a client bundle. The formatting is
 * repeated here instead so it still matches the rest of the admin area.
 */

type LedgerEntry = {
  id: string
  kind: string
  amountMinor: number
  currency: string
  note: string | null
  createdAt: string
  donationId: string | null
  payoutId: string | null
}

type LedgerTotals = { donatedMinor: number; refundedMinor: number; paidOutMinor: number; netMinor: number }

type Ledger = { entries: LedgerEntry[]; totals: LedgerTotals; balanceMinor: number; currency: string }

function entryDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Money leaving must read differently from money arriving, at a glance and without colour alone. */
function signed(minor: number, currency: string): string {
  return `${minor > 0 ? '+' : ''}${formatMoney(minor, currency)}`
}

function toneFor(minor: number): string {
  if (minor < 0) return 'text-red-500'
  if (minor > 0) return 'text-primary'
  return 'text-muted-foreground'
}

function Total({ label, minor, currency }: { label: string; minor: number; currency: string }) {
  return <div>
    <dt className="text-muted-foreground">{label}</dt>
    <dd className={`mt-1 font-semibold ${toneFor(minor)}`}>{signed(minor, currency)}</dd>
  </div>
}

export function LedgerPanel({ campaignId }: { campaignId: string }) {
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    authedFetch<Ledger>(`/api/campaigns/${campaignId}/ledger`)
      .then((result) => {
        if (cancelled) return
        setLedger(result)
        setLoading(false)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setError(caught instanceof Error ? caught.message : 'Could not load the ledger.')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [campaignId, attempt])

  return <section className="mt-8">
    <p className="eyebrow">Money history</p>

    {loading && <>
      <p className="sr-only" role="status">Loading the ledger.</p>
      <div className="mt-3 animate-pulse space-y-2" aria-hidden="true">
        <div className="h-28 rounded-2xl bg-muted" />
        <div className="h-16 rounded-xl bg-muted" />
        <div className="h-16 rounded-xl bg-muted" />
        <div className="h-16 rounded-xl bg-muted" />
      </div>
    </>}

    {!loading && error !== null && <div className="mt-3 rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-semibold text-red-500" role="alert">{error}</p>
      <button type="button" onClick={() => setAttempt((value) => value + 1)}
        className="mt-3 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-foreground">Try again</button>
    </div>}

    {!loading && error === null && ledger !== null && <>
      <div className="mt-3 rounded-2xl border border-border bg-card p-4">
        <dl className="grid grid-cols-2 gap-4 text-xs md:grid-cols-4">
          <Total label="Donated" minor={ledger.totals.donatedMinor} currency={ledger.currency} />
          <Total label="Refunded" minor={ledger.totals.refundedMinor} currency={ledger.currency} />
          <Total label="Paid out" minor={ledger.totals.paidOutMinor} currency={ledger.currency} />
          <Total label="Net" minor={ledger.totals.netMinor} currency={ledger.currency} />
        </dl>
        <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-border pt-4">
          <span className="text-xs text-muted-foreground">Balance <span className="block">after payouts already requested or approved</span></span>
          <span className={`shrink-0 font-serif text-xl ${toneFor(ledger.balanceMinor)}`}>{formatMoney(ledger.balanceMinor, ledger.currency)}</span>
        </div>
      </div>

      {/* A campaign refunded after its money was paid out is genuinely negative. Nothing
          here clamps or hides that: it is the one number an admin has to act on. */}
      {ledger.balanceMinor < 0 && <p className="mt-3 rounded-xl border border-red-500 bg-card p-3 text-xs leading-5 text-red-500" role="alert">
        <strong className="block font-bold">This campaign is overdrawn by {formatMoney(-ledger.balanceMinor, ledger.currency)}.</strong>
        Refunds have taken out more than the campaign still held after its payouts. That money has already left the platform — recovering it is a manual step, and nothing on this page does it.
      </p>}

      {ledger.entries.length === 0
        ? <EmptyState title="Nothing has moved yet." body="Every donation, refund and payout for this campaign will appear here, newest first." />
        : <ul className="mt-3 space-y-2">{ledger.entries.map((entry) => <li key={entry.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3">
            <span className="min-w-0">
              <span className="block text-sm font-semibold capitalize">{entry.kind}</span>
              {entry.note !== null && entry.note.trim() !== '' && <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{entry.note}</span>}
              <span className="mt-0.5 block text-xs text-muted-foreground">{entryDate(entry.createdAt)}</span>
            </span>
            <span className={`shrink-0 text-sm font-bold ${toneFor(entry.amountMinor)}`}>{signed(entry.amountMinor, entry.currency)}</span>
          </li>)}</ul>}

      {ledger.entries.length === 500 && <p className="mt-3 text-xs text-muted-foreground">Showing the 500 most recent entries.</p>}
    </>}
  </section>
}
