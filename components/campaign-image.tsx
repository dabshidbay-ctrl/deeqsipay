import Image from 'next/image'

/**
 * Campaign images arrive from two places: our own Supabase bucket, uploaded through
 * /api/uploads, and — for anything created before that existed — an arbitrary https URL
 * an organiser pasted, which isSafeImageUrl() permits.
 *
 * next/image only optimises hosts on the next.config allow-list; anything else is served
 * a 400 by the optimiser. An open allow-list would turn /_next/image into an open image
 * proxy for a field organisers control, so the list stays closed and an unrecognised host
 * falls back to a plain <img> instead. Those still get lazy loading and async decoding —
 * no resizing, but no broken image either.
 */
const SUPABASE_PUBLIC = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\//i

function optimisable(src: string): boolean {
  // A leading slash is our own /public directory, served from this origin.
  return src.startsWith('/') || SUPABASE_PUBLIC.test(src)
}

export function CampaignImage({ src, alt, className, width, height, priority = false }: {
  src: string
  alt: string
  className?: string
  width: number
  height: number
  priority?: boolean
}) {
  if (!optimisable(src)) {
    // eslint-disable-next-line @next/next/no-img-element -- deliberate: see above.
    return <img src={src} alt={alt} className={className} width={width} height={height} loading={priority ? 'eager' : 'lazy'} decoding="async" />
  }
  return <Image
    src={src}
    alt={alt}
    className={className}
    width={width}
    height={height}
    // The shell is capped at 470px, so there is no point offering wider candidates.
    sizes="(max-width: 470px) 100vw, 470px"
    priority={priority}
  />
}
