import * as Sentry from '@sentry/nextjs'
import { SENTRY_DSN, TRACES_SAMPLE_RATE, scrubEvent } from '@/lib/sentry-scrub'

/** Edge runtime — middleware.ts runs here, which is the auth gate for every private page. */
Sentry.init({
  dsn: SENTRY_DSN,
  enabled: Boolean(SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: TRACES_SAMPLE_RATE,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
})
