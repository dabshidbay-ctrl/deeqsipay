// Direct Sifalo probe. Prints the EXACT request and response so a failure is diagnosable.
// Usage:  node tools/sifalo-diagnose.mjs <wallet-number> [amount] [gateway]
//   e.g.  node tools/sifalo-diagnose.mjs 615551234 0.01 waafi
// WARNING: with a REAL number this initiates a REAL charge and should prompt your phone.
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)

const [account, amount = '0.01', gateway = 'waafi'] = process.argv.slice(2)
if (!account) { console.error('Pass a wallet number: node tools/sifalo-diagnose.mjs 615551234'); process.exit(1) }

// Sifalo expects the account WITH the 252 country code (e.g. 252615551234).
const norm = account.replace(/\D/g, '')
const accountWithCode = norm.startsWith('252') ? norm : `252${norm}`
const url = env.SIFALO_API_BASE_URL ?? 'https://api.sifalopay.com/gateway/'
// Minimal payload — the ONLY format that works. Extra fields make Sifalo return an empty body.
const body = {
  account: accountWithCode, gateway, amount, currency: 'USD', order_id: `diag-${Date.now()}`,
}

console.log('user  :', env.SIFALO_API_USER ? `${env.SIFALO_API_USER.slice(0, 3)}… (${env.SIFALO_API_USER.length} chars)` : 'MISSING')
console.log('key   :', env.SIFALO_API_KEY ? `${env.SIFALO_API_KEY.slice(0, 3)}… (${env.SIFALO_API_KEY.length} chars)` : 'MISSING')
console.log('url   :', url)
console.log('sent  :', JSON.stringify(body))
console.log(account !== accountWithCode ? `note  : normalised "${account}" -> "${accountWithCode}"` : 'note  : number needed no normalisation')

const res = await fetch(url, {
  method: 'POST',
  headers: {
    authorization: `Basic ${Buffer.from(`${env.SIFALO_API_USER}:${env.SIFALO_API_KEY}`).toString('base64')}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
})
const text = await res.text()
console.log('status:', res.status, res.headers.get('content-type') ?? '')
console.log('body  :', text === '' ? '(EMPTY — Sifalo returned nothing)' : text)
