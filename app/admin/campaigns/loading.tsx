export default function Loading() {
  return <div className="pt-2">
    <div className="h-4 w-28 animate-pulse rounded bg-muted" />
    <div className="mt-3 h-8 w-64 animate-pulse rounded bg-muted" />
    <div className="mt-4 flex gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-8 w-20 animate-pulse rounded-full bg-muted" />)}</div>
    <div className="mt-5 space-y-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[124px] animate-pulse rounded-2xl bg-muted" />)}</div>
  </div>
}
