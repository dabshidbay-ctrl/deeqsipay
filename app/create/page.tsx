'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ImagePlus } from 'lucide-react'
import { ApiError, AuthRequiredError, authedFetch } from '@/lib/supabase/session'

const CATEGORIES = ['Medical', 'Emergency', 'Community', 'Nonprofit', 'Education']
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
      const data = await authedFetch<{ campaign?: { id?: string } }>('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: cleanTitle, description: cleanDescription, category, goalMinor }),
      })
      if (typeof data.campaign?.id !== 'string') throw new ApiError(502, 'Unexpected response from the server')
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
