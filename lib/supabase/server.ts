import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

/**
 * cache() dedupes per request: a layout and its page both calling this now share one
 * client and, more importantly, one auth round trip. auth.getUser() hits Supabase's auth
 * server over the network — it is not a local cookie read — so every duplicate call was
 * real latency.
 */
export const createSupabaseServerClient = cache(async () => {
  const cookieStore = await cookies()
  return createServerClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Read-only when called from a Server Component; middleware owns cookie writes.
        }
      },
    },
  })
})

export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})
