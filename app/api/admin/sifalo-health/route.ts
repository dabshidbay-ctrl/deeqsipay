import { NextResponse } from 'next/server'
import { getRole } from '@/lib/server/auth'
import { isSifaloConfigured, pingSifalo } from '@/lib/server/sifalo'

/**
 * Admin-only Sifalo connectivity check. Confirms the credentials are accepted without
 * initiating a charge, so it is safe to run at any time.
 */
export async function GET(request: Request) {
  const actor = await getRole(request)
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  if (actor.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!isSifaloConfigured()) {
    return NextResponse.json({ configured: false, ok: false, detail: 'SIFALO_API_USER / SIFALO_API_KEY are not set.' }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const result = await pingSifalo()
  return NextResponse.json({ configured: true, ...result }, { headers: { 'Cache-Control': 'no-store' } })
}
