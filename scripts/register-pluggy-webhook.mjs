// Registra os webhooks na Pluggy com o cabeçalho secreto (o painel não permite defini-lo).
// Uso: node --env-file=.env.local scripts/register-pluggy-webhook.mjs https://seu-dominio.com

const EVENTS = [
  'item/updated',
  'item/error',
  'item/waiting_user_input',
  'item/waiting_user_action',
  'item/deleted',
]

const API_URL = process.env.PLUGGY_API_URL?.trim() || 'https://api.pluggy.ai'
const domain = process.argv[2]?.replace(/\/$/, '')
const secret = process.env.PLUGGY_WEBHOOK_SECRET?.trim()

if (!domain?.startsWith('https://')) {
  console.error('Informe o domínio público com https://')
  process.exit(1)
}
if (!secret) {
  console.error('Defina PLUGGY_WEBHOOK_SECRET no .env.local')
  process.exit(1)
}

async function request(path, init = {}, apiKey) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'X-API-KEY': apiKey } : {}) },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${data?.message ?? ''}`)
  return data
}

const { apiKey } = await request('/auth', {
  method: 'POST',
  body: JSON.stringify({
    clientId: process.env.PLUGGY_CLIENT_ID?.trim(),
    clientSecret: process.env.PLUGGY_CLIENT_SECRET?.trim(),
  }),
})

for (const event of EVENTS) {
  await request('/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      event,
      url: `${domain}/api/pluggy/webhook`,
      headers: { 'x-simplefinan-webhook-secret': secret },
    }),
  }, apiKey)
  console.log(`Registrado: ${event}`)
}
