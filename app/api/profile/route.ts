import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })

export async function PATCH(request: Request) {
  const user = await requireUser(request)
  if (!user) return json({ error: 'Authentication required' }, 401)

  try {
    const body = await request.json() as { fullName?: string | null }
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim().slice(0, 120) || null : body.fullName === null ? null : undefined

    if (fullName === undefined) return json({ error: 'No fields to update' }, 400)

    const { error } = await createAdminClient()
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', user.id)

    if (error) return json({ error: 'Unable to update profile' }, 500)
    return json({ fullName })
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }
}