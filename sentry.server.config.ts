import * as Sentry from '@sentry/nextjs'
import { SENTRY_DSN, TRACES_SAMPLE_RATE, scrubEvent } from '@/lib/sentry-scrub'

/**
 * Server runtime. This is the one that matters: the Sifalo gateway is synchronous with no
 * webhook, so a 500 inside POST /api/donations is money in motion with nothing to
 * reconcile against later. Without this, that failure is a line in a log nobody reads.
 */
Sentry.init({
  dsn: SENTRY_DSN,
  enabled: Boolean(SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: TRACES_SAMPLE_RATE,
  // Explicitly off. The default already omits it; being loud about it here is the point.
  sendDefaultPii: false,
  beforeSend: scrubEvent,
})
