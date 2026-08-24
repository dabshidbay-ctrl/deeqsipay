import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/server/supabase-admin'
import { getRole } from '@/lib/server/auth'
import { isUuid } from '@/lib/server/validation'

/**
 * Mints a short-lived signed URL for an organiser's identity document.
 *
 * The 'identity-documents' bucket is private and has NO select policy, so this is the
 * only path to the file anywhere in the system. Rules that keep it that way:
 *   - admin only. Moderators can review a campaign's content but have no business
 *     looking at someone's passport, and read-only does not mean read-everything.
 *   - the URL expires in 60 seconds. Long enough to open, too short to pass around.
 *   - the signed URL is never stored, logged, or written into the campaign row.
 */

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const EXPIRES_IN_SECONDS = 60

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getRole(request)
  if (!actor) return json({ error: 'Authentication required' }, 401)
  if (actor.role !== 'admin') return json({ error: 'Forbidden' }, 403)

  const { id } = await params
  if (!isUuid(id)) return json({ error: 'Invalid campaign id' }, 400)

  const supabase = createAdminClient()
  const { data: campaign } = await supabase.from('campaigns').select('identity_document_path').eq('id', id).maybeSingle()
  const path = campaign?.identity_document_path
  if (typeof path !== 'string' || path === '') return json({ error: 'No identity document on file' }, 404)

  const { data, error } = await supabase.storage.from('identity-documents').createSignedUrl(path, EXPIRES_IN_SECONDS)
  if (error || !data) return json({ error: 'Unable to open the document' }, 500)

  return json({ url: data.signedUrl, expiresInSeconds: EXPIRES_IN_SECONDS })
}
