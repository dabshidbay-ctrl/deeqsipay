import { tryGetSupabaseBrowserClient } from '@/lib/supabase/client'

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
  const supabase = tryGetSupabaseBrowserClient()
  if (!supabase) throw new AuthRequiredError()
  const { data: { session } } = await supabase.auth.getSession()
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
