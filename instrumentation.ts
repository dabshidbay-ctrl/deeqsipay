import type { Instrumentation } from 'next'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config')
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config')
}

/**
 * Next hands every uncaught error from a route handler, server component or middleware to
 * this hook. Without it, App Router errors never reach Sentry at all — Sentry.init alone
 * does not see them.
 */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(...args)
}
