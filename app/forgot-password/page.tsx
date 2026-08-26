'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { tryGetSupabaseBrowserClient } from '@/lib/supabase/client'
import { authErrorMessage } from '@/lib/auth-errors'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || !emailValid) return
    setError(null)
    setSubmitting(true)
    try {
      const supabase = tryGetSupabaseBrowserClient()
      if (!supabase) {
        setError('Password reset is unavailable: Supabase is not configured.')
        return
      }
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        // Via the callback route so the one-time code becomes a session before the
        // reset page tries to use it.
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      })
      // Rate limiting is worth surfacing; anything else is swallowed on purpose below.
      if (authError && /rate limit|for security purposes/i.test(authError.message)) {
        setError(authErrorMessage(authError, 'reset'))
        return
      }
      // Always report success, even on failure: a different response for a registered vs
      // unregistered address would let anyone test who has an account here.
      setSent(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto flex min-h-screen max-w-[470px] flex-col justify-center border-x border-border px-6">
      <div className="grid size-12 place-items-center rounded-full bg-accent-soft text-primary"><MailCheck size={22} /></div>
      <p className="eyebrow mt-6">Check your inbox</p>
      <h1 className="mt-3 font-serif text-[32px] font-semibold leading-tight tracking-[-0.035em]">If that address has an account, a reset link is on its way.</h1>
      <p className="mt-4 text-sm leading-7 text-muted-foreground">
        It expires in an hour. If nothing arrives in a few minutes, check your spam folder — and make sure you typed <strong className="text-foreground">{email.trim()}</strong> correctly.
      </p>
      <div className="mt-8 space-y-3">
        <Link href="/login" className="confirm-button">Back to sign in</Link>
        <button suppressHydrationWarning onClick={() => { setSent(false); setError(null) }} className="block w-full py-1 text-center text-xs font-bold text-primary">Use a different address</button>
      </div>
    </div></main>
  }

  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto flex min-h-screen max-w-[470px] flex-col justify-center border-x border-border px-6">
    <Link href="/login" aria-label="Back to sign in" className="icon-button mb-8"><ArrowLeft size={18} /></Link>
    <p className="eyebrow">Forgot your password</p>
    <h1 className="mt-2 font-serif text-[32px] font-semibold leading-tight tracking-[-0.035em]">We’ll send you a link.</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">Enter the email you signed up with and we’ll send a link to set a new password.</p>

    <form onSubmit={handleSubmit} className="mt-7 space-y-3" noValidate>
      <input suppressHydrationWarning
        className="amount-input"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        aria-label="Email"
        aria-invalid={email !== '' && !emailValid}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      {email !== '' && !emailValid && <p className="text-xs font-semibold text-primary">That does not look like an email address.</p>}
      {error !== null && <p role="alert" className="rounded-xl border border-border bg-card p-3 text-xs leading-5 text-red-500">{error}</p>}
      <button suppressHydrationWarning type="submit" disabled={submitting || !emailValid} className="confirm-button disabled:opacity-50">
        {submitting ? 'Sending…' : 'Send reset link'}
      </button>
    </form>

    <p className="mt-6 text-center text-xs text-muted-foreground">
      Remembered it? <Link href="/login" className="font-bold text-primary">Sign in</Link>
    </p>
  </div></main>
}
