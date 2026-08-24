/** Shared server-side validation. Never trust a value that arrived over the wire. */

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/**
 * Campaign images are rendered as <img src>. React escapes the attribute, so this is
 * not an XSS hole, but an unvalidated URL still lets a campaign owner point the tag at
 * anything: a tracking pixel that harvests every viewer's IP, an internal address, or
 * a data:/blob: payload. Restrict to plain https with no embedded credentials.
 */
export function isSafeImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false
  let url: URL
  try { url = new URL(value) } catch { return false }
  if (url.protocol !== 'https:') return false
  if (url.username !== '' || url.password !== '') return false
  // Block obvious internal targets.
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.local') || host.endsWith('.internal')) return false
  if (/^(10|127)\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false
  if (host === '169.254.169.254') return false // cloud metadata
  return true
}

/**
 * Reads an amount in minor units from a provider payload that may express it either as
 * major units ("amount": 43.5) or minor ("amount_minor": 4350). Returns null when absent
 * or unparseable, which callers must treat as "cannot verify", never as "matches".
 */
export function providerAmountMinor(payload: Record<string, unknown>): number | null {
  const minor = payload.amount_minor
  if (typeof minor === 'number' && Number.isSafeInteger(minor)) return minor
  const major = payload.amount
  if (typeof major === 'number' && Number.isFinite(major)) return Math.round(major * 100)
  if (typeof major === 'string' && /^\d+(\.\d{1,2})?$/.test(major)) return Math.round(Number(major) * 100)
  return null
}
