=== FILE: lib/supabase/client.ts ===
import { createBrowserClient } from '@supabase/ssr'

let browserClient: ReturnType```html
<typeof createBrowserClient> | null = null

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  browserClient = createBrowserClient(url, anonKey)
  return browserClient
}
=== END FILE ===

=== FILE: lib/supabase/server.ts ===
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export async function createSupabaseServerClient() {
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
}

export async function getSessionUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
=== END FILE ===

=== FILE: lib/supabase/session.ts ===
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

export class AuthRequiredError extends Error {
  constructor() {
    super('You need to sign in to continue.')
    this.name = 'AuthRequiredError'
  }
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function errorMessage(payload: unknown, status: number): string {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const error = (payload as { error?: unknown }).error
    if (typeof error === 'string') return error
  }
  return `Request failed (${status})`
}

export async function authedFetch<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await getSupabaseBrowserClient().auth.getSession()
  if (!session) throw new AuthRequiredError()

  const response = await fetch(input, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${session.access_token}`,
      'content-type': 'application/json',
    },
  })

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    // Non-JSON body; fall through to status handling.
  }

  if (!response.ok) throw new ApiError(response.status, errorMessage(payload, response.status))

  return payload as T
}
=== END FILE ===

=== FILE: middleware.ts ===
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_PATHS = ['/create', '/profile', '/saved', '/settings', '/notifications']

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
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|avif)$).*)'],
}
=== END FILE ===

=== FILE: app/login/page.tsx ===
'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

type Mode = 'signin' | 'signup'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const nextParam = params.get('next')
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/'

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const supabase = getSupabaseBrowserClient()
      const { error: authError } = mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
      if (authError) {
        setError(authError.message)
        return
      }
      router.push(next)
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="pb-12">
      <p className="eyebrow">{mode === 'signin' ? 'welcome back' : 'new here'}</p>
      <h1 className="mt-2 font-serif text-[30px] font-semibold leading-tight tracking-[-0.03em]">
        {mode === 'signin' ? 'Good to see you again.' : 'Join kindred.'}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {mode === 'signin' ? 'Pick up right where you left off.' : 'Start a fundraiser or back one in minutes.'}
      </p>
      <form onSubmit={handleSubmit} className="mt-7 space-y-3">
        <input
          className="amount-input"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-label="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          className="amount-input"
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder="your password"
          aria-label="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error ? <p className="text-[13px] font-medium text-red-600">{error}</p> : null}
        <button type="submit" className="confirm-button" disabled={submitting}>
          {submitting ? 'one moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === 'signin' ? 'New to kindred?' : 'Already have an account?'}{' '}
        <button
          type="button"
          className="font-semibold text-foreground underline underline-offset-4"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError(null)
          }}
        >
          {mode === 'signin' ? 'Create an account' : 'Sign in'}
        </button>
      </p>
    </section>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[470px] flex-col justify-center border-x border-border bg-background px-5 shadow-[0_0_60px_rgba(25,50,40,0.05)]">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
=== END FILE ===

=== FILE: app/auth/signout/route.ts ===
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/', request.url), 303)
}
=== END FILE ===

=== FILE: components/auth-provider.tsx ===
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

type AuthUserState = { user: User | null; loading: boolean }

const AuthUserContext = createContext<AuthUserState>({ user: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<AuthUserState>({ user: null, loading: true })

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({ user: session?.user ?? null, loading: false })
    }).catch(() => setState({ user: null, loading: false }))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ user: session?.user ?? null, loading: false })
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') router.refresh()
    })

    return () => subscription.unsubscribe()
  }, [router])

  return <AuthUserContext.Provider value={state}>{children}</AuthUserContext.Provider>
}

export function useAuthUser(): AuthUserState {
  return useContext(AuthUserContext)
}
=== END FILE ===

=== FILE: components/kindred-header.tsx ===
'use client'

import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useAuthUser } from '@/components/auth-provider'

function initialsForEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const words = local.split(/[._+\-0-9]+/).filter(Boolean)
  const first = words[0]?.charAt(0) ?? ''
  const second = words.length > 1 ? words[1]?.charAt(0) ?? '' : words[0]?.charAt(1) ?? ''
  return `${first}${second}`.toUpperCase() || 'K'
}

export function KindredHeader({ eyebrow = 'kindred' }: { eyebrow?: string }) {
  const { user, loading } = useAuthUser()
  return (
    <header className="flex items-center justify-between px-5 pb-3 pt-7">
      <Link href="/" className="block">
        <p className="font-serif text-[29px] font-semibold leading-none tracking-[-0.04em] text-foreground">kindred</p>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
      </Link>
      <div className="flex items-center gap-2">
        <Link href="/notifications" aria-label="Notifications" className="icon-button relative"><Bell size={19} /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" /></Link>
        {loading ? <span className="avatar" aria-hidden="true" /> : user ? (
          <Link href="/profile" aria-label="Profile" className="avatar">{initialsForEmail(user.email ?? '')}</Link>
        ) : (
          <Link href="/login" aria-label="Sign in" className="avatar">in</Link>
        )}
      </div>
    </header>
  )
}
=== END FILE ===

=== FILE: components/kindred-shell.tsx ===
import Link from 'next/link'
import { Bookmark, Compass, Home, Plus, UserRound } from 'lucide-react'
import { KindredFooter } from '@/components/kindred-footer'
import { KindredHeader } from '@/components/kindred-header'

export { KindredHeader }

export function BottomNav({ active = 'home' }: { active?: string }) {
  return <nav className="bottom-nav">
    <Link href="/" className={`nav-item ${active === 'home' ? 'nav-active' : ''}`}><Home size={20} /><span>Home</span></Link>
    <Link href="/explore" className={`nav-item ${active === 'explore' ? 'nav-active' : ''}`}><Compass size={20} /><span>Explore</span></Link>
    <Link href="/create" className="create-button" aria-label="Create fundraiser"><Plus size={22} /></Link>
    <Link href="/saved" className={`nav-item ${active === 'saved' ? 'nav-active' : ''}`}><Bookmark size={20} /><span>Saved</span></Link>
    <Link href="/profile" className={`nav-item ${active === 'profile' ? 'nav-active' : ''}`}><UserRound size={20} /><span>Profile</span></Link>
  </nav>
}

export function PageFrame({ children, active, eyebrow }: { children: React.ReactNode; active?: string; eyebrow?: string }) {
  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto min-h-screen max-w-[470px] border-x border-border bg-background pb-24 shadow-[0_0_60px_rgba(25,50,40,0.05)]"><KindredHeader eyebrow={eyebrow} />{children}<KindredFooter /><BottomNav active={active} /></div></main>
}

export const seededCampaigns = [
  { id: 1, title: 'Help Maya get back on her feet', category: 'Medical', raised: 18420, goal: 25000, donors: 312, days: 12, image: 'https://images.unsplash.com/photo-1542810634-71277d95dcbb?auto=format&fit=crop&w=1200&q=85', person: 'Maya Thompson', initials: 'MT', tint: 'sun' },
  { id: 2, title: 'A warm home for the Rivera family', category: 'Emergency', raised: 9200, goal: 12000, donors: 186, days: 8, image: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1200&q=85', person: 'Ana Rivera', initials: 'AR', tint: 'sky' },
  { id: 3, title: 'Keep our neighborhood garden growing', category: 'Community', raised: 6780, goal: 10000, donors: 94, days: 23, image: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=85', person: 'Greenway Collective', initials: 'GC', tint: 'mint' },
]

type Campaign = typeof seededCampaigns[number]
export function CampaignCard({ campaign }: { campaign: Campaign }) {
  return <article className="campaign-card"><div className="relative"><img src={campaign.image} alt={campaign.title} className="campaign-image" /><div className="image-fade" /><span className="category-badge">{campaign.category}</span></div><div className="p-4"><h3 className="font-serif text-[21px] font-semibold leading-tight tracking-[-0.025em]">{campaign.title}</h3><div className="mt-3 flex items-center gap-2"><span className={`mini-avatar ${campaign.tint}`}>{campaign.initials}</span><span className="text-xs font-medium text-muted-foreground">by <strong className="text-foreground">{campaign.person}</strong></span></div><div className="mt-4"><div className="progress-track"><div className="progress-fill" style={{ width: `${campaign.raised / campaign.goal * 100}%` }} /></div><div className="mt-2 flex justify-between text-xs"><span><strong className="text-sm">${campaign.raised.toLocaleString()}</strong> raised of ${campaign.goal.toLocaleString()}</span><span className="font-medium text-muted-foreground">{campaign.days} days left</span></div></div><div className="mt-4 flex items-center justify-between border-t border-border pt-3"><span className="text-xs text-muted-foreground">{campaign.donors} people donated</span><Link href={`/campaigns/${campaign.id}`} className="donate-button">View story</Link></div></div></article>
}
=== END FILE ===

=== NOTES ===
- KindredHeader lives in its own `components/kindred-header.tsx` ('use client') and is re-exported from `kindred-shell.tsx`; marking the whole shell file 'use client' would turn `seededCampaigns` into a client reference and break server components that dot into it. Import paths (`@/components/kindred-shell`) are unchanged.
- `AuthProvider` is not mounted anywhere yet — `app/layout.tsx` must wrap `{children}` in `<AuthProvider>` for `useAuthUser()` to see session state (layout wasn't in scope, so I didn't guess its contents).
- Login assumes Supabase email confirmation is disabled; if it's enabled, `signUp` succeeds without a session and the user lands on `next` still signed out (middleware will bounce protected pages back to `/login`). Easy follow-up: branch on `data.session === null` and show a "check your email" notice.
- Sign-out route answers 303 so browsers convert the POST into a GET of `/`.
- `authedFetch` is generic (`authedFetch<MyType>(...)`) and falls back to a generic message when the error body isn't `{ error: string }`.
- `next` param is restricted to same-origin relative paths to avoid an open redirect via `?next=//evil.com`.
- Requires `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` at build/runtime; the existing `lib/server/supabase-admin.ts` env contract is untouched, and no API route was modified.
=== END NOTES ===
```