import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Where Supabase sends people back after an email link: password recovery and email
 * confirmation both land here with a one-time `code` that must be exchanged for a
 * session cookie before the destination page can do anything.
 *
 * Without this route a recovery link signs nobody in, and the reset page would have no
 * session with which to call updateUser().
 */

/** Only same-origin relative paths, so ?next= cannot be turned into an open redirect. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/profile'
  return value
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeNext(url.searchParams.get('next'))

  // Supabase reports link problems (expired, already used) in the query string itself.
  const errorCode = url.searchParams.get('error_code') ?? url.searchParams.get('error')
  if (errorCode) {
    const reason = errorCode.includes('expired') ? 'expired' : 'invalid'
    return NextResponse.redirect(new URL(`/login?notice=link_${reason}`, url.origin))
  }

  if (!code) return NextResponse.redirect(new URL('/login?notice=link_invalid', url.origin))

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL('/login?notice=link_invalid', url.origin))

  return NextResponse.redirect(new URL(next, url.origin))
}
