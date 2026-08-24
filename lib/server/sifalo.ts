type PaymentInput = {
  amountMinor: number
  currency: string
  phone: string
  reference: string
  callbackUrl: string
}

export type SifaloStatus = 'pending' | 'succeeded' | 'failed' | 'expired'
export type SifaloResult = { providerReference: string; status: SifaloStatus }

// A hung provider must not hold a request (and a DB connection) open indefinitely.
const REQUEST_TIMEOUT_MS = 15_000

const SUCCESS = new Set(['success', 'succeeded', 'paid', 'completed'])
const FAILURE = new Set(['failed', 'declined', 'cancelled'])

function getConfig() {
  const baseUrl = process.env.SIFALO_API_BASE_URL
  const username = process.env.SIFALO_USERNAME
  const apiKey = process.env.SIFALO_API_KEY
  if (!baseUrl || !username || !apiKey) throw new Error('Sifalo is not configured')
  return { baseUrl: baseUrl.replace(/\/$/, ''), username, apiKey }
}

export function isSifaloConfigured(): boolean {
  return Boolean(process.env.SIFALO_API_BASE_URL && process.env.SIFALO_USERNAME && process.env.SIFALO_API_KEY)
}

// HTTP Basic over the username/key pair. If Sifalo expects the pair as separate headers
// instead, this is the only function that needs to change.
function authHeaders(username: string, apiKey: string): Record<string, string> {
  return { authorization: `Basic ${Buffer.from(`${username}:${apiKey}`).toString('base64')}` }
}

export function normaliseStatus(raw: string | undefined): SifaloStatus {
  const status = (raw ?? '').toLowerCase()
  if (SUCCESS.has(status)) return 'succeeded'
  if (status === 'expired') return 'expired'
  if (FAILURE.has(status)) return 'failed'
  return 'pending'
}

export async function createSifaloPayment(input: PaymentInput): Promise<SifaloResult> {
  const { baseUrl, username, apiKey } = getConfig()
  const response = await fetch(`${baseUrl}/payments`, {
    method: 'POST',
    headers: { ...authHeaders(username, apiKey), 'content-type': 'application/json', 'idempotency-key': input.reference },
    body: JSON.stringify({ amount: input.amountMinor / 100, currency: input.currency, phone: input.phone, reference: input.reference, callback_url: input.callbackUrl }),
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Sifalo request failed: ${response.status}`)
  const data = await response.json() as { id?: string; reference?: string; status?: string }
  const providerReference = data.id ?? data.reference
  if (!providerReference) throw new Error('Sifalo response missing reference')
  return { providerReference, status: normaliseStatus(data.status) }
}

/**
 * Authoritative status straight from Sifalo. Used by reconciliation when a webhook never
 * arrived, and by the webhook itself whenever the payload cannot be cryptographically
 * trusted — asking the provider directly is the only way to know a payment is real.
 */
export async function getSifaloPayment(providerReference: string): Promise<SifaloResult & { amountMinor: number | null }> {
  const { baseUrl, username, apiKey } = getConfig()
  const response = await fetch(`${baseUrl}/payments/${encodeURIComponent(providerReference)}`, {
    headers: authHeaders(username, apiKey),
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Sifalo lookup failed: ${response.status}`)
  const data = await response.json() as { id?: string; reference?: string; status?: string; amount?: number | string; amount_minor?: number }
  const amountMinor = typeof data.amount_minor === 'number' && Number.isSafeInteger(data.amount_minor)
    ? data.amount_minor
    : typeof data.amount === 'number' && Number.isFinite(data.amount)
      ? Math.round(data.amount * 100)
      : typeof data.amount === 'string' && /^\d+(\.\d{1,2})?$/.test(data.amount)
        ? Math.round(Number(data.amount) * 100)
        : null
  return { providerReference: data.id ?? data.reference ?? providerReference, status: normaliseStatus(data.status), amountMinor }
}
