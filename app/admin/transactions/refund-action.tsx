'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/campaigns'
import { ApiError, AuthRequiredError, authedFetch } from '@/lib/supabase/session'

/**
 * Admin-only refund control for one donation row. A moderator never renders this at all —
 * the API refuses them, and the UI should not offer what it cannot deliver.
 *
 * Only a donation that is exactly 'succeeded' can be refunded: refund_donation() takes a
 * row lock and raises on anything else, so offering the button on a pending, failed,
 * expired or already-refunded donation would only produce an error the admin cannot act on.
 *
 * The confirmation is inline rather than window.confirm() so it can state the exact amount
 * and carry the reason field the API requires — an empty note comes back as a 400, so the
 * button stays disabled until something is typed rather than letting the round trip fail.
 */
export function RefundAction({ donationId, amountMinor, currency, status }: { donationId: string; amountMinor: number; currency: string; status: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  if (status !== 'succeeded') return null

  const amount = formatMoney(amountMinor, currency)
  const reason = note.trim()

  async function refund(): Promise<void> {
    if (pending) return
    // The server rejects an empty note with a 400; the button is disabled here too, so
    // this guard only catches a stray keyboard submit.
    if (note.trim() === '') { setError('Say why this donation is being refunded.'); return }
    setError(null)
    setDone(null)
    setPending(true)
    try {
      await authedFetch(`/api/admin/donations/${donationId}/refund`, { method: 'POST', body: JSON.stringify({ note: note.trim() }) })
      setNote('')
      setOpen(false)
      setDone('Refund recorded. Return the money to the payer in the Sifalo portal.')
      router.refresh()
    } catch (err) {
      if (err instanceof AuthRequiredError) { router.push('/login?next=/admin/transactions'); return }
      setError(err instanceof ApiError ? err.message : 'We could not reach the server. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return <div className="mt-3 border-t border-border pt-3">
    {open ? <>
      <p className="text-xs font-semibold">Refund <strong className="font-bold">{amount}</strong>?</p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
        This records the refund in our books and deducts it from the campaign. Returning the money to the payer is a separate manual step in the Sifalo portal.
      </p>
      <label className="mt-3 block text-xs font-semibold">Reason <span className="font-normal text-muted-foreground">(required, internal)</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2}
          placeholder="Why this donation is being refunded" className="amount-input resize-none text-sm font-normal leading-5" />
      </label>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={pending || reason === ''} onClick={() => { void refund() }}
          className="confirm-button mt-0 w-auto flex-1 px-4 py-2.5 text-xs disabled:opacity-50">{pending ? 'Refunding…' : `Refund ${amount}`}</button>
        <button type="button" disabled={pending} onClick={() => { setOpen(false); setNote(''); setError(null) }}
          className="flex-1 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-bold text-foreground disabled:opacity-50">Keep it</button>
      </div>
    </> : <button type="button" onClick={() => { setOpen(true); setDone(null) }}
      className="rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-foreground">Refund</button>}
    {error !== null && <p className="mt-2 text-xs font-semibold text-red-500" role="alert">{error}</p>}
    {done !== null && <p className="mt-2 text-xs font-semibold text-primary" role="status">{done}</p>}
  </div>
}
