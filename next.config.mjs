import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      // Real XSS containment. Next needs inline/eval for hydration and the dev overlay;
      // everything else is locked down. img-src allows https so campaign images from
      // arbitrary hosts still render (those URLs are validated server-side on write).
      { key: 'Content-Security-Policy', value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ') },
    ] }]
  },
  typescript: {
    // Was true, which shipped type errors to production. The codebase now
    // typechecks clean — keep it false so regressions fail the build.
    ignoreBuildErrors: false,
  },
  images: {
    // Was `unoptimized: true`, which shipped the original upload — often several MB
    // straight off a phone camera — to a mobile-first audience on metered data. Next now
    // resizes and re-encodes. The allow-list below is what makes that safe to turn on: a
    // campaign image URL is attacker-influenced, and an open optimiser is an open proxy.
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
    formats: ['image/avif', 'image/webp'],
    // The shell is capped at 470px wide, so the huge default breakpoints only ever
    // produced variants nothing would request.
    deviceSizes: [360, 420, 470, 640, 940],
    imageSizes: [64, 128, 190, 288],
    minimumCacheTTL: 2592000,
  },
}

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Absent locally and in preview: source-map upload is simply skipped, no build failure.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  /**
   * Browser events are posted to a same-origin route which forwards them on, instead of
   * straight to ingest.sentry.io. Two reasons, both real: the strict `connect-src 'self'`
   * in the CSP above stays untouched, and ad-blockers — which drop requests to Sentry by
   * hostname — cannot silently swallow our error reports.
   */
  tunnelRoute: '/monitoring',
  // Uploaded for readable stack traces, then deleted so they never ship to the browser.
  // A source map of the donate form is a map of our validation.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  disableLogger: true,
})
