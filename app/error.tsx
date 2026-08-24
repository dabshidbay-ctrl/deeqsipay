'use client'

import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto flex min-h-screen max-w-[470px] flex-col items-center justify-center border-x border-border px-8 text-center">
    <p className="eyebrow">Something went wrong</p>
    <h1 className="mt-3 font-serif text-3xl font-semibold tracking-[-0.03em]">We couldn&apos;t load this page.</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">This one is on us, not you. Try again in a moment.</p>
    <button onClick={reset} className="confirm-button mt-7 max-w-[220px]">Try again</button>
  </div></main>
}
