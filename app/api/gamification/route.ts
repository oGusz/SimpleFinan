import { NextResponse } from 'next/server'

import { todayInBrazil } from '@/lib/finance-insights'
import type { GamificationState } from '@/lib/gamification'
import { syncUserGamification } from '@/lib/gamification-server'
import { userHasPremium } from '@/lib/pluggy/server'
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// Rota em vez de Server Action: as ações rodam em fila e esta não pode atrasar o painel.
const MAX_SYNCS_PER_HOUR = 120

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims.sub
  if (typeof userId !== 'string') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Passou do limite: mostra o que já está gravado, sem conferir nada novo.
  const write = await consumeRateLimit(rateLimitKey('gamification', userId), MAX_SYNCS_PER_HOUR, 3600)
  // Plano fora do ar só esconde os selos ligados ao Premium.
  const isPremium = await userHasPremium(userId).catch(() => false)

  try {
    const state: GamificationState = await syncUserGamification(createAdminClient(), userId, todayInBrazil(), { isPremium, write })
    return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[Conquistas] Falha ao conferir conquistas:', error)
    return NextResponse.json({ error: 'Falha ao carregar' }, { status: 502 })
  }
}
