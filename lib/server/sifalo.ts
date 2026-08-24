type PaymentInput = {
  amountMinor: number
  currency: 'USD'
  phone: string
  reference: string
  callbackUrl: string
}

export type SifaloResult = { providerReference: string; status: 'pending' | 'succeeded' }

function getConfig() {
  const baseUrl = process.env.SIFALO_API_BASE_URL
  const apiKey = process.env.SIFALO_API_KEY
  if (!baseUrl || !apiKey) throw new Error('Sifalo is not configured')
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey }
}

export async function createSifaloPayment(input: PaymentInput): Promise<SifaloResult> {
  const { baseUrl, apiKey } = getConfig()
  const response = await fetch(`${baseUrl}/payments`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'idempotency-key': input.reference },
    body: JSON.stringify({ amount: input.amountMinor / 100, currency: input.currency, phone: input.phone, reference: input.reference, callback_url: input.callbackUrl }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Sifalo request failed: ${response.status}`)
  const data = await response.json() as { id?: string; reference?: string; status?: string }
  const providerReference = data.id ?? data.reference
  if (!providerReference) throw new Error('Sifalo response missing reference')
  return { providerReference, status: data.status === 'succeeded' ? 'succeeded' : 'pending' }
}

export function verifySifaloSignature(rawBody: string, signature: string | null) {
  const secret = process.env.SIFALO_WEBHOOK_SECRET
  if (!secret || !signature) return false
  return signature === secret
}
