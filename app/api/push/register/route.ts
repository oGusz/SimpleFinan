import { NextResponse } from 'next/server'
import { isMissingTableError } from '@/lib/finance-insights'
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const MAX_REQUESTS_PER_HOUR = 20
const MAX_TOKEN_LENGTH = 200
// A Expo emite os dois prefixos.
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[^\]\s]+\]$/
const PLATFORMS = ['ios', 'android']

/** Ao sair da conta: este aparelho não pode continuar recebendo os lembretes dela. */
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims.sub
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await consumeRateLimit(rateLimitKey('push-unregister', userId), MAX_REQUESTS_PER_HOUR, 3600)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json().catch(() => null)
  const token = body?.token
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH || !EXPO_TOKEN.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  const { error } = await createAdminClient().from('push_tokens').delete().eq('user_id', userId).eq('token', token)
  if (error && !isMissingTableError(error)) {
    console.error('[Push] Falha ao remover aparelho:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims.sub
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await consumeRateLimit(rateLimitKey('push-register', userId), MAX_REQUESTS_PER_HOUR, 3600)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json().catch(() => null)
  const token = body?.token
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH || !EXPO_TOKEN.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }
  const platform = PLATFORMS.includes(body?.platform) ? (body.platform as string) : null

  const admin = createAdminClient()

  // Aparelho compartilhado: quem saiu da conta não pode receber os lembretes de quem entrou.
  const { error: cleanupError } = await admin
    .from('push_tokens')
    .delete()
    .eq('token', token)
    .neq('user_id', userId)
  if (cleanupError && !isMissingTableError(cleanupError)) {
    console.error('[Push] Falha ao liberar aparelho:', cleanupError)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }

  const { error } = await admin.from('push_tokens').upsert(
    { user_id: userId, token, platform, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,token' },
  )
  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: 'Not available' }, { status: 503 })
    }
    console.error('[Push] Falha ao registrar aparelho:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
