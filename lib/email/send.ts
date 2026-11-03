import 'server-only'

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim())
}

export function getAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  return vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000'
}

export async function sendEmail(to: string, message: { subject: string; html: string }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY?.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM?.trim(), to, ...message }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Resend retornou HTTP ${response.status}`)
}
