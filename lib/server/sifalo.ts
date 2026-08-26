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
// Codes that mean OUR request was wrong, not that the donor's payment failed.
const SYSTEM_CODES = new Set(['0', '404', '600', ''])
const FAILURE_MESSAGES: Record<string, string> = {
  '602': 'The payment did not go through. Check the number and try again.',
  '603': 'There was not enough balance on that account.',
  '604': 'That account number was not recognised.',
  '605': 'The request timed out before it was approved.',
  '606': 'Mobile money is temporarily unavailable. Please try again shortly.',
}

export type SifaloStatus = 'succeeded' | 'failed' | 'expired'

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

/**
 * Direct (in-app) charging vs hosted checkout.
 *
 * Verified against the live gateway: this merchant account returns an EMPTY body for
 * every direct-charge gateway, so direct charging is NOT provisioned. chargeSifalo() is
 * kept and fully wired behind this flag — flip SIFALO_DIRECT_CHARGE=true the moment
 * Sifalo enables it and the native flow takes over with no code change.
 *
 * Leave it off until Sifalo confirms, otherwise every donation dies in an empty response.
 */
export function isDirectChargeEnabled(): boolean {
  return process.env.SIFALO_DIRECT_CHARGE === 'true'
}

export function isSifaloConfigured(): boolean {
  return Boolean(process.env.SIFALO_API_USER && process.env.SIFALO_API_KEY)
}

/**
 * Sifalo's own checkout field asks for the plain local wallet number ("Enter your EVC,
 * ZAAD or SAHAL number"), but our donate form invited "+252 61 555 1234" and we passed it
 * through verbatim — plus sign and all. Strip to digits and drop a leading 252 country
 * code so the gateway receives the format it actually expects.
 */
export function normaliseAccount(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('252') && digits.length > 9 ? digits.slice(3) : digits
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
        account: normaliseAccount(input.account),
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

  // Sifalo answers 200 with an EMPTY body when it cannot route the request at all
  // (observed against the live gateway). That is not a declined payment — it is no
  // answer, so the outcome is unknown and the donation must stay pending.
  const raw = (await response.text()).trim()
  if (raw === '') throw new SifaloUnknownError('Sifalo returned an empty response')

  let data: { code?: unknown; response?: unknown; sid?: unknown; txn_id?: unknown }
  try {
    data = JSON.parse(raw) as typeof data
  } catch {
    throw new SifaloUnknownError(`Sifalo returned a non-JSON response: ${raw.slice(0, 120)}`)
  }

  const code = data.code === undefined || data.code === null ? '' : String(data.code)
  const providerReference = typeof data.txn_id === 'string' && data.txn_id !== ''
    ? data.txn_id
    : typeof data.sid === 'string' && data.sid !== ''
      ? data.sid
      : input.reference

  if (code === SUCCESS_CODE) return { status: 'succeeded', providerReference, rawCode: code }

  // OUR fault, not the donor's. Verified against the live gateway: bad credentials return
  // code 0, and a malformed request returns 404 "Required parameters missing". Neither
  // means the payment was declined — nothing was ever attempted. Recording these as
  // 'failed' would tell a donor their card was refused because we misconfigured a key,
  // and would permanently mark a donation failed that never ran. Treat as unknown.
  if (SYSTEM_CODES.has(code) || !FAILURE_MESSAGES[code]) {
    throw new SifaloUnknownError(
      `Sifalo rejected the request (code ${code || 'none'}): ${typeof data.response === 'string' && data.response !== '' ? data.response : 'no detail'}`,
    )
  }

  return { status: code === '605' ? 'expired' : 'failed', providerReference, rawCode: code, message: FAILURE_MESSAGES[code] }
}

/**
 * Confirms the credentials are accepted WITHOUT initiating a charge.
 * Relies on a behaviour verified against the live gateway: valid credentials produce a
 * different response than invalid ones, so we can distinguish "keys work" from "keys
 * wrong" without moving any money.
 */
export async function pingSifalo(): Promise<{ ok: boolean; detail: string }> {
  const { baseUrl, apiUser, apiKey } = getConfig()
  const send = async (auth: string) => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
      // Deliberately unroutable account: this can never correspond to a real subscriber.
      body: JSON.stringify({ amount: '0.01', account: '000000000', gateway: 'zaad', currency: 'USD', channel: 'kindred', txn_order_id: `ping-${Date.now()}`, url: 'https://kindred.local', ip: '127.0.0.1', billing: '' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
    return (await res.text()).trim()
  }
  try {
    const good = await send(Buffer.from(`${apiUser}:${apiKey}`).toString('base64'))
    const bad = await send(Buffer.from('invalid:invalid').toString('base64'))
    if (good === bad) return { ok: false, detail: 'Sifalo treats our credentials the same as invalid ones — check SIFALO_API_USER / SIFALO_API_KEY.' }
    return { ok: true, detail: 'Credentials are recognised by Sifalo.' }
  } catch (caught) {
    return { ok: false, detail: caught instanceof Error ? caught.message : 'Could not reach Sifalo.' }
  }
}

// ─── Hosted checkout ─────────────────────────────────────────────────────────────────
// Verified against the live gateway: this merchant account returns an EMPTY body for
// every direct-charge gateway (zaad/edahab/pbwallet) but a real {key, token} for
// gateway='checkout'. Direct API charging is simply not provisioned for this account, so
// hosted checkout is the working path. Sifalo collects the wallet number and PIN on their
// own page, which also means we never handle the payer's mobile-money number at all.

const CHECKOUT_BASE = process.env.SIFALO_CHECKOUT_URL ?? 'https://pay.sifalo.com/checkout/'

export type SifaloCheckout = { checkoutUrl: string; key: string; token: string }

export async function createSifaloCheckout(input: {
  amountMinor: number
  currency: string
  reference: string
  returnUrl: string
  ip: string
  billing?: string
}): Promise<SifaloCheckout> {
  const { baseUrl, apiUser, apiKey } = getConfig()
  let response: Response
  try {
    response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${apiUser}:${apiKey}`).toString('base64')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amount: toMajorUnits(input.amountMinor),
        gateway: 'checkout',
        channel: 'kindred',
        currency: input.currency,
        return_url: input.returnUrl,
        order_id: input.reference,
        billing: input.billing ?? '',
        url: new URL(input.returnUrl).origin,
        ip: input.ip,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
  } catch (caught) {
    throw new SifaloUnknownError(caught instanceof Error ? caught.message : 'Sifalo request failed')
  }

  const raw = (await response.text()).trim()
  if (!response.ok) throw new SifaloUnknownError(`Sifalo returned HTTP ${response.status}`)
  if (raw === '') throw new SifaloUnknownError('Sifalo returned an empty response for the checkout session')

  let data: { key?: unknown; token?: unknown; code?: unknown; response?: unknown }
  try { data = JSON.parse(raw) as typeof data } catch {
    throw new SifaloUnknownError(`Sifalo returned a non-JSON response: ${raw.slice(0, 120)}`)
  }
  if (typeof data.key !== 'string' || typeof data.token !== 'string') {
    throw new SifaloUnknownError(`Sifalo did not return a checkout session: ${raw.slice(0, 160)}`)
  }

  // key and token arrive already percent-encoded, so they go into the query string as-is.
  return {
    key: data.key,
    token: data.token,
    checkoutUrl: `${CHECKOUT_BASE}?key=${data.key}&token=${data.token}`,
  }
}

export type SifaloVerification = {
  status: SifaloStatus
  rawCode: string
  amountMinor: number | null
  account: string | null
}

/**
 * The authoritative result of a hosted-checkout payment, looked up by the `sid` Sifalo
 * appends to our return_url. This is what makes the redirect flow safe: the browser can
 * claim anything, so we ask Sifalo directly and never trust the query string.
 */
export async function verifySifaloPayment(sid: string): Promise<SifaloVerification> {
  const { baseUrl } = getConfig()
  const endpoint = `${baseUrl}verify.php`
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sid }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch (caught) {
    throw new SifaloUnknownError(caught instanceof Error ? caught.message : 'Sifalo verify failed')
  }

  const raw = (await response.text()).trim()
  if (raw === '') throw new SifaloUnknownError('Sifalo verify returned an empty response')
  let data: { code?: unknown; status?: unknown; amount?: unknown; account?: unknown }
  try { data = JSON.parse(raw) as typeof data } catch {
    throw new SifaloUnknownError(`Sifalo verify returned non-JSON: ${raw.slice(0, 120)}`)
  }

  const code = data.code === undefined || data.code === null ? '' : String(data.code)
  const amountMinor = typeof data.amount === 'number' && Number.isFinite(data.amount)
    ? Math.round(data.amount * 100)
    : typeof data.amount === 'string' && /^\d+(\.\d{1,2})?$/.test(data.amount)
      ? Math.round(Number(data.amount) * 100)
      : null

  return {
    status: code === SUCCESS_CODE ? 'succeeded' : code === '605' ? 'expired' : 'failed',
    rawCode: code,
    amountMinor,
    account: typeof data.account === 'string' ? data.account : null,
  }
}
