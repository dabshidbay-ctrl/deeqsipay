# Payout & correction runbook

Money leaves Kindred by hand. Sifalo's gateway API charges donors but has no disbursement
endpoint and no refund endpoint, so both directions end with a person in the Sifalo
merchant portal. This file is how that person does it without losing money or the audit
trail.

The public promise is [/how-payouts-work](../app/how-payouts-work/page.tsx). **If you
change a timing here, change it there too.**

Kindred does not offer refunds. Donations are gifts to a cause and are not returned on
request; there is no donor-facing refund form and no refund queue. What remains below under
Corrections is an error-correction tool for fraud and payment faults, not a policy a donor
can invoke.

---

## Who

| Role | May |
|---|---|
| `moderator` | Read every queue. Decide nothing. |
| `admin` | Verify payout accounts, approve/reject payouts, mark them paid, record corrections. |
| Sifalo portal operator | Actually move the money. Must also be an `admin` here, or the two records drift. |

Roles live in `profiles.role` and are only settable in SQL (see `supabase/seed/make-admin.sql`).
There is no UI for granting admin, deliberately.

**Two-person rule for anything above 500 USD equivalent.** The admin who approves must not
be the one who marks it paid. The schema keeps `reviewed_by` and `paid_by` as separate
columns precisely so this is checkable after the fact.

---

## Payout SLA

| Step | Target | Hard limit |
|---|---|---|
| Verify a new payout account | 6 hours | 12 |
| Decide a payout request | 6 hours | 12 |
| Send an approved payout | 3 working days | 7 |
| **Request → money received** | **5 working days** | **10** |

Anything past the hard limit is escalated and answered the same working day. If a review
exceeds 12 hours, the organiser is notified with an explanation of what is holding it up
and when to expect a decision.

---

## Daily payout run

1. Open `/admin/payouts?status=requested`.
2. For each request, check:
   - The campaign is `active` or `completed` — never `under_review`, `hidden` or `removed`.
   - `identity_verified_at` is set on the campaign.
   - The destination account name matches the name on the identity document.
   - The amount is at or below the available balance shown. If the UI and your arithmetic
     disagree, stop and raise it — do not approve the difference.
3. Approve or reject. **A rejection needs a note; the organiser is shown what it says.**
4. For each approved payout, in the Sifalo merchant portal, send the amount to the
   destination wallet and number shown on the payout — never to a number from an email, a
   chat message, or a phone call, even one that looks like it came from the organiser. The
   destination on the payout row is immutable by trigger for exactly this reason.
5. Back in `/admin/payouts?status=approved`, mark it paid with the Sifalo transfer
   reference. This writes the negative ledger entry. **A payout that is sent but not marked
   paid leaves the campaign's available balance overstated, and the organiser can request
   the same money again.** Never end a session with a sent-but-unmarked payout.

### If a transfer fails in the portal

Do not mark it paid. Leave it `approved`, note what happened, retry the transfer. If it
cannot be sent at all, reject it with a note so the balance returns to the organiser.

---

## Corrections (break-glass)

**This is not a refund policy.** Kindred does not return donations on request, and nothing
in the product invites a donor to ask. This procedure exists for the cases where the money
should never have been taken at all:

- a double charge or a wrong amount caused by a payment fault;
- unauthorised use of someone's account or phone;
- a campaign removed for breaking the rules before its money was paid out.

Anything else — a donor who changed their mind, a campaign that missed its goal, a donor
unhappy with how a cause spent the money — is declined. Point them at the cause, not at a
reversal.

Sifalo has no refund API, so returning money is a fresh transfer from the merchant account,
recorded afterwards.

1. Establish which of the three cases above applies, and write it down. A correction with no
   stated cause is indistinguishable from staff quietly moving money.
2. **Check the campaign balance first.** `refund_donation()` reduces `raised_minor`, and
   `campaign_available_minor()` is clamped at zero — so reversing money that has already
   been paid out to the organiser leaves the platform short, not the campaign. Doing it in
   that situation is a decision to absorb the loss; it needs the same second admin as a
   large payout.
3. Send the money back in the Sifalo portal, to the account that paid.
4. Only then record it, from `/admin/transactions` as an `admin`. This writes the negative
   ledger entry and flips the donation to `refunded` in one transaction. The note is
   mandatory and permanent — it is the audit trail for why this happened.

The ledger keeps `refunded` as a donation status and `refund` as an entry kind. That
vocabulary stays regardless of policy: it is how past reversals remain readable, and
`ledger_entries` is append-only, so history cannot be rewritten to pretend otherwise.

---

## The pending-donation queue

`GET/POST /api/cron/reconcile-donations` runs every 15 minutes (see `vercel.json`) and
**cannot confirm anything** — Sifalo is synchronous with no status lookup, so a donation is
only ever left `pending` when our request timed out and the true outcome is unknowable.

The job reports `needsManualSettlement`. Those donations need a human:

1. Find the donation id in the Sifalo merchant portal by `order_id`.
2. If Sifalo shows it succeeded, credit it — the donor paid and the campaign is short.
3. If Sifalo has no record, leave it; the job expires it after 7 days.
4. Never guess. Either guess is wrong half the time, and one of them credits money that
   never arrived.

Run it by hand with:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/reconcile-donations
```

---

## Escalation

| Situation | Action |
|---|---|
| Ledger disagrees with `raised_minor` | Stop all payouts on that campaign. Do not "correct" a counter by hand — every legitimate move goes through a function. |
| A payout was sent to the wrong number | Record it against the payout anyway, then pursue recovery manually. Never delete or edit the payout row. |
| An organiser asks to change the destination mid-request | Reject the request. They cancel, update the account, get it re-verified, and request again. The destination snapshot is immutable by design. |
| Suspected fraud | Set the campaign to `hidden`, freeze payouts, keep the donations. Removal without review destroys the evidence. |
