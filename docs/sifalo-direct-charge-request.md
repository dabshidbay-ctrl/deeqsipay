# Request to Sifalo: enable direct API charging

Send this to Sifalo support (or your account manager). It contains the exact evidence,
so they can check the account without a back-and-forth.

Replace `<YOUR MERCHANT NAME>` and `<YOUR API USER>` before sending. **Do not paste the
API key** — they can look it up from the API user.

---

**Subject:** Enable direct API charging (gateway: zaad / edahab / pbwallet) for API user `<YOUR API USER>`

Hello,

We are integrating Sifalo Pay into our fundraising platform for `<YOUR MERCHANT NAME>`.

**Hosted checkout works correctly.** Posting to `https://api.sifalopay.com/gateway/` with
`gateway: "checkout"` returns a valid `{key, token}` pair, and the payer completes the
payment on `https://pay.sifalo.com/checkout/`. We verified the result with
`gateway/verify.php` and it returns the expected status.

**Direct charging returns an empty response.** Using the same credentials and the same
endpoint, a direct charge returns HTTP 200 with `Content-Length: 0` and no body.

Request we send (identical in shape to the official Sifalo WooCommerce plugin):

```
POST https://api.sifalopay.com/gateway/
Authorization: Basic base64(<api_user>:<api_key>)
Content-Type: application/json

{
  "amount": "0.01",
  "account": "612018955",
  "gateway": "zaad",
  "currency": "USD",
  "channel": "wordpress",
  "txn_order_id": "test-123",
  "url": "https://our-site.example",
  "ip": "127.0.0.1",
  "billing": ""
}
```

Response: `HTTP 200`, `Content-Type: application/json`, **empty body**.

What we have already ruled out:

- **Credentials are valid.** Invalid credentials return `{"code":0,"response":null}` and no
  credentials return `{"code":"404","response":"Required parameters missing."}`. Ours
  return neither — they are recognised.
- **Not the payload.** We tried `channel` values `wordpress`, `web` and our own; amounts
  `0.01`, `1`, `1.00`; currencies `USD` and `SOS`; and account formats `612018955`,
  `252612018955`. Every combination returns an empty body.
- **Not the gateway name.** We tried `zaad`, `edahab`, `pbwallet`, `evcplus`, `evc`,
  `sahal`, `golis`, `hormuud`, `telesom`, `somtel`, `waafi`, `premier`, `mycash`,
  `salaam`, `somnet`, `direct`, `mobile`, `ussd`. All empty. Only `checkout` responds.
- **A real, active subscriber number was used** (Hormuud/EVC), not a test number.

Our questions:

1. Is direct API charging enabled for this merchant account? If not, please enable it.
2. Which `gateway` values is our account provisioned for?
3. Is there anything else required for direct charging (IP allowlisting, a separate
   API product, KYC tier, or a different endpoint)?

We would prefer the direct flow so donors get the USSD PIN prompt without leaving our
site. Hosted checkout is working in the meantime.

Thank you,
`<YOUR NAME>`

---

## When they enable it

1. Set `SIFALO_DIRECT_CHARGE=true` in `.env.local`
2. Restart the app

That is the whole change. The native flow — wallet picker, number field, USSD prompt —
is already built and wired behind that flag. Confirm with a small real donation, then
check `payment_attempts.raw_status` is `601`.

If direct charging still returns an empty body after they enable it, set the flag back to
`false` immediately: donations will otherwise sit unresolved.
