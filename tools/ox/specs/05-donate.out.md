=== FILE: app/campaigns/[id]/donate/page.tsx ===
import { notFound } from 'next/navigation'
import { getCampaign } from '@/lib/server/campaigns'
import { DonateForm } from '@/components/donate-form'

export default async function DonatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (campaign === null) notFound()
  return <DonateForm campaign={campaign} />
}
=== END FILE ===


=== FILE: components/donate-form.tsx ===
'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { ApiError, AuthRequiredError, authedFetch } from '@/lib/supabase/session'
import { daysLeft, formatMoney, progressPercent, type Campaign } from '@/lib/campaigns'

type Phase = 'idle' | 'submitting' | 'awaiting_confirmation' | 'succeeded' | 'failed' | 'expired' | 'timeout'

const PRESET_MINORS = [2500, 5000, 10000]
const AMOUNT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/
const PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/
const POLL_INTERVAL_MS = 3000
const POLL_LIMIT_MS = 120_000

function parseAmountMinor(raw: string): number | null {
  if (!AMOUNT_PATTERN.test(raw)) return null
  const minor = Math.round(Number(raw) * 100)
  if (!Number.isSafeInteger(minor) || minor < 100 || minor > 1_000_000_000) return null
  return minor
}

export function DonateForm({ campaign }: { campaign: Campaign }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [presetMinor, setPresetMinor] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [donationId, setDonationId] = useState<string | null>(null)
  const [paidMinor, setPaidMinor] = useState<number | null>(null)
  const idempotencyRef = useRef<string>(crypto.randomUUID())

  const loginNext = `/login?next=/campaigns/${campaign.id}/donate`
  const trimmedCustom = customAmount.trim()
  const customMinor = trimmedCustom === '' ? null : parseAmountMinor(trimmedCustom)
  const amountMinor = customMinor ?? presetMinor
  const amountInvalid = trimmedCustom !== '' && customMinor === null
  const phoneValid = PHONE_PATTERN.test(phone.trim())
  const daysRemaining = daysLeft(campaign.endsAt)

  useEffect(() => {
    if (phase !== 'awaiting_confirmation' || donationId === null) return
    let stopped = false
    const deadline = Date.now() + POLL_LIMIT_MS
    const tick = async (): Promise<void> => {
      try {
        const res = await authedFetch(`/api/donations/${donationId}`)
        const data = (await res.json()) as { donation?: { status?: string } }
        if (stopped) return
        const status = data.donation?.status
        if (status === 'succeeded' || status === 'failed' || status === 'expired') setPhase(status)
        else if (Date.now() >= deadline) setPhase('timeout')
      } catch (err) {
        if (err instanceof AuthRequiredError) router.push(loginNext)
      }
    }
    const interval = window.setInterval(() => { void tick() }, POLL_INTERVAL_MS)
    return () => { stopped = true; window.clearInterval(interval) }
  }, [phase, donationId, loginNext, router])

  function resetAttempt(): void {
    // Terminal outcome reached: rotate the key so the next submit is a brand-new
    // donation instead of a replay of the dead one.
    idempotencyRef.current = crypto.randomUUID()
    setDonationId(null)
    setError(null)
    setPhase('idle')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (phase !== 'idle' || amountMinor === null || !phoneValid) return
    setError(null)
    setPaidMinor(amountMinor)
    setPhase('submitting')
    try {
      const res = await authedFetch('/api/donations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id, amountMinor, phone: phone.trim(), idempotencyKey: idempotencyRef.current }),
      })
      const data = (await res.json()) as { donationId?: string; status?: string }
      if (typeof data.donationId !== 'string' || typeof data.status !== 'string') throw new ApiError(res.status, 'Unexpected reply from the payment provider')
      setDonationId(data.donationId)
      if (data.status === 'pending') setPhase('awaiting_confirmation')
      else if (data.status === 'succeeded') setPhase('succeeded')
      else if (data.status === 'expired') setPhase('expired')
      else if (data.status === 'failed') setPhase('failed')
      else { setError('Unexpected payment status.'); setPhase('failed') }
    } catch (err) {
      if (err instanceof AuthRequiredError) { router.push(loginNext); return }
      if (err instanceof ApiError) { setError(err.message); setPhase('failed'); return }
      // The request never resolved, so the outcome is unknown: keep the same
      // idempotency key so a retry replays the original donation, never a double charge.
      setError('We could not reach the network. Please try again.')
      setPhase('idle')
    }
  }

  const busy = phase === 'submitting'
  const canSubmit = phase === 'idle' && amountMinor !== null && !amountInvalid && phoneValid

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto min-h-screen max-w-[470px] border-x border-border bg-background px-5 pb-10">
        <header className="flex items-center gap-4 pb-6 pt-7">
          <Link href={`/campaigns/${campaign.id}`} aria-label="Back" className="icon-button"><ArrowLeft size={18} /></Link>
          <div>
            <p className="eyebrow">Make a donation</p>
            <h1 className="font-serif text-2xl">Support this cause</h1>
          </div>
        </header>
        <section className="mb-6 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold leading-6">{campaign.title}</p>
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <span className="font-serif text-xl">{formatMoney(campaign.raisedMinor, campaign.currency)}</span>
            <span className="text-xs text-muted-foreground">of {formatMoney(campaign.goalMinor, campaign.currency)}</span>
          </div>
          <div className="progress-track mt-3">
            <div className="progress-fill" style={{ width: `${progressPercent(campaign.raisedMinor, campaign.goalMinor)}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {campaign.donorCount} {campaign.donorCount === 1 ? 'donor' : 'donors'}
            {' · '}
            {daysRemaining === null ? 'open ended' : `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} left`}
          </p>
        </section>
        {(phase === 'idle' || busy) && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <p className="text-sm font-semibold">Choose an amount</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {PRESET_MINORS.map((minor) => {
                  const active = trimmedCustom === '' && presetMinor === minor
                  return (
                    <button key={minor} type="button" aria-pressed={active} disabled={busy}
                      className={active ? 'amount-option amount-active' : 'amount-option'}
                      onClick={() => { setPresetMinor(minor); setCustomAmount('') }}>
                      {formatMoney(minor, campaign.currency)}
                    </button>
                  )
                })}
              </div>
              <label className="mt-4 block text-sm font-semibold">Or enter your own
                <input value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} inputMode="decimal" autoComplete="off"
                  placeholder="$ 0.00" disabled={busy} className="amount-input" />
              </label>
              {amountInvalid && <p className="mt-2 text-xs font-semibold text-red-500" role="alert">Enter between $1 and $10,000,000, with at most 2 decimals.</p>}
            </div>
            <label className="block text-sm font-semibold">Mobile money number
              <input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" autoComplete="tel" required
                placeholder="+252 61 555 1234" disabled={busy} className="amount-input" />
            </label>
            {phone.trim() !== '' && !phoneValid && <p className="text-xs font-semibold text-red-500" role="alert">Add the country code, e.g. +252615551234.</p>}
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground"><ShieldCheck size={13} /> Mobile money payments secured by Sifalo Pay</p>
            {error !== null && <p className="text-xs font-semibold text-red-500" role="alert">{error}</p>}
            <button type="submit" className="confirm-button" disabled={!canSubmit}>
              {busy ? 'Contacting Sifalo Pay…' : amountMinor !== null ? `Donate ${formatMoney(amountMinor, campaign.currency)}` : 'Choose an amount'}
            </button>
          </form>
        )}
        {phase === 'awaiting_confirmation' && (
          <section className="rounded-2xl border border-border bg-card p-6 text-center">
            <p className="eyebrow">Awaiting confirmation</p>
            <h2 className="mt-3 font-serif text-2xl">Approve the prompt on your phone.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">We sent a payment request to •••• {phone.slice(-4)}. Enter your PIN there and this page updates on its own.</p>
            <p className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold text-muted-foreground"><span className="size-2 animate-pulse rounded-full bg-primary" /> Checking every few seconds</p>
          </section>
        )}
        {phase === 'succeeded' && (
          <section className="rounded-2xl bg-primary p-6 text-primary-foreground">
            <p className="eyebrow text-primary-foreground/70">Payment received</p>
            <h2 className="mt-3 font-serif text-3xl">Thank you, truly.</h2>
            <p className="mt-3 text-sm leading-6 text-primary-foreground/75">{paidMinor !== null ? `${formatMoney(paidMinor, campaign.currency)} g` : 'G'}iven to &ldquo;{campaign.title}&rdquo;. It will show on your profile in a moment.</p>
            <Link href="/profile" className="mt-6 inline-block rounded-full bg-background px-5 py-3 text-xs font-bold text-foreground">Go to profile</Link>
          </section>
        )}
        {phase === 'failed' && (
          <section className="rounded-2xl border border-border bg-card p-6 text-center">
            <p className="eyebrow">Payment failed</p>
            <h2 className="mt-3 font-serif text-2xl">That attempt didn&rsquo;t go through.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground" role="alert">{error ?? 'The payment provider could not process this right now. Nothing was charged.'}</p>
            <button type="button" className="confirm-button mt-6" onClick={resetAttempt}>Try again</button>
          </section>
        )}
        {phase === 'expired' && (
          <section className="rounded-2xl border border-border bg-card p-6 text-center">
            <p className="eyebrow">Request expired</p>
            <h2 className="mt-3 font-serif text-2xl">The approval window closed.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">No charge was made. Start again whenever you&rsquo;re ready.</p>
            <button type="button" className="confirm-button mt-6" onClick={resetAttempt}>Start over</button>
          </section>
        )}
        {phase === 'timeout' && (
          <section className="rounded-2xl border border-border bg-card p-6 text-center">
            <p className="eyebrow">Still confirming</p>
            <h2 className="mt-3 font-serif text-2xl">We haven&rsquo;t heard back yet.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Your approval may still land — mobile money can be slow. Check your profile shortly: if the payment completed, your donation will be there.</p>
            <Link href="/profile" className="confirm-button mt-6 inline-block">Go to profile</Link>
          </section>
        )}
      </div>
    </main>
  )
}
=== END FILE ===


=== FILE: app/create/page.tsx ===
'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ImagePlus } from 'lucide-react'
import { ApiError, AuthRequiredError, authedFetch } from '@/lib/supabase/session'

const CATEGORIES = ['Education', 'Healthcare', 'Water', 'Food', 'Emergency']
const GOAL_PATTERN = /^\d{1,8}(\.\d{1,2})?$/

function parseGoalMinor(raw: string): number | null {
  if (!GOAL_PATTERN.test(raw)) return null
  const minor = Math.round(Number(raw) * 100)
  if (!Number.isSafeInteger(minor) || minor < 100 || minor > 1_000_000_000) return null
  return minor
}

export default function CreatePage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0] ?? '')
  const [goal, setGoal] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const goalInvalid = goal.trim() !== '' && parseGoalMinor(goal.trim()) === null

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submitting) return
    const cleanTitle = title.trim()
    const cleanDescription = description.trim()
    const goalMinor = parseGoalMinor(goal.trim())
    if (cleanTitle.length < 8 || cleanTitle.length > 120) return setError('Give your fundraiser a title between 8 and 120 characters.')
    if (cleanDescription.length < 20 || cleanDescription.length > 5000) return setError('Tell your story in 20 to 5000 characters.')
    if (goalMinor === null) return setError('Set a fundraising goal of at least $1.')
    setSubmitting(true)
    setError(null)
    try {
      const res = await authedFetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: cleanTitle, description: cleanDescription, category, goalMinor }),
      })
      const data = (await res.json()) as { campaign?: { id?: string } }
      if (typeof data.campaign?.id !== 'string') throw new ApiError(res.status, 'Unexpected response from the server')
      router.push(`/campaigns/${data.campaign.id}`)
    } catch (err) {
      if (err instanceof AuthRequiredError) { router.push('/login?next=/create'); return }
      setError(err instanceof ApiError ? err.message : 'We could not reach the network. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto min-h-screen max-w-[470px] border-x border-border bg-background px-5 pb-10">
        <header className="flex items-center gap-4 pb-8 pt-7">
          <Link href="/" aria-label="Back" className="icon-button"><ArrowLeft size={18} /></Link>
          <div>
            <p className="eyebrow">Create something meaningful</p>
            <h1 className="font-serif text-2xl">Start a fundraiser</h1>
          </div>
        </header>
        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block text-sm font-semibold">What are you raising money for?
            <input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={8} maxLength={120} disabled={submitting}
              className="amount-input" placeholder="Give your fundraiser a clear title" />
          </label>
          <label className="block text-sm font-semibold">Tell your story
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} required minLength={20} maxLength={5000} disabled={submitting}
              className="amount-input min-h-32 resize-none" placeholder="Help people understand why this matters..." />
          </label>
          <label className="block text-sm font-semibold">Category
            <select value={category} onChange={(event) => setCategory(event.target.value)} disabled={submitting} className="amount-input">
              {CATEGORIES.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">Fundraising goal
            <input value={goal} onChange={(event) => setGoal(event.target.value)} inputMode="decimal" autoComplete="off" disabled={submitting}
              className="amount-input" placeholder="$ 0.00" />
          </label>
          {goalInvalid && <p className="text-xs font-semibold text-red-500" role="alert">Set a goal of at least $1 — whole dollars or up to 2 decimals.</p>}
          <div className="flex min-h-32 cursor-not-allowed flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card text-center opacity-60">
            <ImagePlus className="text-primary" />
            <span className="mt-2 text-xs font-bold">Add a campaign photo</span>
            <span className="mt-1 text-[11px] text-muted-foreground">Photo upload coming soon</span>
          </div>
          {error !== null && <p className="text-xs font-semibold text-red-500" role="alert">{error}</p>}
          <button type="submit" className="confirm-button" disabled={submitting}>{submitting ? 'Publishing…' : 'Publish fundraiser'}</button>
        </form>
      </div>
    </main>
  )
}
=== END FILE ===


=== FILE: app/saved/page.tsx ===
import { PageFrame } from '@/components/kindred-shell'
import { SavedList } from '@/components/saved-list'

export default function SavedPage() {
  return (
    <PageFrame active="saved" eyebrow="your collection">
      <SavedList />
    </PageFrame>
  )
}
=== END FILE ===


=== FILE: components/saved-list.tsx ===
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
      .then(async (res) => toCampaignList(await res.json()))
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
=== END FILE ===


=== FILE: components/save-button.tsx ===
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bookmark } from 'lucide-react'
import { AuthRequiredError, authedFetch } from '@/lib/supabase/session'

export function SaveButton({ campaignId, initialSaved, onSavedChange }: {
  campaignId: string
  initialSaved: boolean
  onSavedChange?: (saved: boolean) => void
}) {
  const router = useRouter()
  const [saved, setSaved] = useState(initialSaved)
  const [pending, setPending] = useState(false)

  async function toggle(): Promise<void> {
    if (pending) return
    const next = !saved
    setSaved(next)
    setPending(true)
    try {
      await authedFetch('/api/saved', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      })
      onSavedChange?.(next)
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`)
        return
      }
      setSaved(!next)
    } finally {
      setPending(false)
    }
  }

  return (
    <button type="button" className="save-button" aria-pressed={saved}
      aria-label={saved ? 'Remove from saved' : 'Save this campaign'}
      onClick={() => { void toggle() }} disabled={pending}>
      <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
    </button>
  )
}
=== END FILE ===


=== NOTES ===
- Assumed `authedFetch(url, init)` resolves to an unparsed `Response` and throws `AuthRequiredError` (signed out) / `ApiError` (non-2xx, `.status` + `.message`) per the stated contract.
- Assumed `GET /api/saved` returns `{ campaigns: Campaign[] }` with rows already mapped to the `Campaign` shape; adjust `toCampaignList` if the envelope key differs.
- The five allowed categories were not specified; I used Education / Healthcare / Water / Food / Emergency. Swap the `CATEGORIES` constant if the API whitelist differs.
- Create-page success panel: success now redirects straight to the new campaign, so the old `setSubmitted` panel is unreachable and was removed; the header is preserved verbatim and the primary-panel visual language lives on in the donate flow's success state.
- `SaveButton` keeps the specified `{ campaignId, initialSaved }` props and adds one optional `onSavedChange` callback so the saved list can remove the card optimistically; without it the list cannot learn about toggles.
- Error text uses stock `text-red-500` since no error color token appeared in the provided files.
- Idempotency: the key is generated once per form instance in a ref; network-level failures (unknown outcome) keep the key so retries replay safely, while confirmed terminal outcomes (failed/expired) rotate it via `resetAttempt`. Timeout intentionally keeps the key since the donation may still complete.
- Polling swallows transient GET errors and keeps waiting; an `AuthRequiredError` mid-poll redirects to login. The interval is cleared in the effect cleanup and a `stopped` flag guards late responses.
- `getCampaign` is assumed to exist at `lib/server/campaigns` returning `Campaign | null`, and `/login`, `/profile`, `/explore` routes are assumed to exist.