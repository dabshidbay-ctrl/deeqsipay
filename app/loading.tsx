export default function Loading() {
  return <main className="min-h-screen bg-background"><div className="mx-auto min-h-screen max-w-[470px] border-x border-border px-5 pt-7">
    <div className="h-9 w-32 animate-pulse rounded-lg bg-muted" />
    <div className="mt-8 h-24 w-full animate-pulse rounded-lg bg-muted" />
    <div className="mt-6 space-y-5">{[0, 1, 2].map((i) => <div key={i} className="h-[340px] animate-pulse rounded-[18px] bg-muted" />)}</div>
  </div></main>
}
