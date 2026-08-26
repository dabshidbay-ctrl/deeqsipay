'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { tryGetSupabaseBrowserClient } from '@/lib/supabase/client'
import { authErrorMessage, MIN_PASSWORD_LENGTH } from '@/lib/auth-errors'

type Mode = 'signin' | 'signup'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  const nextParam = params.get('next')
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/profile'

  // /auth/callback redirects here with ?notice=... when an email link fails.
  const notice = params.get('notice')
  const noticeText = notice === 'link_expired'
    ? 'That link has expired. Request a new one below.'
    : notice === 'link_invalid'
      ? 'That link is not valid or has already been used.'
      : null

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const supabase = tryGetSupabaseBrowserClient()
      if (!supabase) {
        setError('Sign-in is unavailable: add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.')
        return
      }
      if (mode === 'signup' && password.length < MIN_PASSWORD_LENGTH) {
        setError(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`)
        return
      }
      const { data, error: authError } = mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` } })
      if (authError) {
        setError(authErrorMessage(authError, mode))
        return
      }
      // With email confirmation switched on, signUp returns no session. Sending them to a
      // protected page here would just bounce them back to this form with no explanation.
      if (mode === 'signup' && data.session === null) {
        setCheckEmail(true)
        return
      }
      router.push(next)
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  if (checkEmail) {
    return (
      <section className="pb-12">
        <p className="eyebrow">Almost there</p>
        <h1 className="mt-2 font-serif text-[30px] font-semibold leading-tight tracking-[-0.03em]">Confirm your email.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          We sent a link to <strong className="text-foreground">{email.trim()}</strong>. Open it and you will be signed in.
        </p>
        <button suppressHydrationWarning onClick={() => { setCheckEmail(false); setMode('signin') }} className="confirm-button mt-7">Back to sign in</button>
      </section>
    )
  }

  return (
    <section className="pb-12">
      <p className="eyebrow">{mode === 'signin' ? 'welcome back' : 'new here'}</p>
      <h1 className="mt-2 font-serif text-[30px] font-semibold leading-tight tracking-[-0.03em]">
        {mode === 'signin' ? 'Good to see you again.' : 'Join kindred.'}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {mode === 'signin' ? 'Pick up right where you left off.' : 'Start a fundraiser or back one in minutes.'}
      </p>
      {noticeText !== null && <p role="status" className="mt-5 rounded-xl border border-border bg-card p-3 text-xs leading-5 text-foreground">{noticeText}</p>}
      <form onSubmit={handleSubmit} className="mt-7 space-y-3" noValidate>
        <input suppressHydrationWarning
          className="amount-input"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-label="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input suppressHydrationWarning
          className="amount-input"
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder="your password"
          aria-label="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {mode === 'signin' && (
          <p className="text-right">
            <Link href="/forgot-password" className="text-xs font-bold text-primary">Forgot your password?</Link>
          </p>
        )}
        {error !== null && <p role="alert" className="rounded-xl border border-border bg-card p-3 text-xs leading-5 text-red-500">{error}</p>}
        <button suppressHydrationWarning type="submit" className="confirm-button" disabled={submitting}>
          {submitting ? 'one moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === 'signin' ? 'New to kindred?' : 'Already have an account?'}{' '}
        <button suppressHydrationWarning
          type="button"
          className="font-semibold text-foreground underline underline-offset-4"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError(null)
          }}
        >
          {mode === 'signin' ? 'Create an account' : 'Sign in'}
        </button>
      </p>
    </section>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[470px] flex-col justify-center border-x border-border bg-background px-5 shadow-[0_0_60px_rgba(25,50,40,0.05)]">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
