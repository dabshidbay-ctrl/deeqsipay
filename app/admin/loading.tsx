export default function Loading() {
  return <div className="pt-2">
    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
    <div className="mt-3 h-8 w-52 animate-pulse rounded bg-muted" />
    <div className="mt-6 h-32 w-full animate-pulse rounded-2xl bg-muted" />
    <div className="mt-3 grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}</div>
  </div>
}
