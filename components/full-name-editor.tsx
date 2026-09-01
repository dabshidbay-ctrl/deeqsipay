'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { ApiError, authedFetch } from '@/lib/supabase/session'

export function FullNameEditor({ initial }: { initial: string | null }) {
  const [fullName, setFullName] = useState(initial ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await authedFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: fullName.trim() || null }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }, [fullName])

  return (
    <div className="rounded-2xl bg-card p-4">
      <p className="eyebrow">Organization / Full name</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        This is the name shown on your campaigns — donors will see this next to your fundraiser.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          value={fullName}
          onChange={(e) => { setFullName(e.target.value); setSaved(false) }}
          placeholder="Enter your legal or organization name"
          className="amount-input flex-1"
          maxLength={120}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="confirm-button !mt-0 !w-auto shrink-0 px-4 py-2 text-xs"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : 'Save'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-red-500" role="alert">{error}</p>}
    </div>
  )
}