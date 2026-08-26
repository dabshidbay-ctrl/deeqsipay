'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { ApiError, AuthRequiredError, authedFetch } from '@/lib/supabase/session'
import { daysLeft, formatMoney, progressPercent, type Campaign } from '@/lib/campaigns'
import { SIFALO_WALLETS, type SifaloWallet } from '@/lib/wallets'

type Phase = 'idle' | 'submitting' | 'awaiting_confirmation' | 'succeeded' | 'failed' | 'expired' | 'timeout' | 'unresolved'

const PRESET_MINORS = [2500, 5000, 10000]
const AMOUNT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/
const POLL_INTERVAL_MS = 3000
const POLL_LIMIT_MS = 120_000

function parseAmountMinor(raw: string): number | null {
  if (!AMOUNT_PATTERN.test(raw)) return null
  const minor = Math.round(Number(raw) * 100)
  if (!Number.isSafeInteger(minor) || minor < 100 || minor > 1_000_000_000) return null
  return minor
}

const PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/

export function DonateForm({ campaign, directCharge = false }: { campaign: Campaign; directCharge?: boolean }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [presetMinor, setPresetMinor] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  // Only collected in direct mode; hosted checkout takes both on Sifalo's page.
  const [phone, setPhone] = useState('')
  const [wallet, setWallet] = useState<SifaloWallet>('zaad')
  const [error, setError] = useState<string | null>(null)
  const [donationId, setDonationId] = useState<string | null>(null)
  const [paidMinor, setPaidMinor] = useState<number | null>(null)
  const idempotencyRef = useRef<string>(crypto.randomUUID())

  const loginNext = `/login?next=/campaigns/${campaign.id}/donate`
  const trimmedCustom = customAmount.trim()
  const customMinor = trimmedCustom === '' ? null : parseAmountMinor(trimmedCustom)
  const amountMinor = customMinor ?? presetMinor
  const amountInvalid = trimmedCustom !== '' && customMinor === null
  const daysRemaining = daysLeft(campaign.endsAt)

  useEffect(() => {
    if (phase !== 'awaiting_confirmation' || donationId === null) return
    let stopped = false
    const deadline = Date.now() + POLL_LIMIT_MS
    const tick = async (): Promise<void> => {
      try {
        const data = await authedFetch<{ donation?: { status?: string } }>(`/api/donations/${donationId}`)
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
    if (phase !== 'idle' || amountMinor === null) return
    setError(null)
    setPaidMinor(amountMinor)
    setPhase('submitting')
    try {
      const data = await authedFetch<{ donationId?: string; status?: string; unresolved?: boolean; checkoutUrl?: string }>('/api/donations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id, amountMinor, idempotencyKey: idempotencyRef.current, anonymous, ...(directCharge ? { phone: phone.trim(), wallet } : {}) }),
      })
      if (typeof data.donationId !== 'string' || typeof data.status !== 'string') throw new ApiError(502, 'Unexpected reply from the payment provider')
      setDonationId(data.donationId)
      // Hosted checkout: Sifalo takes the wallet number and PIN on their own page.
      if (typeof data.checkoutUrl === 'string' && data.checkoutUrl !== '') {
        window.location.assign(data.checkoutUrl)
        return
      }
      // 'unresolved' means the row exists but Sifalo never answered. That is NOT a
      // decline, so it must not be shown as one.
      if (data.unresolved === true) { setError(null); setPhase('unresolved') }
      else if (data.status === 'pending') setPhase('awaiting_confirmation')
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
  const phoneValid = !directCharge || PHONE_PATTERN.test(phone.trim())
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
                    <button suppressHydrationWarning key={minor} type="button" aria-pressed={active} disabled={busy}
                      className={active ? 'amount-option amount-active' : 'amount-option'}
                      onClick={() => { setPresetMinor(minor); setCustomAmount('') }}>
                      {formatMoney(minor, campaign.currency)}
                    </button>
                  )
                })}
              </div>
              <label className="mt-4 block text-sm font-semibold">Or enter your own
                <input suppressHydrationWarning value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} inputMode="decimal" autoComplete="off"
                  placeholder="$ 0.00" disabled={busy} className="amount-input" />
              </label>
              {amountInvalid && <p className="mt-2 text-xs font-semibold text-red-500" role="alert">Enter between $1 and $10,000,000, with at most 2 decimals.</p>}
            </div>

            {directCharge && (
              <>
                <fieldset>
                  <legend className="text-sm font-semibold">Pay from</legend>
                  <div className="mt-2 grid gap-2">
                    {SIFALO_WALLETS.map((option) => (
                      <label key={option.value} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${wallet === option.value ? 'border-foreground bg-muted' : 'border-border bg-card'}`}>
                        <input suppressHydrationWarning type="radio" name="wallet" value={option.value} checked={wallet === option.value}
                          onChange={() => setWallet(option.value)} disabled={busy} className="size-4 accent-[var(--primary)]" />
                        <span className="text-xs leading-5">
                          <strong className="block font-semibold">{option.label}</strong>
                          <span className="text-muted-foreground">{option.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="block text-sm font-semibold">Mobile money number
                  <input suppressHydrationWarning value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" autoComplete="tel"
                    inputMode="numeric" placeholder="615551234" disabled={busy} className="amount-input" />
                </label>
                {phone.trim() !== '' && !PHONE_PATTERN.test(phone.trim()) && (
                  <p className="text-xs font-semibold text-primary" role="alert">Enter the number without the country code, e.g. 615551234.</p>
                )}
              </>
            )}

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3">
              <input suppressHydrationWarning type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
              <span className="text-xs leading-5"><strong className="block font-semibold">Give anonymously</strong><span className="text-muted-foreground">Your name will show as &ldquo;Anonymous&rdquo; on this campaign. The organiser still sees your donation.</span></span>
            </label>
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground"><ShieldCheck size={13} /> You'll finish on Sifalo Pay's secure page</p>
            {error !== null && <p className="text-xs font-semibold text-red-500" role="alert">{error}</p>}
            <button suppressHydrationWarning type="submit" className="confirm-button" disabled={!canSubmit}>
              {busy ? 'Contacting Sifalo Pay…' : amountMinor !== null ? `Donate ${formatMoney(amountMinor, campaign.currency)}` : 'Choose an amount'}
            </button>
          </form>
        )}
        {phase === 'awaiting_confirmation' && (
          <section className="rounded-2xl border border-border bg-card p-6 text-center">
            <p className="eyebrow">Awaiting confirmation</p>
            <h2 className="mt-3 font-serif text-2xl">Taking you to Sifalo Pay…</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Enter your mobile money number and PIN on Sifalo&rsquo;s secure page. You&rsquo;ll come straight back here afterwards.</p>
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
            <button suppressHydrationWarning type="button" className="confirm-button mt-6" onClick={resetAttempt}>Try again</button>
          </section>
        )}
        {phase === 'expired' && (
          <section className="rounded-2xl border border-border bg-card p-6 text-center">
            <p className="eyebrow">Request expired</p>
            <h2 className="mt-3 font-serif text-2xl">The approval window closed.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">No charge was made. Start again whenever you&rsquo;re ready.</p>
            <button suppressHydrationWarning type="button" className="confirm-button mt-6" onClick={resetAttempt}>Start over</button>
          </section>
        )}
        {phase === 'unresolved' && (
          <section className="rounded-2xl border border-border bg-card p-6 text-center">
            <p className="eyebrow">Not confirmed</p>
            <h2 className="mt-3 font-serif text-2xl">We couldn&rsquo;t reach Sifalo.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Your donation is recorded as pending. <strong className="text-foreground">Do not pay again</strong> — if money left your account it will be credited once we reconcile. If your phone never asked for a PIN, nothing was charged.
            </p>
            <Link href="/profile" className="confirm-button mt-6 inline-block">Go to profile</Link>
            <button suppressHydrationWarning type="button" onClick={resetAttempt} className="mt-3 block w-full py-1 text-center text-xs font-bold text-primary">Try a different number</button>
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
