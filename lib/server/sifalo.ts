/**
 * Sifalo Pay — verified against their official WooCommerce plugin (sifalo-pay),
 * which is the only public description of this API.
 *
 *   POST https://api.sifalopay.com/gateway/
 *   Authorization: Basic base64(api_user_id:api_key)
 *   Content-Type: application/json
 *   { amount, account, gateway, currency, channel, txn_order_id, url, ip, billing }
 *
 * Response: { code, response }. 601 is success; the 60x codes below are failures.
 *
 * IMPORTANT — this API is SYNCHRONOUS and has NO webhook and NO status-lookup
 * endpoint for direct charges. The payer approves on their handset while the HTTP
 * request is open, and the response IS the outcome. Consequences:
 *   - There is nothing to poll and nothing to reconcile against. If the request
 *     times out the true outcome is genuinely unknowable from our side, so the
 *     donation stays 'pending' for a human to settle against the Sifalo portal.
 *   - Do not "fix" a timeout by assuming success or failure. Either guess is wrong
 *     half the time and one of them credits money that never arrived.
 */

// Wallet constants live in lib/wallets.ts so client components can import them without
// dragging this module — and its credential handling — into the browser bundle.
export { SIFALO_WALLETS, isSifaloWallet, type SifaloWallet } from '@/lib/wallets'
import type { SifaloWallet } from '@/lib/wallets'

// The payer is tapping a PIN into a handset while this request is open, so it needs a
// far longer budget than an ordinary API call — but still a bounded one.
const REQUEST_TIMEOUT_MS = 90_000

const SUCCESS_CODE = '601'
const FAILURE_MESSAGES: Record<string, string> = {
  '602': 'The payment did not go through. Check the number and try again.',
  '603': 'There was not enough balance on that account.',
  '604': 'That account number was not recognised.',
  '605': 'The request timed out before it was approved.',
  '606': 'Mobile money is temporarily unavailable. Please try again shortly.',
}

export type SifaloOutcome =
  | { status: 'succeeded'; providerReference: string; rawCode: string }
  | { status: 'failed' | 'expired'; providerReference: string; rawCode: string; message: string }

export class SifaloUnknownError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SifaloUnknownError'
  }
}

type ChargeInput = {
  amountMinor: number
  currency: string
  account: string
  wallet: SifaloWallet
  reference: string
  originUrl: string
  ip: string
  billing?: string
}

function getConfig() {
  const baseUrl = process.env.SIFALO_API_BASE_URL ?? 'https://api.sifalopay.com/gateway/'
  const apiUser = process.env.SIFALO_API_USER
  const apiKey = process.env.SIFALO_API_KEY
  if (!apiUser || !apiKey) throw new Error('Sifalo is not configured')
  return { baseUrl: baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`, apiUser, apiKey }
}

export function isSifaloConfigured(): boolean {
  return Boolean(process.env.SIFALO_API_USER && process.env.SIFALO_API_KEY)
}

/** Amounts go to Sifalo in MAJOR units with 2 decimals; we hold minor units everywhere else. */
function toMajorUnits(minor: number): string {
  return (minor / 100).toFixed(2)
}

export async function chargeSifalo(input: ChargeInput): Promise<SifaloOutcome> {
  const { baseUrl, apiUser, apiKey } = getConfig()
  const authorization = Buffer.from(`${apiUser}:${apiKey}`).toString('base64')

  let response: Response
  try {
    response = await fetch(baseUrl, {
      method: 'POST',
      headers: { authorization: `Basic ${authorization}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        amount: toMajorUnits(input.amountMinor),
        account: input.account,
        gateway: input.wallet,
        currency: input.currency,
        channel: 'kindred',
        txn_order_id: input.reference,
        url: input.originUrl,
        ip: input.ip,
        billing: input.billing ?? '',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (caught) {
    // Timed out or the connection dropped. The charge may or may not have completed
    // upstream and there is no way to ask, so this is explicitly UNKNOWN.
    throw new SifaloUnknownError(caught instanceof Error ? caught.message : 'Sifalo request failed')
  }

  if (!response.ok) throw new SifaloUnknownError(`Sifalo returned HTTP ${response.status}`)

  let data: { code?: unknown; response?: unknown; sid?: unknown; txn_id?: unknown }
  try {
    data = await response.json() as typeof data
  } catch {
    throw new SifaloUnknownError('Sifalo returned a non-JSON response')
  }

  const code = data.code === undefined || data.code === null ? '' : String(data.code)
  const providerReference = typeof data.txn_id === 'string' && data.txn_id !== ''
    ? data.txn_id
    : typeof data.sid === 'string' && data.sid !== ''
      ? data.sid
      : input.reference

  if (code === SUCCESS_CODE) return { status: 'succeeded', providerReference, rawCode: code }

  const message = FAILURE_MESSAGES[code]
    ?? (typeof data.response === 'string' && data.response !== '' ? data.response : 'The payment could not be completed.')
  return { status: code === '605' ? 'expired' : 'failed', providerReference, rawCode: code, message }
}
