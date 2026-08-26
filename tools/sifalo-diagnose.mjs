// Direct Sifalo probe. Prints the EXACT request and response so a failure is diagnosable.
// Usage:  node tools/sifalo-diagnose.mjs <wallet-number> [amount] [gateway]
//   e.g.  node tools/sifalo-diagnose.mjs 615551234 0.01 zaad
// WARNING: with a REAL number this initiates a REAL charge and should prompt your phone.
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)

const [account, amount = '0.01', gateway = 'zaad'] = process.argv.slice(2)
if (!account) { console.error('Pass a wallet number: node tools/sifalo-diagnose.mjs 615551234'); process.exit(1) }

const norm = account.replace(/\D/g, '').replace(/^252(?=\d{9,})/, '')
const url = env.SIFALO_API_BASE_URL ?? 'https://api.sifalopay.com/gateway/'
const body = {
  amount, account: norm, gateway, currency: 'USD', channel: 'kindred',
  txn_order_id: `diag-${Date.now()}`, url: 'https://kindred.local', ip: '127.0.0.1', billing: '',
}

console.log('user  :', env.SIFALO_API_USER ? `${env.SIFALO_API_USER.slice(0, 3)}… (${env.SIFALO_API_USER.length} chars)` : 'MISSING')
console.log('key   :', env.SIFALO_API_KEY ? `${env.SIFALO_API_KEY.slice(0, 3)}… (${env.SIFALO_API_KEY.length} chars)` : 'MISSING')
console.log('url   :', url)
console.log('sent  :', JSON.stringify({ ...body, account: norm }))
console.log(account !== norm ? `note  : normalised "${account}" -> "${norm}"` : 'note  : number needed no normalisation')

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
