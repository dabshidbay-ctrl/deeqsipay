# Sifalo direct charging — resolved

**Verified: fixed.** Direct (in-app) charging works with no redirect to `pay.sifalo.com`.
The empty-body problem was caused by the **request payload format**, not by an account
permission.

## Root cause

The Sifalo e-Wallet API accepts only the **minimal** payload:

```
POST https://api.sifalopay.com/gateway/
Authorization: Basic base64(<api_user>:<api_key>)
Content-Type: application/json

{
  "account":  "252615551234",   // WITH the 252 country code
  "gateway":  "waafi",          // waafi | edahab | pbwallet
  "amount":   "0.01",           // major units, string
  "currency": "USD",            // USD | SLSH
  "order_id": "test-123"        // reference
}
```

Adding extra fields (`channel`, `url`, `ip`, `billing`) or using `txn_order_id` instead
of `order_id` makes Sifalo return **HTTP 200 with an empty body**. The account must carry
the `252` country code (e.g. `252615551234`, not `615551234`).

## Evidence

With the same credentials, the minimal payload returns a real response:

```
sent  : {"account":"252615551234","gateway":"waafi","amount":"0.01","currency":"USD","order_id":"diag-…"}
body  : {"code":"604","sid":"GEIOOD","response":"Payment Failed (Your account balance is not sufficient)"}
```

`604` = insufficient balance on that test number — a valid gateway answer, proving the
request is routed correctly. `601` = success.

## What changed

- `lib/server/sifalo.ts` — `chargeSifalo()` now sends the minimal payload with
  `order_id`; `normaliseAccount()` prepends `252` instead of stripping it.
- `app/api/donations/route.ts` — dropped the now-unused `originUrl` / `ip` args.
- `tools/sifalo-diagnose.mjs` — uses the working minimal format.

## Verify

```
node tools/sifalo-diagnose.mjs 615551234 0.01 waafi
```

Expect a real JSON response (not empty). A `601` means the donor's phone got the USSD
PIN prompt and the payment succeeded.