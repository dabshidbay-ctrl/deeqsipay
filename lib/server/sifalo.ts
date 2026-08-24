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
  const apiKey = process.env.SIFALO_API_KEY
  if (!baseUrl || !apiKey) throw new Error('Sifalo is not configured')
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey }
}

export function normaliseStatus(raw: string | undefined): SifaloStatus {
  const status = (raw ?? '').toLowerCase()
  if (SUCCESS.has(status)) return 'succeeded'
  if (status === 'expired') return 'expired'
  if (FAILURE.has(status)) return 'failed'
  return 'pending'
}

export async function createSifaloPayment(input: PaymentInput): Promise<SifaloResult> {
  const { baseUrl, apiKey } = getConfig()
  const response = await fetch(`${baseUrl}/payments`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'idempotency-key': input.reference },
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

/** Used by reconciliation when a webhook never arrived. */
export async function getSifaloPayment(providerReference: string): Promise<SifaloResult> {
  const { baseUrl, apiKey } = getConfig()
  const response = await fetch(`${baseUrl}/payments/${encodeURIComponent(providerReference)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Sifalo lookup failed: ${response.status}`)
  const data = await response.json() as { id?: string; reference?: string; status?: string }
  return { providerReference: data.id ?? data.reference ?? providerReference, status: normaliseStatus(data.status) }
}
