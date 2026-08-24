import { createClient } from '@supabase/supabase-js'

// The URL and anon key are identical on the server and in the browser, so the server
// falls back to the NEXT_PUBLIC_ copies rather than making you set each value twice.
// Only the service-role key is server-exclusive — it must never gain a NEXT_PUBLIC_ name.
function required(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  throw new Error(`Missing required environment variable: ${names.join(' or ')}`)
}

export function createAdminClient() {
  return createClient(required('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function createAuthClient() {
  return createClient(required('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
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
