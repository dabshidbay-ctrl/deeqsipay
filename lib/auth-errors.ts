/**
 * Supabase auth errors are raw and inconsistent ("Invalid login credentials",
 * "AuthApiError: ..."), and a few leak more than they should. This maps them to
 * sentences a person can act on.
 *
 * Deliberately: a wrong password and an unknown email produce the SAME message. Telling
 * a stranger "no account with that email" turns the login form into a tool for checking
 * who has an account here — on a platform where an account implies a medical or hardship
 * campaign, that is worth protecting.
 */

type MaybeAuthError = { message?: string; code?: string; status?: number } | null | undefined

const SIGNIN_FAILED = 'That email and password don’t match. Check them and try again.'

export function authErrorMessage(error: MaybeAuthError, context: 'signin' | 'signup' | 'reset' | 'update'): string {
  if (!error) return 'Something went wrong. Please try again.'
  const message = (error.message ?? '').toLowerCase()
  const code = (error.code ?? '').toLowerCase()

  // Rate limiting — surface the wait, because a vague failure makes people retry harder.
  if (code === 'over_email_send_rate_limit' || message.includes('rate limit') || message.includes('for security purposes')) {
    const seconds = /after (\d+) seconds?/.exec(error.message ?? '')?.[1]
    return seconds
      ? `Too many attempts. Please wait ${seconds} seconds and try again.`
      : 'Too many attempts. Please wait a minute and try again.'
  }

  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'We could not reach the server. Check your connection and try again.'
  }

  if (message.includes('email not confirmed') || code === 'email_not_confirmed') {
    return 'Confirm your email first — check your inbox for the link we sent.'
  }

  if (context === 'signup') {
    if (message.includes('already registered') || message.includes('already exists') || code === 'user_already_exists') {
      return 'An account with that email already exists. Try signing in instead.'
    }
    if (message.includes('password') && (message.includes('at least') || message.includes('short') || message.includes('weak'))) {
      return 'Choose a password of at least 8 characters.'
    }
    if (message.includes('invalid') && message.includes('email')) {
      return 'That email address does not look right.'
    }
    return 'We could not create your account. Please try again.'
  }

  if (context === 'reset') {
    // Never confirm whether the address exists; the page says "if it exists" regardless.
    return 'We could not send the reset email. Please try again shortly.'
  }

  if (context === 'update') {
    if (message.includes('same') || message.includes('should be different')) {
      return 'That is the same as your current password. Choose a different one.'
    }
    if (message.includes('password') && (message.includes('at least') || message.includes('short') || message.includes('weak'))) {
      return 'Choose a password of at least 8 characters.'
    }
    if (message.includes('expired') || message.includes('invalid') || code === 'otp_expired') {
      return 'That reset link has expired. Request a new one.'
    }
    return 'We could not update your password. Please try again.'
  }

  // signin: one message for wrong password AND unknown email.
  if (message.includes('invalid login') || message.includes('invalid credentials') || code === 'invalid_credentials') {
    return SIGNIN_FAILED
  }
  return SIGNIN_FAILED
}

/** Client-side password rule, mirrored wherever a password is set. */
export const MIN_PASSWORD_LENGTH = 8

export function passwordProblem(password: string): string | null {
  if (password.length === 0) return null
  if (password.length < MIN_PASSWORD_LENGTH) return `At least ${MIN_PASSWORD_LENGTH} characters.`
  return null
}
