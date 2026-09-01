/**
 * Email notifications via Resend REST API.
 * No npm package needed — uses native fetch.
 */

const RESEND_API_URL = 'https://api.resend.com'

function resendApiKey(): string {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('Missing RESEND_API_KEY environment variable')
  return key
}

function notificationEmail(): string {
  const email = process.env.NOTIFICATION_EMAIL
  if (!email) throw new Error('Missing NOTIFICATION_EMAIL environment variable')
  return email
}

interface SendEmailParams {
  subject: string
  html: string
  to?: string // defaults to NOTIFICATION_EMAIL
}

export async function sendNotificationEmail({ subject, html, to }: SendEmailParams): Promise<void> {
  const apiKey = resendApiKey()
  const recipient = to ?? notificationEmail()

  const response = await fetch(`${RESEND_API_URL}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'deeqsipay <notifications@deeqsipay.com>',
      to: [recipient],
      subject,
      html,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => 'unknown')
    console.error('[email] Failed to send notification:', response.status, body.slice(0, 500))
  }
}

/** Email templates */

export function campaignReviewEmail(campaign: { id: string; title: string; ownerEmail?: string }): { subject: string; html: string } {
  return {
    subject: `[Review needed] New campaign: ${campaign.title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #267d62;">New campaign needs review</h2>
        <p><strong>${campaign.title}</strong> has been submitted and is awaiting moderation.</p>
        <p style="margin-top: 16px;">
          <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/admin/campaigns?status=under_review"
             style="display: inline-block; padding: 10px 20px; background: #267d62; color: white; text-decoration: none; border-radius: 8px;">
            Review campaign
          </a>
        </p>
        ${campaign.ownerEmail ? `<p style="color: #71817a; font-size: 12px;">Organiser: ${campaign.ownerEmail}</p>` : ''}
      </div>
    `,
  }
}

export function payoutRequestEmail(payout: { id: string; amountMinor: number; currency: string; campaignTitle: string; ownerName?: string }): { subject: string; html: string } {
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: payout.currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(payout.amountMinor / 100)
  return {
    subject: `[Payout requested] ${amount} — ${payout.campaignTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #267d62;">Payout request</h2>
        <p><strong>${payout.campaignTitle}</strong> — <strong>${amount}</strong></p>
        ${payout.ownerName ? `<p style="color: #71817a; font-size: 12px;">Requested by: ${payout.ownerName}</p>` : ''}
        <p style="margin-top: 16px;">
          <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/admin/payouts?status=requested"
             style="display: inline-block; padding: 10px 20px; background: #267d62; color: white; text-decoration: none; border-radius: 8px;">
            Review payout
          </a>
        </p>
      </div>
    `,
  }
}