'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { tryGetSupabaseBrowserClient } from '@/lib/supabase/client'

type AuthUserState = { user: User | null; loading: boolean }

const AuthUserContext = createContext<AuthUserState>({ user: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<AuthUserState>({ user: null, loading: true })

  useEffect(() => {
    const supabase = tryGetSupabaseBrowserClient()
    if (!supabase) { setState({ user: null, loading: false }); return }

    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setState({ user: session?.user ?? null, loading: false })
    }).catch(() => setState({ user: null, loading: false }))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
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
