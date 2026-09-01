import type { ErrorEvent, EventHint } from '@sentry/nextjs'

/**
 * What this platform must never ship to a third-party error tracker.
 *
 * Sentry captures more than a stack trace: request bodies, query strings, breadcrumbs and
 * local variables all travel with an event. On this codebase those routinely contain a
 * donor's mobile money number, a storage path to somebody's passport, and — in a config
 * error — a service-role key. An error tracker is a convenience; none of that is worth
 * leaking to keep it. So the default posture is to strip, and the exceptions are listed.
 */

/** 7+ consecutive digits, optionally +-prefixed and punctuated: a phone or an account number. */
const PHONE_LIKE = /(\+?\d[\d\s().-]{6,}\d)/g

/** Supabase/JWT-shaped tokens and anything that looks like a bearer credential. */
const TOKEN_LIKE = /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g

/** Storage paths under the private identity bucket, which name a real person's document. */
const IDENTITY_PATH = /\bidentity-documents\/[^\s"']+/g

export function redact(value: string): string {
  return value
    .replace(TOKEN_LIKE, '[token]')
    .replace(IDENTITY_PATH, 'identity-documents/[redacted]')
    .replace(PHONE_LIKE, '[phone]')
}

function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return value
  if (typeof value === 'string') return redact(value)
  if (Array.isArray(value)) return value.map((entry) => redactDeep(entry, depth + 1))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactDeep(entry, depth + 1)]))
  }
  return value
}

/**
 * Shared beforeSend for every runtime. Order matters: drop whole containers first, then
 * scrub what survives, so a value we forgot to enumerate is still caught by the regexes.
 */
export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  // The request BODY is where donation phone numbers and identity paths live. There is no
  // version of it we want, so it never gets a chance to be interesting.
  if (event.request) {
    delete event.request.data
    delete event.request.cookies
    if (event.request.headers) {
      for (const header of ['authorization', 'cookie', 'x-forwarded-for', 'x-real-ip']) {
        delete event.request.headers[header]
      }
    }
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = redact(event.request.query_string)
    }
    if (typeof event.request.url === 'string') event.request.url = redact(event.request.url)
  }

  // Identify by opaque user id only. Never email, never IP.
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : undefined
  }

  if (event.message) event.message = redact(event.message)

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redact(exception.value)
    for (const frame of exception.stacktrace?.frames ?? []) {
      // Local variables are the sneakiest leak: `phone` and `body` are in scope at the
      // exact moment a donation route throws.
      if (frame.vars) frame.vars = redactDeep(frame.vars) as typeof frame.vars
    }
  }

  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message) breadcrumb.message = redact(breadcrumb.message)
    if (breadcrumb.data) breadcrumb.data = redactDeep(breadcrumb.data) as typeof breadcrumb.data
  }

  return event
}

/** Sampling. Errors are always sent; traces are a cost, so they are sampled hard in production. */
export const TRACES_SAMPLE_RATE = process.env.NODE_ENV === 'production' ? 0.1 : 0

/** No DSN configured means the SDK stays inert — Sentry is optional, not a hard dependency. */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN
