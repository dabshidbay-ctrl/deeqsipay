'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

type Mode = 'signin' | 'signup'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const nextParam = params.get('next')
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/'

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const supabase = getSupabaseBrowserClient()
      const { error: authError } = mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
      if (authError) {
        setError(authError.message)
        return
      }
      router.push(next)
      router.refresh()
    } finally {
      setSubmitting(false)
    }
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
      <form onSubmit={handleSubmit} className="mt-7 space-y-3">
        <input
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
        <input
          className="amount-input"
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder="your password"
          aria-label="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error ? <p className="text-[13px] font-medium text-red-600">{error}</p> : null}
        <button type="submit" className="confirm-button" disabled={submitting}>
          {submitting ? 'one moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === 'signin' ? 'New to kindred?' : 'Already have an account?'}{' '}
        <button
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
