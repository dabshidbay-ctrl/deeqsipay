import type { Metadata } from 'next'
import { PageFrame } from '@/components/kindred-shell'

export const metadata: Metadata = {
  title: 'How payouts work · DeeqsiPay',
  description: 'When an organiser can withdraw, how long it takes, and what we check first.',
}

/**
 * The public half of the payout runbook in docs/payout-runbook.md. Both must agree: this
 * page is the promise, that file is how staff keep it. Change one, change the other.
 */
export default function HowPayoutsWorkPage() {
  return <PageFrame eyebrow="payouts">
    <section className="px-5 pb-2 pt-8">
      <h1 className="font-serif text-[30px] font-semibold leading-tight tracking-[-0.02em]">How payouts work</h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Money raised on DeeqsiPay is held until the organiser asks for it. Payouts are sent by a person,
        not a machine — so here is exactly what happens, and how long each step takes.
      </p>

      <ol className="mt-7 space-y-4 text-sm leading-7">
        <li className="rounded-2xl border border-border bg-card p-4">
          <p className="font-bold">1 · Register where the money goes</p>
          <p className="mt-1.5 text-muted-foreground">
            The organiser adds a mobile money or bank account in their name. We verify it before any
            payout can be requested — usually within <strong className="text-foreground">2 working days</strong>.
            The name on the account must match the ID given when the fundraiser was created.
          </p>
        </li>
        <li className="rounded-2xl border border-border bg-card p-4">
          <p className="font-bold">2 · Request an amount</p>
          <p className="mt-1.5 text-muted-foreground">
            An organiser may request any amount up to their available balance. A pending request holds
            that money, so it cannot be requested twice. A request can be cancelled any time before it
            is approved.
          </p>
        </li>
        <li className="rounded-2xl border border-border bg-card p-4">
          <p className="font-bold">3 · We review it</p>
          <p className="mt-1.5 text-muted-foreground">
            Payout and confirmation reviews are completed within <strong className="text-foreground">6 hours</strong>.
            If a review takes longer than <strong className="text-foreground">12 hours</strong>, we notify the
            organiser with an explanation of what is holding it up and when to expect a decision.
          </p>
        </li>
        <li className="rounded-2xl border border-border bg-card p-4">
          <p className="font-bold">4 · We send it</p>
          <p className="mt-1.5 text-muted-foreground">
            Approved payouts are sent within <strong className="text-foreground">3 working days</strong> of
            approval, and we record the transfer reference against the payout so it can be traced. Total
            time from request to money received is normally <strong className="text-foreground">5 working days</strong>,
            and never more than 10 unless we have told the organiser why.
          </p>
        </li>
      </ol>

      <div className="mt-7 rounded-2xl border border-border bg-card p-4 text-sm leading-7">
        <p className="font-bold">If a payout is late</p>
        <p className="mt-1.5 text-muted-foreground">
          Contact us with the fundraiser name and the date of the request. A payout that has passed
          10 working days is escalated and answered the same working day.
        </p>
      </div>
    </section>
  </PageFrame>
}
