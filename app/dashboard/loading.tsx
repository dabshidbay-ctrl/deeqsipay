export default function Loading() {
  return <div className="mx-auto min-h-screen max-w-[470px] border-x border-border px-5 pt-7">
    <div className="h-9 w-40 animate-pulse rounded-lg bg-muted" />
    <div className="mt-8 h-32 w-full animate-pulse rounded-2xl bg-muted" />
    <div className="mt-3 grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}</div>
  </div>
}
