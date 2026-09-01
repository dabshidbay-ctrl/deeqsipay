import * as Sentry from '@sentry/nextjs'
import { SENTRY_DSN, scrubEvent } from '@/lib/sentry-scrub'

/**
 * Browser runtime. Deliberately thinner than the server: no session replay and no traces.
 * The donate form has a mobile money number and an amount on screen the whole time it is
 * open, and a replay of that screen is exactly the recording we must not make.
 */
Sentry.init({
  dsn: SENTRY_DSN,
  enabled: Boolean(SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
