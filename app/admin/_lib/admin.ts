import { notFound } from 'next/navigation'
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server'

/** The two roles allowed anywhere under /admin. `moderator` may read; only `admin` may act. */
export type StaffRole = 'admin' | 'moderator'

export const CAMPAIGN_STATUSES = ['under_review', 'active', 'paused', 'hidden', 'completed', 'rejected', 'removed'] as const
export const DONATION_STATUSES = ['pending', 'succeeded', 'failed', 'expired'] as const
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
export async function requireStaff() {
  const user = await getSessionUser()
  if (!user) notFound()
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const profile = (data ?? null) as { role?: unknown } | null
  const role = asStaffRole(profile?.role)
  if (role === null) notFound()
  return { user, role, supabase }
}

/** PostgREST returns an object for a to-one embed; supabase-js can surface it as an array. */
export function embedded<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, ' ')
}

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
