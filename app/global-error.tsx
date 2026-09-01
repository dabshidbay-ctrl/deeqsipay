'use client'

/**
 * Last-resort boundary. app/error.tsx cannot catch a failure in the root layout itself,
 * so this one replaces the whole document — which is why it must render its own <html>
 * and <body>, and must not depend on anything the layout provides (fonts, providers,
 * theme tokens). Everything here is inline for that reason.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#fbfcf9', color: '#18312a', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center' }}>
          <div style={{ maxWidth: 420 }}>
            <p style={{ color: '#267d62', fontSize: 10, fontWeight: 800, letterSpacing: '.15em', textTransform: 'uppercase' }}>Something broke</p>
            <h1 style={{ marginTop: 12, fontSize: 30, lineHeight: 1.2, fontWeight: 600 }}>deeqsipay hit an unexpected error.</h1>
            <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.7, color: '#71817a' }}>
              This one is on us. Nothing you were doing was lost — reload and try again.
            </p>
            {error.digest && (
              <p style={{ marginTop: 16, fontSize: 11, color: '#71817a' }}>
                Reference: <code>{error.digest}</code>
              </p>
            )}
            <button onClick={reset} style={{ marginTop: 28, width: '100%', padding: '15px', border: 0, borderRadius: 999, background: '#267d62', color: '#f4f8f2', fontWeight: 800, cursor: 'pointer' }}>
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- deliberate.
                global-error replaces the root layout after the React tree has already
                failed; a <Link> soft-navigation would re-enter the broken tree. This
                needs to be a hard page load. */}
            <a href="/" style={{ display: 'block', marginTop: 12, fontSize: 12, fontWeight: 700, color: '#267d62' }}>Go home</a>
          </div>
        </main>
      </body>
    </html>
  )
}
