import Link from 'next/link'

export default function NotFound() {
  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto flex min-h-screen max-w-[470px] flex-col items-center justify-center border-x border-border px-8 text-center">
    <p className="eyebrow">Nothing here</p>
    <h1 className="mt-3 font-serif text-3xl font-semibold tracking-[-0.03em]">This story has moved on.</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">The page you were looking for isn&apos;t available.</p>
    <Link href="/explore" className="confirm-button mt-7 max-w-[220px]">Explore campaigns</Link>
  </div></main>
}
