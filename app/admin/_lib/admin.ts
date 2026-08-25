import { cache } from 'react'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server'

/** The two roles allowed anywhere under /admin. `moderator` may read; only `admin` may act. */
export type StaffRole = 'admin' | 'moderator'

export const CAMPAIGN_STATUSES = ['under_review', 'active', 'paused', 'hidden', 'completed', 'rejected', 'removed'] as const
// 'refunded' is a terminal donation status written by refund_donation(); it is listed
// after 'succeeded' because that is the only status a refund can come from.
export const DONATION_STATUSES = ['pending', 'succeeded', 'refunded', 'failed', 'expired'] as const
export const PAYOUT_STATUSES = ['requested', 'approved', 'paid', 'rejected', 'cancelled'] as const

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

function asStaffRole(value: unknown): StaffRole | null {
  return value === 'admin' || value === 'moderator' ? value : null
}

/**
 * Gate for every page in this segment. A stranger — signed out, or signed in as a plain
 * user — gets the ordinary 404, never a redirect and never a 403: the admin area does not
 * confirm its own existence. The layout calls this, and so does every page, because a
 * layout and its page render in parallel and a layout alone would not stop a page's read.
 */
// Deliberately cached: a layout and its page render in parallel and BOTH call this, so
// without dedupe every admin page paid for two auth round trips and two profile reads.
export const requireStaff = cache(async () => {
  // Anything that goes wrong reaching Supabase — unconfigured env, network, a failed
  // role lookup — must read as "not staff", never as a 500. A crash here would both
  // confirm the segment exists and hand a stranger a stack trace.
  const resolved = await (async () => {
    try {
      const user = await getSessionUser()
      if (!user) return null
      const supabase = await createSupabaseServerClient()
      const { data, error } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (error) return null
      const profile = (data ?? null) as { role?: unknown } | null
      const role = asStaffRole(profile?.role)
      return role === null ? null : { user, role, supabase }
    } catch {
      return null
    }
  })()

  // notFound() throws its own control-flow signal, so it is called OUTSIDE the catch
  // above — swallowing it there would let an unauthorised request continue.
  if (resolved === null) notFound()
  return resolved
})

/** PostgREST returns an object for a to-one embed; supabase-js can surface it as an array. */
export function embedded<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** Lives in _components/admin-ui so client components can use those pieces without
 *  pulling this server-only module in behind them. Re-exported here so the pages that
 *  already import it from _lib/admin keep working. */
export { statusLabel } from '../_components/admin-ui'

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function firstParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const raw = params[key]
  return (Array.isArray(raw) ? raw[0] : raw) ?? ''
}

/** Narrow a `?status=` value to one the caller actually supports, so a junk query string filters nothing. */
export function pickStatus(value: string, allowed: readonly string[]): string | null {
  return allowed.includes(value) ? value : null
}
