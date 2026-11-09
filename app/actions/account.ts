'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deletePluggyItem, getPluggyApiKey } from '@/lib/pluggy/server'
import { isMissingTableError } from '@/lib/finance-insights'
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'

// synced_bills fica de fora de propósito: cai por cascata, e a tabela vem de uma migração
// que pode não ter sido aplicada, o que abortaria a exclusão.
const USER_TABLES = [
  'synced_transactions',
  'synced_accounts',
  'connected_banks',
  'investments',
  'goals',
  'bills',
  'notification_log',
  'subscriptions',
]

const THIRD_PARTY_TIMEOUT_MS = 10_000

// O Supabase devolve no máximo 1000 linhas por consulta. A ordem precisa ser única para que
// a paginação não repita nem pule linhas, e investments e subscriptions não têm coluna id.
const EXPORT_TABLES: { table: string; orderBy: string[] }[] = [
  { table: 'bills', orderBy: ['id'] },
  { table: 'goals', orderBy: ['id'] },
  { table: 'investments', orderBy: ['source', 'ticker'] },
  { table: 'synced_accounts', orderBy: ['id'] },
  { table: 'synced_transactions', orderBy: ['id'] },
  { table: 'synced_bills', orderBy: ['id'] },
  { table: 'subscriptions', orderBy: ['user_id'] },
]
const EXPORT_PAGE_SIZE = 1000
const EXPORT_MAX_PER_HOUR = 5

/** Falha aqui só é registrada: não pode impedir a pessoa de excluir a conta. */
async function deleteRevenueCatSubscriber(userId: string) {
  const secret = process.env.REVENUECAT_SECRET_KEY?.trim()
  if (!secret) {
    console.warn('[Conta] REVENUECAT_SECRET_KEY ausente: cliente não excluído da RevenueCat.')
    return
  }
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(THIRD_PARTY_TIMEOUT_MS),
  })
  // 404 significa que a RevenueCat não tem mais esse cliente, que é o resultado desejado.
  if (!response.ok && response.status !== 404) {
    throw new Error(`RevenueCat retornou HTTP ${response.status}`)
  }
}

/** A API de gestão fica em us.posthog.com ou eu.posthog.com, não no host de captura. */
function posthogApiHost() {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST?.includes('eu.') ? 'https://eu.posthog.com' : 'https://us.posthog.com'
}

async function deletePosthogPerson(userId: string) {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY?.trim()
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim()
  if (!apiKey || !projectId) {
    console.warn('[Conta] Chaves do PostHog ausentes: pessoa não excluída do PostHog.')
    return
  }

  const persons = `${posthogApiHost()}/api/projects/${encodeURIComponent(projectId)}/persons`
  const headers = { Authorization: `Bearer ${apiKey}` }

  const lookup = await fetch(`${persons}/?distinct_id=${encodeURIComponent(userId)}`, {
    headers,
    signal: AbortSignal.timeout(THIRD_PARTY_TIMEOUT_MS),
  })
  if (!lookup.ok) throw new Error(`PostHog retornou HTTP ${lookup.status} na busca`)

  const body = (await lookup.json()) as { results?: { id?: string }[] }
  const personId = body.results?.[0]?.id
  // Quem nunca aceitou as métricas não tem pessoa no PostHog.
  if (!personId) return

  const removal = await fetch(
    `${persons}/${encodeURIComponent(personId)}/?delete_events=true&delete_recordings=true`,
    { method: 'DELETE', headers, signal: AbortSignal.timeout(THIRD_PARTY_TIMEOUT_MS) },
  )
  if (!removal.ok && removal.status !== 404) {
    throw new Error(`PostHog retornou HTTP ${removal.status} na exclusão`)
  }
}

async function deleteFromThirdParties(userId: string) {
  const results = await Promise.allSettled([deleteRevenueCatSubscriber(userId), deletePosthogPerson(userId)])
  for (const result of results) {
    if (result.status === 'rejected') console.error('[Conta] Falha ao excluir em fornecedor:', result.reason)
  }
}

/**
 * Exclui a conta e todos os dados (exigência da App Store, do Google Play e da LGPD).
 * Aborta se não conseguir revogar um banco, para não deixar consentimento ativo sem dono.
 */
export async function deleteAccount(confirmation: string) {
  if (String(confirmation ?? '').trim().toUpperCase() !== 'EXCLUIR') return { error: 'Confirmação inválida.' }

  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { error: 'Usuário não autenticado' }

  try {
    const admin = createAdminClient()

    const { data: banks, error: banksError } = await admin
      .from('connected_banks')
      .select('item_id')
      .eq('user_id', user.id)
    if (banksError) throw banksError

    if (banks?.length) {
      const apiKey = await getPluggyApiKey()
      for (const bank of banks) {
        await deletePluggyItem(bank.item_id, apiKey)
      }
    }

    await deleteFromThirdParties(user.id)

    const { data: avatars } = await admin.storage.from('avatars').list(user.id)
    if (avatars?.length) {
      await admin.storage.from('avatars').remove(avatars.map((file) => `${user.id}/${file.name}`))
    }

    for (const table of USER_TABLES) {
      const { error } = await admin.from(table).delete().eq('user_id', user.id)
      if (error) throw error
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteError) throw deleteError

    await supabase.auth.signOut()
    return { success: true }
  } catch (error) {
    console.error('[Conta] Falha ao excluir conta:', error)
    return { error: 'Não foi possível excluir a conta agora. Tente novamente em instantes.' }
  }
}

/** Cópia dos dados da própria conta (portabilidade da LGPD), lida com a sessão, sob o RLS. */
export async function exportMyData(): Promise<{ json: string; error?: undefined } | { error: string; json?: undefined }> {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { error: 'Usuário não autenticado' }

  const allowed = await consumeRateLimit(rateLimitKey('export-data', user.id), EXPORT_MAX_PER_HOUR, 3600)
  if (!allowed) return { error: 'Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente de novo.' }

  try {
    const tables: Record<string, unknown[]> = {}

    for (const { table, orderBy } of EXPORT_TABLES) {
      const rows: unknown[] = []
      for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
        let query = supabase.from(table).select('*').eq('user_id', user.id)
        for (const column of orderBy) query = query.order(column)
        const { data, error } = await query.range(from, from + EXPORT_PAGE_SIZE - 1)

        if (error) {
          // Tabela que ainda não existe não tem dado a exportar. Qualquer outra falha aborta:
          // uma cópia incompleta seria apresentada como se fosse tudo.
          if (isMissingTableError(error)) break
          throw error
        }
        rows.push(...(data ?? []))
        if (!data || data.length < EXPORT_PAGE_SIZE) break
      }
      tables[table] = rows
    }

    return {
      json: JSON.stringify(
        { exported_at: new Date().toISOString(), account: { id: user.id, email: user.email ?? null }, ...tables },
        null,
        2,
      ),
    }
  } catch (error) {
    console.error('[Conta] Falha ao exportar dados:', error)
    return { error: 'Não foi possível gerar a cópia dos seus dados agora. Tente de novo em instantes.' }
  }
}
