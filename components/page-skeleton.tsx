/**
 * Shared loading skeleton. Its real job is not decoration: a segment WITHOUT a
 * loading.tsx shows nothing at all during navigation, and Next cannot prefetch a
 * dynamic route past a missing loading boundary. Adding one turns a frozen click
 * into an instant response.
 */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return <main className="min-h-screen bg-background">
    <div className="mx-auto min-h-screen max-w-[470px] border-x border-border px-5 pt-7">
      <div className="h-8 w-36 animate-pulse rounded-md bg-muted" />
      <div className="mt-6 h-20 w-full animate-pulse rounded-xl bg-muted" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  </main>
}
