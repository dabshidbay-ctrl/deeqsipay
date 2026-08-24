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
