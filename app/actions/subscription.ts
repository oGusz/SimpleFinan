'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { TRIAL_DAYS } from '@/lib/plans'

const UNIQUE_VIOLATION = '23505'

/** Um teste por conta: a linha existente, mesmo expirada, faz o insert falhar. */
export async function startFreeTrial() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { error: 'Usuário não autenticado' }

  const { error } = await createAdminClient().from('subscriptions').insert({
    user_id: user.id,
    plan: 'premium',
    status: 'active',
    provider: 'trial',
    current_period_end: new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString(),
  })

  if (error?.code === UNIQUE_VIOLATION) {
    return { error: 'O teste grátis já foi usado nesta conta.' }
  }
  if (error) {
    console.error('[Assinatura] Falha ao iniciar teste grátis:', error)
    return { error: 'Não foi possível iniciar o teste agora. Tente novamente em instantes.' }
  }
  return { success: true }
}
