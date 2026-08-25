import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_PATHS = ['/create', '/dashboard', '/profile', '/saved', '/settings', '/notifications']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return response

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  // Only the paths that actually need a gate. The previous catch-all matcher ran
  // supabase.auth.getUser() — a network call to Supabase's auth server — on every public
  // page view, adding a round trip to pages that do not care who you are.
  // /admin is deliberately absent: it gates itself with notFound() so it returns a plain
  // 404 rather than redirecting to login and revealing that it exists.
  matcher: [
    '/create/:path*',
    '/dashboard/:path*',
    '/profile/:path*',
    '/saved/:path*',
    '/settings/:path*',
    '/notifications/:path*',
  ],
}
