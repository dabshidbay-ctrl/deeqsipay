import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chargeSifalo,
  isDirectChargeEnabled,
  isSifaloConfigured,
  isSifaloWallet,
  normaliseAccount,
  SifaloUnknownError,
} from '@/lib/server/sifalo'

/**
 * The Sifalo gateway is synchronous, has no webhook and no status-lookup endpoint, so the
 * single HTTP response IS the outcome of a real payment. Every branch of this mapping
 * either credits money or refuses to, and a wrong branch is money lost in one direction
 * or invented in the other. Hence the exhaustive table.
 *
 * The distinction under test throughout: 'failed'/'expired' mean SIFALO DECLINED — a real
 * answer about a real attempt. SifaloUnknownError means WE DO NOT KNOW, and the caller
 * must never render that as a decline.
 */

const BASE = { amountMinor: 150_00, currency: 'USD', account: '615551234', wallet: 'waafi' as const, reference: 'ref-1' }

function respondWith(body: string, status = 200) {
  const fetchMock = vi.fn(async () => new Response(body, { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.stubEnv('SIFALO_API_USER', 'user')
  vi.stubEnv('SIFALO_API_KEY', 'key')
  vi.stubEnv('SIFALO_API_BASE_URL', 'https://api.example.test/gateway/')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('normaliseAccount', () => {
  it('prepends the 252 country code Sifalo requires', () => {
    expect(normaliseAccount('615551234')).toBe('252615551234')
  })

  it('leaves an already-qualified number alone', () => {
    expect(normaliseAccount('252615551234')).toBe('252615551234')
  })

  it('strips punctuation and a leading +', () => {
    expect(normaliseAccount('+252 61-555 1234')).toBe('252615551234')
    expect(normaliseAccount('61-555 1234')).toBe('252615551234')
  })

  /**
   * Documents a real gap rather than asserting the behaviour we want. A domestic trunk
   * zero — "061 555 1234", which is how the number is normally written down locally — is
   * NOT stripped, so it becomes a 13-digit account Sifalo cannot route.
   *
   * This is currently unreachable from the donate flow: POST /api/donations validates
   * against /^\+?[1-9]\d{7,14}$/, which rejects a leading zero outright, so such a donor
   * is turned away at the form with "Enter a valid mobile money number" instead. Fixing it
   * properly means relaxing that regex AND dropping the trunk zero here, in the same
   * change — a deliberate edit to the payment path, not a drive-by.
   */
  it('does NOT yet strip a domestic trunk zero (known gap)', () => {
    expect(normaliseAccount('061 555 1234')).toBe('2520615551234')
  })
})

describe('isSifaloWallet', () => {
  it('accepts the three gateways Sifalo routes', () => {
    expect(isSifaloWallet('waafi')).toBe(true)
    expect(isSifaloWallet('edahab')).toBe(true)
    expect(isSifaloWallet('pbwallet')).toBe(true)
  })

  it('rejects anything else, including near-misses and non-strings', () => {
    expect(isSifaloWallet('WAAFI')).toBe(false)
    expect(isSifaloWallet('zaad')).toBe(false)
    expect(isSifaloWallet(undefined)).toBe(false)
    expect(isSifaloWallet({ value: 'waafi' })).toBe(false)
  })
})

describe('configuration flags', () => {
  it('reports configured only when both credentials are present', () => {
    expect(isSifaloConfigured()).toBe(true)
    vi.stubEnv('SIFALO_API_KEY', '')
    expect(isSifaloConfigured()).toBe(false)
  })

  it('treats direct charge as off unless the flag is exactly "true"', () => {
    vi.stubEnv('SIFALO_DIRECT_CHARGE', 'true')
    expect(isDirectChargeEnabled()).toBe(true)
    for (const value of ['false', 'TRUE', '1', 'yes', '']) {
      vi.stubEnv('SIFALO_DIRECT_CHARGE', value)
      expect(isDirectChargeEnabled(), `flag ${JSON.stringify(value)}`).toBe(false)
    }
  })
})

describe('chargeSifalo request', () => {
  it('sends the minimal payload — extra fields make the gateway answer with an empty body', async () => {
    const fetchMock = respondWith(JSON.stringify({ code: '601', sid: 'SID1' }))
    await chargeSifalo(BASE)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.test/gateway/')
    expect(JSON.parse(String(init.body))).toEqual({
      account: '252615551234',
      gateway: 'waafi',
      amount: '150.00',
      currency: 'USD',
      order_id: 'ref-1',
    })
  })

  it('authenticates as HTTP Basic over api_user:api_key', async () => {
    const fetchMock = respondWith(JSON.stringify({ code: '601', sid: 'SID1' }))
    await chargeSifalo(BASE)

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const header = (init.headers as Record<string, string>).authorization
    expect(header).toBe(`Basic ${Buffer.from('user:key').toString('base64')}`)
  })

  it('converts minor units to a 2-decimal major-unit string', async () => {
    const fetchMock = respondWith(JSON.stringify({ code: '601', sid: 'SID1' }))
    await chargeSifalo({ ...BASE, amountMinor: 5 })

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).amount).toBe('0.05')
  })

  it('throws rather than charging when credentials are absent', async () => {
    vi.stubEnv('SIFALO_API_USER', '')
    const fetchMock = respondWith(JSON.stringify({ code: '601' }))
    await expect(chargeSifalo(BASE)).rejects.toThrow('Sifalo is not configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('chargeSifalo outcome mapping', () => {
  it('maps 601 to succeeded', async () => {
    respondWith(JSON.stringify({ code: '601', sid: 'SID1', response: 'Success' }))
    await expect(chargeSifalo(BASE)).resolves.toMatchObject({ status: 'succeeded', rawCode: '601' })
  })

  it('accepts a numeric code, not only a string one', async () => {
    respondWith(JSON.stringify({ code: 601, sid: 'SID1' }))
    await expect(chargeSifalo(BASE)).resolves.toMatchObject({ status: 'succeeded' })
  })

  it.each([
    ['602', 'The payment did not go through. Check the number and try again.'],
    ['603', 'There was not enough balance on that account.'],
    ['604', 'That account number was not recognised.'],
    ['606', 'Mobile money is temporarily unavailable. Please try again shortly.'],
  ])('maps %s to a failed decline with a donor-readable message', async (code, message) => {
    respondWith(JSON.stringify({ code, sid: 'SID1' }))
    await expect(chargeSifalo(BASE)).resolves.toEqual({ status: 'failed', providerReference: 'SID1', rawCode: code, message })
  })

  it('maps 605 to expired rather than failed — the donor simply did not approve in time', async () => {
    respondWith(JSON.stringify({ code: '605', sid: 'SID1' }))
    await expect(chargeSifalo(BASE)).resolves.toMatchObject({ status: 'expired', rawCode: '605' })
  })
})

describe('chargeSifalo provider reference', () => {
  it('prefers txn_id', async () => {
    respondWith(JSON.stringify({ code: '601', txn_id: 'TXN1', sid: 'SID1' }))
    await expect(chargeSifalo(BASE)).resolves.toMatchObject({ providerReference: 'TXN1' })
  })

  it('falls back to sid', async () => {
    respondWith(JSON.stringify({ code: '601', sid: 'SID1' }))
    await expect(chargeSifalo(BASE)).resolves.toMatchObject({ providerReference: 'SID1' })
  })

  it('falls back to our own reference when the gateway returns neither', async () => {
    respondWith(JSON.stringify({ code: '601' }))
    await expect(chargeSifalo(BASE)).resolves.toMatchObject({ providerReference: 'ref-1' })
  })
})

describe('chargeSifalo unknown outcomes', () => {
  /**
   * These must NOT come back as a decline. Nothing here proves one, and treating them as
   * a decline tells a donor their payment was refused because a key was mistyped — or,
   * worse, writes off a charge that may actually have gone through.
   */
  it.each([['0'], ['404'], ['600']])('treats system code %s as unknown, not as a decline', async (code) => {
    respondWith(JSON.stringify({ code, response: 'nope' }))
    await expect(chargeSifalo(BASE)).rejects.toBeInstanceOf(SifaloUnknownError)
  })

  it('treats a code with no known meaning as unknown', async () => {
    respondWith(JSON.stringify({ code: '999' }))
    await expect(chargeSifalo(BASE)).rejects.toBeInstanceOf(SifaloUnknownError)
  })

  it('treats a missing code as unknown', async () => {
    respondWith(JSON.stringify({ sid: 'SID1' }))
    await expect(chargeSifalo(BASE)).rejects.toBeInstanceOf(SifaloUnknownError)
  })

  it('treats an empty 200 body as unknown — the gateway could not route the request', async () => {
    respondWith('')
    await expect(chargeSifalo(BASE)).rejects.toThrow(/empty response/i)
  })

  it('treats a non-JSON body as unknown', async () => {
    respondWith('<html>502 Bad Gateway</html>')
    await expect(chargeSifalo(BASE)).rejects.toThrow(/non-JSON/i)
  })

  it('treats a non-2xx response as unknown', async () => {
    respondWith(JSON.stringify({ code: '601' }), 503)
    await expect(chargeSifalo(BASE)).rejects.toThrow(/HTTP 503/)
  })

  it('treats a timeout as unknown — the payer may have approved before we gave up', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('The operation was aborted due to timeout') }))
    await expect(chargeSifalo(BASE)).rejects.toBeInstanceOf(SifaloUnknownError)
  })
})
