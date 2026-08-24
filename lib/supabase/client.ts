import { createBrowserClient } from '@supabase/ssr'

type BrowserClient = ReturnType<typeof createBrowserClient>

let browserClient: BrowserClient | null = null

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return url && anonKey ? { url, anonKey } : null
}

export function isSupabaseConfigured(): boolean {
  return config() !== null
}

/** Returns null when the Supabase env vars are absent, so an unconfigured app
 *  renders as signed-out instead of crashing the whole tree. */
export function tryGetSupabaseBrowserClient(): BrowserClient | null {
  if (browserClient) return browserClient
  const settings = config()
  if (!settings) return null
  browserClient = createBrowserClient(settings.url, settings.anonKey)
  return browserClient
}

/** Use only where a missing config genuinely is unrecoverable. */
export function getSupabaseBrowserClient(): BrowserClient {
  const client = tryGetSupabaseBrowserClient()
  if (!client) throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  return client
}
