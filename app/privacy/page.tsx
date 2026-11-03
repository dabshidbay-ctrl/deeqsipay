import type { Metadata } from 'next'
import { PageFrame } from '@/components/kindred-shell'

export const metadata: Metadata = {
  title: 'Privacy policy · DeeqsiPay',
  description: 'What DeeqsiPay collects, who it is shared with, how long it is kept, and how to have it removed.',
}

/**
 * A promise about the data this codebase actually handles, so every claim here has to
 * stay true of the code:
 *  - phone numbers: full number to Sifalo, only phone_last4 stored (app/api/donations/route.ts)
 *  - identity documents: private bucket, no SELECT policy (0003_campaign_verification.sql)
 *  - guest donations: guest_name/guest_contact optional, never public (0006_guest_donations.sql)
 *  - error reports: scrubbed before leaving the server (lib/sentry-scrub.ts)
 * Change any of those and this page must change with them.
 */
export default function PrivacyPage() {
  return <PageFrame eyebrow="privacy">
    <section className="px-5 pb-2 pt-8">
      <h1 className="font-serif text-[30px] font-semibold leading-tight tracking-[-0.02em]">Privacy policy</h1>
      <p className="mt-2 text-xs text-muted-foreground">Last updated 29 August 2026</p>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        DeeqsiPay handles money and, for organisers, identity documents. This page says plainly what we
        collect, who else sees it, how long we keep it, and what you can ask us to do with it. If
        anything here is unclear, write to{' '}
        <a href="mailto:hello@deeqsipay.com" className="font-medium text-foreground underline">hello@deeqsipay.com</a>.
      </p>

      <div className="mt-7 space-y-4 text-sm leading-7">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="font-bold">What we collect</p>
          <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-muted-foreground">
            <li><strong className="text-foreground">If you make an account:</strong> your email address, and the display name and photo you choose.</li>
            <li><strong className="text-foreground">If you donate:</strong> the amount, the fundraiser, and the mobile money number you pay from. You do not need an account to give.</li>
            <li><strong className="text-foreground">If you run a fundraiser:</strong> your story and photo, at least two contact numbers, an identity document, and — before a payout — the account the money should go to.</li>
            <li><strong className="text-foreground">Automatically:</strong> the ordinary technical records a website keeps, such as request logs and error reports.</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="font-bold">Your phone number</p>
          <p className="mt-1.5 text-muted-foreground">
            The number you type on the donation form is sent to our payment provider so it can push the
            PIN prompt to your handset. We keep only the{' '}
            <strong className="text-foreground">last four digits</strong> against the payment, which is
            enough to trace a disputed charge and not enough to identify you to anyone else. The full
            number is never stored on DeeqsiPay.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="font-bold">What is public</p>
          <p className="mt-1.5 text-muted-foreground">
            A fundraiser&apos;s title, story, photo, category, goal and total raised are public, along with
            the organiser&apos;s display name. Donations show an amount and a first name; choose{' '}
            <strong className="text-foreground">anonymous</strong> when you give and the public page shows
            &ldquo;Anonymous&rdquo; instead of your name — but the organiser still sees your name. Donor contact
            details are never shown publicly, and neither is your email address.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="font-bold">Identity documents</p>
          <p className="mt-1.5 text-muted-foreground">
            An organiser&apos;s ID is uploaded to private storage that has no public link and cannot be read
            back by any account, including the organiser&apos;s own. Only staff reviewing that fundraiser can
            open it, and only to confirm the person asking for money is who they say they are. We do not
            share it with donors, and we delete it once the fundraiser is closed and paid out.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="font-bold">Who else sees your data</p>
          <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-muted-foreground">
            <li><strong className="text-foreground">Our payment provider,</strong> to take the payment and send payouts.</li>
            <li><strong className="text-foreground">Our hosting and database providers,</strong> which store the site and its records.</li>
            <li><strong className="text-foreground">Our error tracker,</strong> which receives crash reports. Phone numbers, account numbers, access tokens and document paths are stripped out before a report leaves our servers.</li>
            <li><strong className="text-foreground">The organiser you gave to,</strong> who sees the amount, the date, and your name — anonymous donations show &ldquo;Anonymous&rdquo; on the public page, but the organiser still sees your name.</li>
          </ul>
          <p className="mt-2.5 text-muted-foreground">
            We do not sell your data, and we do not share it for advertising.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="font-bold">How long we keep it</p>
          <p className="mt-1.5 text-muted-foreground">
            Donation and payout records are financial records: we keep them for as long as the law
            requires, even after an account is closed, because a ledger with holes in it cannot be
            audited. Everything else — your profile, saved fundraisers, notifications — is deleted with
            your account.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="font-bold">What you can ask for</p>
          <p className="mt-1.5 text-muted-foreground">
            You can ask for a copy of your data, ask us to correct it, or ask us to delete your account.
            Email{' '}
            <a href="mailto:hello@deeqsipay.com" className="font-medium text-foreground underline">hello@deeqsipay.com</a>{' '}
            from the address on the account and we will answer within{' '}
            <strong className="text-foreground">30 days</strong>. If you donated as a guest, tell us the
            fundraiser, the date and the last four digits of the number you paid from so we can find the
            record. Deletion cannot remove the financial records described above.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="font-bold">Changes to this policy</p>
          <p className="mt-1.5 text-muted-foreground">
            If we change what we collect or who we share it with, we will update this page and the date
            at the top of it.
          </p>
        </div>
      </div>
    </section>
  </PageFrame>
}
