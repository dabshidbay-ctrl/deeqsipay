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
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
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
    unoptimized: true,
  },
}

export default nextConfig
