export default function Loading() {
  return <div className="pt-2">
    <div className="h-4 w-32 animate-pulse rounded bg-muted" />
    <div className="mt-3 h-8 w-60 animate-pulse rounded bg-muted" />
    <div className="mt-6 space-y-2.5">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-[58px] animate-pulse rounded-xl bg-muted" />)}</div>
  </div>
}
