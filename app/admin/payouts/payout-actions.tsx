'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError, AuthRequiredError, authedFetch } from '@/lib/supabase/session'

type Decision = 'approved' | 'rejected' | 'paid'

/**
 * Admin-only controls for one payout row. A moderator never renders this component at
 * all — the API refuses them anyway, and the UI should not offer what it cannot deliver.
 */
export function PayoutActions({ payoutId, status }: { payoutId: string; status: string }) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [reference, setReference] = useState('')
  const [pending, setPending] = useState<Decision | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  if (status !== 'requested' && status !== 'approved') return null

  async function decide(decision: Decision): Promise<void> {
    if (pending !== null) return
    const trimmedNote = note.trim()
    const trimmedReference = reference.trim()
    if (decision === 'paid' && trimmedReference === '') { setError('Add the provider reference so this payment can be traced later.'); return }
    setError(null)
    setDone(null)
    setPending(decision)
    const body: { decision: Decision; note?: string; reference?: string } = { decision }
    if (trimmedNote !== '') body.note = trimmedNote
    if (decision === 'paid') body.reference = trimmedReference
    try {
      await authedFetch(`/api/admin/payouts/${payoutId}`, { method: 'PATCH', body: JSON.stringify(body) })
      setNote('')
      setReference('')
      setDone(decision === 'paid' ? 'Marked as paid.' : `Payout ${decision}.`)
      router.refresh()
    } catch (err) {
      if (err instanceof AuthRequiredError) { router.push('/login?next=/admin/payouts'); return }
      setError(err instanceof ApiError ? err.message : 'We could not reach the server. Please try again.')
    } finally {
      setPending(null)
    }
  }

  return <div className="mt-3 border-t border-border pt-3">
    {status === 'requested' ? <>
      <label className="block text-xs font-semibold">Note <span className="font-normal text-muted-foreground">(optional, internal)</span>
        <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000}
          placeholder="Why you are deciding this way" className="amount-input text-sm font-normal" />
      </label>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={pending !== null} onClick={() => { void decide('approved') }}
          className="confirm-button mt-0 w-auto flex-1 px-4 py-2.5 text-xs disabled:opacity-50">{pending === 'approved' ? 'Approving…' : 'Approve'}</button>
        <button type="button" disabled={pending !== null} onClick={() => { void decide('rejected') }}
          className="flex-1 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-bold text-foreground disabled:opacity-50">{pending === 'rejected' ? 'Rejecting…' : 'Reject'}</button>
      </div>
    </> : <>
      <label className="block text-xs font-semibold">Provider reference
        <input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} autoComplete="off"
          placeholder="e.g. the transfer id from the bank" className="amount-input text-sm font-normal" />
      </label>
      <button type="button" disabled={pending !== null} onClick={() => { void decide('paid') }}
        className="confirm-button mt-3 px-4 py-2.5 text-xs disabled:opacity-50">{pending === 'paid' ? 'Saving…' : 'Mark as paid'}</button>
    </>}
    {error !== null && <p className="mt-2 text-xs font-semibold text-red-500" role="alert">{error}</p>}
    {done !== null && <p className="mt-2 text-xs font-semibold text-primary" role="status">{done}</p>}
  </div>
}
