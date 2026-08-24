import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request)
  if (!user) return json({ error: 'Authentication required' }, 401)
  const { id } = await params
  if (!uuidPattern.test(id)) return json({ error: 'Invalid donation id' }, 400)
  const { data, error } = await createAdminClient().from('donations').select('id,status,amount_minor,campaign_id,provider_reference,created_at,donor_id').eq('id', id).maybeSingle()
  if (error) return json({ error: 'Unable to load donation' }, 500)
  if (!data || data.donor_id !== user.id) return json({ error: 'Donation not found' }, 404)
  return json({ donation: { id: data.id, status: data.status, amountMinor: data.amount_minor, campaignId: data.campaign_id, providerReference: data.provider_reference, createdAt: data.created_at } })
}
