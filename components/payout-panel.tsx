'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Ban, Banknote, RefreshCw, ShieldCheck } from 'lucide-react'
import { ApiError, AuthRequiredError, authedFetch } from '@/lib/supabase/session'
import { formatMoney, progressPercent } from '@/lib/campaigns'

const PAYOUT_STATUSES = ['requested', 'approved', 'paid', 'rejected', 'cancelled'] as const
type PayoutStatus = (typeof PAYOUT_STATUSES)[number]

type Balance = { availableMinor: number; raisedMinor: number; reservedMinor: number; currency: string }
type Payout = {
  id: string
  amountMinor: number
  currency: string
  status: PayoutStatus
  createdAt: string | null
  decisionNote: string | null
  providerReference: string | null
}

// Contract: payouts.amount_minor carries `check (amount_minor >= 100)`.
const MIN_PAYOUT_MINOR = 100
const MAX_PAYOUT_MINOR = 1_000_000_000
const AMOUNT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/
const LOGIN_NEXT = '/login?next=/dashboard/payouts'

const STATUS_BADGES: Record<PayoutStatus, { label: string; tone: string }> = {
  requested: { label: 'awaiting admin review', tone: 'bg-muted text-muted-foreground' },
  approved: { label: 'approved, payment pending', tone: 'bg-accent-softer text-primary' },
  paid: { label: 'paid', tone: 'bg-primary text-primary-foreground' },
  rejected: { label: 'declined', tone: 'bg-red-500/10 text-red-500' },
  cancelled: { label: 'cancelled', tone: 'bg-muted text-muted-foreground' },
}

/** Money only ever crosses this boundary as integer minor units, never as a float. */
function parseAmountMinor(raw: string): number | null {
  if (!AMOUNT_PATTERN.test(raw)) return null
  const minor = Math.round(Number(raw) * 100)
  if (!Number.isSafeInteger(minor) || minor < MIN_PAYOUT_MINOR || minor > MAX_PAYOUT_MINOR) return null
  return minor
}

/** Minor units back to an input string with integer maths only, so no float can shave a cent. */
function minorToInputValue(minor: number): string {
  const whole = Math.floor(minor / 100)
  const cents = minor % 100
  return cents === 0 ? String(whole) : `${whole}.${String(cents).padStart(2, '0')}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** bigint columns arrive as JSON numbers or as digit strings; both are exact integers here. */
function readMinor(source: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value
    if (typeof value === 'string' && /^\d{1,15}$/.test(value)) return Number(value)
  }
  return null
}

function readText(source: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return null
}

function parseBalance(payload: unknown, fallbackCurrency: string): Balance | null {
  const root = asRecord(payload)
  if (root === null) return null
  const source = asRecord(root.balance) ?? root
  const availableMinor = readMinor(source, ['availableMinor', 'available_minor'])
  const raisedMinor = readMinor(source, ['raisedMinor', 'raised_minor'])
  const reservedMinor = readMinor(source, ['reservedMinor', 'reserved_minor'])
  if (availableMinor === null || raisedMinor === null || reservedMinor === null) return null
  return { availableMinor, raisedMinor, reservedMinor, currency: readText(source, ['currency']) ?? fallbackCurrency }
}

function parsePayout(value: unknown, fallbackCurrency: string): Payout | null {
  const row = asRecord(value)
  if (row === null) return null
  const id = readText(row, ['id'])
  const amountMinor = readMinor(row, ['amountMinor', 'amount_minor'])
  const rawStatus = readText(row, ['status'])
  if (id === null || amountMinor === null || rawStatus === null) return null
  const status = PAYOUT_STATUSES.find((candidate) => candidate === rawStatus)
  if (status === undefined) return null
  return {
    id,
    amountMinor,
    currency: readText(row, ['currency']) ?? fallbackCurrency,
    status,
    createdAt: readText(row, ['createdAt', 'created_at']),
    decisionNote: readText(row, ['decisionNote', 'decision_note']),
    providerReference: readText(row, ['providerReference', 'provider_reference']),
  }
}

function parsePayouts(payload: unknown, fallbackCurrency: string): Payout[] {
  const root = asRecord(payload)
  const rawList: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.payouts)
      ? root.payouts
      : Array.isArray(root?.data)
        ? root.data
        : []
  const parsed: Payout[] = []
  for (const item of rawList) {
    const payout = parsePayout(item, fallbackCurrency)
    if (payout !== null) parsed.push(payout)
  }
  return parsed
}

function payoutDate(iso: string | null): string {
  if (iso === null) return 'recently'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'recently'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PayoutPanel({ campaignId, campaignTitle, currency }: { campaignId: string; campaignTitle: string; currency: string }) {
  const router = useRouter()
  const [balance, setBalance] = useState<Balance | null>(null)
  const [payouts, setPayouts] = useState<Payout[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null)
    try {
      const [balancePayload, payoutsPayload] = await Promise.all([
        authedFetch<unknown>(`/api/campaigns/${campaignId}/balance`),
        authedFetch<unknown>(`/api/campaigns/${campaignId}/payouts`),
      ])
      const nextBalance = parseBalance(balancePayload, currency)
      if (nextBalance === null) throw new ApiError(502, 'We got an unexpected reply while checking your balance.')
      setBalance(nextBalance)
      setPayouts(parsePayouts(payoutsPayload, nextBalance.currency))
    } catch (err) {
      if (err instanceof AuthRequiredError) { router.push(LOGIN_NEXT); return }
      setLoadError(err instanceof ApiError ? err.message : 'We could not load your balance. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [campaignId, currency, router])

  useEffect(() => { void load() }, [load])

  function refresh(): void {
    setLoading(true)
    void load()
  }

  const displayCurrency = balance?.currency ?? currency
  const trimmed = amount.trim()
  const parsedMinor = trimmed === '' ? null : parseAmountMinor(trimmed)
  const formatInvalid = trimmed !== '' && parsedMinor === null

  // This cap is a UX affordance ONLY. The server re-derives the balance with
  // campaign_available_minor() inside the same transaction that inserts the payout, holding
  // SELECT ... FOR UPDATE on the campaign row, and that derivation is the one true authority.
  // This comparison must never be treated as the enforcement point: it runs against numbers that
  // may already be stale (a concurrent request can consume the balance between this render and
  // the POST), and everything here executes in a browser the holder can edit at will. Its only
  // job is to stop an honest organiser from typing a number that was always going to be refused.
  const exceedsAvailable = parsedMinor !== null && balance !== null && parsedMinor > balance.availableMinor

  // The DB permits one open payout per campaign. An approved one is still open — its money is
  // still reserved and it has not reached a terminal state — so neither can be joined by another.
  const openPayout = payouts?.find((payout) => payout.status === 'requested' || payout.status === 'approved') ?? null
  const nothingAvailable = balance !== null && balance.availableMinor < MIN_PAYOUT_MINOR
  const formDisabled = balance === null || openPayout !== null || nothingAvailable
  const canSubmit = !formDisabled && !submitting && parsedMinor !== null && !exceedsAvailable

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!canSubmit || parsedMinor === null) return
    setSubmitting(true)
    setServerError(null)
    setNotice(null)
    try {
      await authedFetch(`/api/campaigns/${campaignId}/payouts`, { method: 'POST', body: JSON.stringify({ amountMinor: parsedMinor }) })
      setAmount('')
      setNotice(`We have your request for ${formatMoney(parsedMinor, displayCurrency)}. An admin reviews it next, usually within a couple of working days, and the status below updates the moment they do.`)
      await load()
    } catch (err) {
      if (err instanceof AuthRequiredError) { router.push(LOGIN_NEXT); return }
      if (err instanceof ApiError) {
        // The server said no, most often because a concurrent request already took this money.
        // Show exactly what it said and re-read the balance. We never quietly resubmit: a silent
        // retry would be a second request against a balance we were just told we had misread.
        setServerError(err.message)
        await load()
        return
      }
      setServerError('We could not reach the network, so nothing was requested. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel(id: string): Promise<void> {
    if (payouts === null || cancellingId !== null) return
    const snapshot = payouts
    setCancelError(null)
    setNotice(null)
    setCancellingId(id)
    // Optimistic: show it cancelled straight away, put the original row back if the server refuses.
    setPayouts(snapshot.map((payout) => (payout.id === id ? { ...payout, status: 'cancelled' } : payout)))
    try {
      await authedFetch(`/api/payouts/${id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setPayouts(snapshot)
      if (err instanceof AuthRequiredError) { router.push(LOGIN_NEXT); return }
      setCancelError(err instanceof ApiError ? err.message : 'We could not reach the network, so the request is still open.')
    } finally {
      setCancellingId(null)
    }
  }

  const reservedPercent = balance === null ? 0 : progressPercent(balance.reservedMinor, balance.raisedMinor)

  return (
    <article className="campaign-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Balance</p>
          <h2 className="mt-1 font-serif text-lg leading-tight">{campaignTitle}</h2>
        </div>
        <button suppressHydrationWarning type="button" onClick={refresh} disabled={loading} aria-label="Refresh balance" className="icon-button shrink-0">
          <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
        </button>
      </div>

      {loading && balance === null ? (
        <div className="mt-4 space-y-3" aria-hidden="true">
          <div className="h-11 w-2/3 animate-pulse rounded-xl bg-muted" />
          <div className="progress-track"><div className="progress-fill w-1/3 animate-pulse" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
          </div>
          <div className="h-11 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : loadError !== null ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border p-5 text-center">
          <AlertCircle className="mx-auto text-red-500" size={20} />
          <p className="mt-2 text-sm leading-6 text-muted-foreground" role="alert">{loadError}</p>
          <button suppressHydrationWarning type="button" className="confirm-button mt-4" onClick={refresh}>Try again</button>
        </div>
      ) : balance !== null ? (
        <>
          <section className="mt-4">
            <p className="text-xs text-muted-foreground">Available to request now</p>
            <p className="mt-1 font-serif text-[34px] leading-none tracking-[-0.04em]">{formatMoney(balance.availableMinor, displayCurrency)}</p>
            <div className="progress-track mt-3"><div className="progress-fill" style={{ width: `${reservedPercent}%` }} /></div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border p-3">
                <p className="font-serif text-lg leading-none">{formatMoney(balance.raisedMinor, displayCurrency)}</p>
                <p className="mt-1.5 text-xs leading-4 text-muted-foreground">raised and settled</p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="font-serif text-lg leading-none">{formatMoney(balance.reservedMinor, displayCurrency)}</p>
                <p className="mt-1.5 text-xs leading-4 text-muted-foreground">held for payouts in progress</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Anything you have already asked for stays held until it is paid or declined, so the same money can never leave twice. We work this out fresh from your donations every time you look.
            </p>
          </section>

          <section className="mt-6">
            <p className="eyebrow">Request a payout</p>
            {openPayout !== null ? (
              <div className="mt-3 rounded-xl border border-border bg-muted p-4">
                <p className="text-sm font-semibold">{openPayout.status === 'requested' ? 'One request at a time' : 'Your payment is on its way'}</p>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  {openPayout.status === 'requested'
                    ? `Your request for ${formatMoney(openPayout.amountMinor, openPayout.currency)} is with an admin now. You can only have one open at a time, so if the amount is wrong, cancel it below and ask again.`
                    : `${formatMoney(openPayout.amountMinor, openPayout.currency)} has been approved and is being sent to you. Once it is marked paid, you can request whatever is left.`}
                </p>
              </div>
            ) : nothingAvailable ? (
              <div className="mt-3 rounded-xl border border-dashed border-border p-5 text-center">
                <Banknote className="mx-auto text-muted-foreground" size={18} />
                <p className="mt-2 text-sm font-semibold">Nothing to withdraw yet</p>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">Payouts start at {formatMoney(MIN_PAYOUT_MINOR, displayCurrency)}. As donations settle, they will show up here.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-3">
                <button suppressHydrationWarning type="button" disabled={submitting} onClick={() => { setAmount(minorToInputValue(balance.availableMinor)); setServerError(null) }}
                  className={parsedMinor === balance.availableMinor ? 'amount-option amount-active w-full' : 'amount-option w-full'}>
                  Request full balance · {formatMoney(balance.availableMinor, displayCurrency)}
                </button>
                <label className="mt-4 block text-sm font-semibold">Or choose an amount
                  <input suppressHydrationWarning value={amount} onChange={(event) => { setAmount(event.target.value); setServerError(null) }} inputMode="decimal"
                    autoComplete="off" placeholder="0.00" disabled={submitting} className="amount-input" />
                </label>
                {formatInvalid && (
                  <p className="mt-2 text-xs font-semibold text-red-500" role="alert">
                    Enter a number like 250 or 250.50 — at least {formatMoney(MIN_PAYOUT_MINOR, displayCurrency)}, with at most 2 decimals.
                  </p>
                )}
                {exceedsAvailable && (
                  <p className="mt-2 text-xs font-semibold text-red-500" role="alert">
                    That is more than you have available. You can request up to {formatMoney(balance.availableMinor, displayCurrency)} right now.
                  </p>
                )}
                {serverError !== null && (
                  <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-xs font-semibold leading-5 text-red-500" role="alert">
                    {serverError} Nothing was requested. We have just refreshed the figures above, so have a look and try again if it still makes sense.
                  </p>
                )}
                <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground"><ShieldCheck size={13} /> An admin checks every payout before any money moves</p>
                <button suppressHydrationWarning type="submit" className="confirm-button" disabled={!canSubmit}>
                  {submitting ? 'Sending your request…' : parsedMinor !== null && !exceedsAvailable ? `Request ${formatMoney(parsedMinor, displayCurrency)}` : 'Choose an amount'}
                </button>
              </form>
            )}
            {notice !== null && <p className="mt-3 rounded-xl bg-accent-softer p-3 text-xs font-semibold leading-5 text-primary" role="status">{notice}</p>}
          </section>

          <section className="mt-7">
            <p className="eyebrow">Payout history</p>
            {payouts === null || payouts.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-border p-5 text-center text-xs leading-5 text-muted-foreground">
                No payouts yet. When you request one, it will sit here with exactly where it has got to.
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {payouts.map((payout) => {
                  const badge = STATUS_BADGES[payout.status]
                  return (
                    <li key={payout.id} className="rounded-xl border border-border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-sm font-bold">{formatMoney(payout.amountMinor, payout.currency)}</span>
                          <span className="text-xs text-muted-foreground">Requested {payoutDate(payout.createdAt)}</span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${badge.tone}`}>{badge.label}</span>
                      </div>
                      {payout.decisionNote !== null && (
                        <p className="mt-2 rounded-lg bg-muted p-2 text-xs leading-5 text-muted-foreground">
                          <strong className="font-semibold text-foreground">Note from the reviewer: </strong>{payout.decisionNote}
                        </p>
                      )}
                      {payout.status === 'paid' && payout.providerReference !== null && (
                        <p className="mt-2 text-xs text-muted-foreground">Payment reference <span className="font-semibold text-foreground">{payout.providerReference}</span></p>
                      )}
                      {payout.status === 'requested' && (
                        <button suppressHydrationWarning type="button" onClick={() => { void handleCancel(payout.id) }} disabled={cancellingId !== null}
                          className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground disabled:opacity-60">
                          <Ban size={13} />{cancellingId === payout.id ? 'Cancelling…' : 'Cancel request'}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {cancelError !== null && <p className="mt-3 text-xs font-semibold text-red-500" role="alert">{cancelError}</p>}
          </section>
        </>
      ) : null}
    </article>
  )
}
