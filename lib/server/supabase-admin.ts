import { createClient } from '@supabase/supabase-js'

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export function createAdminClient() {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function createAuthClient() {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function getBearerToken(request: Request) {
  const value = request.headers.get('authorization')
  return value?.startsWith('Bearer ') ? value.slice(7) : null
}

export async function requireUser(request: Request) {
  const token = getBearerToken(request)
  if (!token) return null
  const { data: { user } } = await createAuthClient().auth.getUser(token)
  return user
}
