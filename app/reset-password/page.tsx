'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { tryGetSupabaseBrowserClient } from '@/lib/supabase/client'
import { authErrorMessage, MIN_PASSWORD_LENGTH, passwordProblem } from '@/lib/auth-errors'

/**
 * Reached only via /auth/callback, which has already exchanged the recovery code for a
 * session. If someone opens this URL directly they have no session, so the page says the
 * link is invalid rather than presenting a form that could not possibly work.
 */
export default function ResetPasswordPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = tryGetSupabaseBrowserClient()
    if (!supabase) { setChecking(false); return }
    supabase.auth.getSession()
      .then(({ data }: { data: { session: Session | null } }) => { if (!cancelled) { setHasSession(data.session !== null); setChecking(false) } })
      .catch(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [])

  const problem = passwordProblem(password)
  const mismatch = confirm !== '' && confirm !== password
  const canSubmit = !submitting && password.length >= MIN_PASSWORD_LENGTH && confirm === password

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    setError(null)
    setSubmitting(true)
    try {
      const supabase = tryGetSupabaseBrowserClient()
      if (!supabase) { setError('Password reset is unavailable: Supabase is not configured.'); return }
      const { error: authError } = await supabase.auth.updateUser({ password })
      if (authError) { setError(authErrorMessage(authError, 'update')); return }
      setDone(true)
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return <main className="grid min-h-screen place-items-center bg-background"><Loader2 className="animate-spin text-primary" size={24} /></main>
  }

  if (!hasSession) {
    return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto flex min-h-screen max-w-[470px] flex-col justify-center border-x border-border px-6">
      <p className="eyebrow">Link not valid</p>
      <h1 className="mt-3 font-serif text-[32px] font-semibold leading-tight tracking-[-0.035em]">This reset link has expired.</h1>
      <p className="mt-4 text-sm leading-7 text-muted-foreground">Reset links last about an hour and can only be used once. Request a fresh one and it will work.</p>
      <Link href="/forgot-password" className="confirm-button mt-8">Send a new link</Link>
    </div></main>
  }

  if (done) {
    return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto flex min-h-screen max-w-[470px] flex-col justify-center border-x border-border px-6">
      <p className="eyebrow">All set</p>
      <h1 className="mt-3 font-serif text-[32px] font-semibold leading-tight tracking-[-0.035em]">Your password is updated.</h1>
      <p className="mt-4 text-sm leading-7 text-muted-foreground">You are signed in on this device. Anywhere else you were signed in will need the new password.</p>
      <Link href="/profile" className="confirm-button mt-8">Go to your profile</Link>
    </div></main>
  }

  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto flex min-h-screen max-w-[470px] flex-col justify-center border-x border-border px-6">
    <div className="grid size-12 place-items-center rounded-full bg-accent-soft text-primary"><KeyRound size={22} /></div>
    <p className="eyebrow mt-6">Choose a new password</p>
    <h1 className="mt-2 font-serif text-[32px] font-semibold leading-tight tracking-[-0.035em]">Set a new password.</h1>

    <form onSubmit={handleSubmit} className="mt-7 space-y-3" noValidate>
      <div className="relative">
        <input
          className="amount-input pr-11"
          type={reveal ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="New password"
          aria-label="New password"
          aria-invalid={problem !== null}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="button" onClick={() => setReveal((current) => !current)}
          aria-label={reveal ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {reveal ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {problem !== null && <p className="text-xs font-semibold text-primary">{problem}</p>}

      <input
        className="amount-input"
        type={reveal ? 'text' : 'password'}
        autoComplete="new-password"
        placeholder="Confirm new password"
        aria-label="Confirm new password"
        aria-invalid={mismatch}
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
      />
      {mismatch && <p className="text-xs font-semibold text-primary">Those two do not match.</p>}

      {error !== null && <p role="alert" className="rounded-xl border border-border bg-card p-3 text-xs leading-5 text-red-500">{error}</p>}

      <button type="submit" disabled={!canSubmit} className="confirm-button disabled:opacity-50">
        {submitting ? 'Saving…' : 'Save new password'}
      </button>
    </form>
  </div></main>
}
