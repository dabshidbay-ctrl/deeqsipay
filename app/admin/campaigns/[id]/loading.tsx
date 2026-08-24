export default function Loading() {
  return <div className="pt-2">
    <div className="flex items-center gap-4 pb-5"><div className="size-[38px] animate-pulse rounded-full bg-muted" /><div className="flex-1"><div className="h-3 w-24 animate-pulse rounded bg-muted" /><div className="mt-2 h-6 w-3/4 animate-pulse rounded bg-muted" /></div></div>
    <div className="h-56 w-full animate-pulse rounded-2xl bg-muted" />
    <div className="mt-6 space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />)}</div>
  </div>
}
