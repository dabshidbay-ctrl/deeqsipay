import type { AuthUser as User } from '@supabase/supabase-js'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'

/**
 * Role gating for admin/moderator routes.
 *
 * `profiles.role` is revoked from `authenticated` at the column level (CONTRACT rule 3), so
 * it is read here with the service-role client and NEVER taken from the request — a header,
 * a cookie or a JSON field claiming a role is worth nothing. A profile row that is missing
 * or has a null role degrades to the least privileged role, never to admin.
 */

export type Actor = { user: User; role: string }

export async function getRole(request: Request): Promise<Actor | null> {
  const user = await requireUser(request)
  if (!user) return null
  const { data } = await createAdminClient().from('profiles').select('role').eq('id', user.id).maybeSingle()
  const row = data as { role?: string | null } | null
  return { user, role: typeof row?.role === 'string' ? row.role : 'user' }
}

export async function requireRole(request: Request, roles: ReadonlyArray<'admin' | 'moderator'>): Promise<Actor | null> {
  const actor = await getRole(request)
  if (!actor) return null
  return roles.some((role) => role === actor.role) ? actor : null
}

/**
 * Every payout and campaign-status transition happens inside a SECURITY DEFINER function
 * that raises on an illegal move. Those messages are internal SQL text — they can name
 * columns, functions and row ids — so they are mapped to a curated message here and
 * `error.message` is never forwarded to the client.
 */
export function rpcFailure(error: { message: string; code?: string | null } | null): { error: string; status: number } {
  const code = error?.code ?? ''
  // P0001 is a plpgsql `raise exception`, 23xxx a constraint violation: those are the rule
  // violations the caller caused. Anything else (missing function, dead connection) is ours
  // and must not be reported as a client error.
  if (code !== 'P0001' && !code.startsWith('23')) return { error: 'Unable to complete request', status: 500 }
  const message = (error?.message ?? '').toLowerCase()
  if (/admin|forbidden|permission|denied|not allowed|not permitted/.test(message)) return { error: 'Forbidden', status: 403 }
  if (/owner|requested_by|not yours|belongs to/.test(message)) return { error: 'Forbidden', status: 403 }
  if (/not found|does not exist|no such/.test(message)) return { error: 'Not found', status: 404 }
  if (/available|insufficient|exceed|balance/.test(message)) return { error: 'Amount exceeds the available balance', status: 400 }
  if (/amount|minimum|at least/.test(message)) return { error: 'Invalid amount', status: 400 }
  if (/status|transition|state/.test(message)) return { error: 'That change is not allowed', status: 400 }
  return { error: 'Request rejected', status: 400 }
}
