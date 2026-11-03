'use server'

import * as Sentry from '@sentry/nextjs'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MAX_CONNECTED_BANKS } from '@/lib/plans'
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { isValidMonth } from '@/lib/validation'
import {
  deletePluggyItem,
  deleteSyncedItemData,
  getPluggyApiKey,
  getPluggyItem,
  pluggyRequest,
  syncPluggyItem,
  userHasPremium,
} from '@/lib/pluggy/server'

const PREMIUM_REQUIRED = 'A conexão com bancos faz parte do plano Premium.'
const NOT_AUTHENTICATED = 'Usuário não autenticado'
const TOO_MANY_ATTEMPTS = 'Muitas tentativas em pouco tempo. Aguarde um pouco e tente novamente.'

interface ActionResult {
  success?: boolean
  error?: string
  accCount?: number
  invCount?: number
  txCount?: number
}

async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { supabase, user: error ? null : user }
}

export async function getPluggyConnectToken() {
  try {
    const { supabase, user } = await getCurrentUser()
    if (!user) return { error: NOT_AUTHENTICATED }
    if (!(await userHasPremium(user.id))) return { error: PREMIUM_REQUIRED }
    if (!(await consumeRateLimit(rateLimitKey('pluggy-connect', user.id), 20, 3600))) {
      return { error: TOO_MANY_ATTEMPTS }
    }

    const { count } = await supabase
      .from('connected_banks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if ((count ?? 0) >= MAX_CONNECTED_BANKS) {
      return { error: `Você atingiu o limite de ${MAX_CONNECTED_BANKS} bancos conectados.` }
    }

    const includeSandbox = process.env.PLUGGY_ENVIRONMENT !== 'production'
    const apiKey = await getPluggyApiKey()
    const token = await pluggyRequest('/connect_token', apiKey, {
      method: 'POST',
      body: JSON.stringify({ options: { clientUserId: user.id } }),
    })

    return { accessToken: token.accessToken as string, includeSandbox }
  } catch (error) {
    console.error('[Pluggy] Falha ao criar connect token:', error)
    return { error: 'Não foi possível iniciar a conexão. Tente novamente em instantes.' }
  }
}

export async function savePluggyBank(itemId: string): Promise<ActionResult> {
  try {
    const { user } = await getCurrentUser()
    if (!user) return { error: NOT_AUTHENTICATED }
    if (!(await userHasPremium(user.id))) return { error: PREMIUM_REQUIRED }

    // O itemId vem do navegador: só aceita itens criados com o token deste usuário.
    const apiKey = await getPluggyApiKey()
    const item = await getPluggyItem(itemId, apiKey)
    if (item.clientUserId !== user.id) {
      console.warn(`[Pluggy] Item ${itemId} recusado: não pertence ao usuário ${user.id}`)
      return { error: 'Esta conexão não pertence à sua conta.' }
    }

    // O token de conexão pode gerar vários bancos, então o limite é conferido de novo aqui.
    const admin = createAdminClient()
    const { data: banks, error: banksError } = await admin
      .from('connected_banks')
      .select('item_id')
      .eq('user_id', user.id)
    if (banksError) throw banksError

    const alreadySaved = banks?.some((bank) => bank.item_id === itemId)
    if (!alreadySaved && (banks?.length ?? 0) >= MAX_CONNECTED_BANKS) {
      await deletePluggyItem(itemId, apiKey)
      return { error: `Você atingiu o limite de ${MAX_CONNECTED_BANKS} bancos conectados.` }
    }

    const { error } = await admin.from('connected_banks').upsert({
      user_id: user.id,
      item_id: itemId,
      provider: 'pluggy',
      institution_name: item.connector?.name || 'Instituição bancária',
      institution_logo: item.connector?.imageUrl || null,
      status: 'active',
      item_status: item.status || 'UPDATING',
      last_synced_at: new Date().toISOString(),
    }, { onConflict: 'user_id,item_id' })
    if (error) throw error

    revalidatePath('/open-finance')
    return { success: true }
  } catch (error) {
    console.error('[Pluggy] Falha ao salvar banco:', error)
    return { error: 'Não foi possível salvar a conexão com o banco.' }
  }
}

export async function syncPluggyBankData(itemId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await getCurrentUser()
    if (!user) return { error: NOT_AUTHENTICATED }
    if (!(await userHasPremium(user.id))) return { error: PREMIUM_REQUIRED }
    if (!(await consumeRateLimit(rateLimitKey('pluggy-sync', user.id), 30, 3600))) {
      return { error: TOO_MANY_ATTEMPTS }
    }

    // Leitura com RLS: só encontra a linha se o banco for deste usuário.
    const { data: bank } = await supabase
      .from('connected_banks')
      .select('id')
      .eq('item_id', itemId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!bank) return { error: 'Banco não encontrado na sua conta.' }

    const result = await syncPluggyItem(itemId, user.id)
    revalidatePath('/open-finance')
    return { success: true, ...result }
  } catch (error) {
    console.error('[Pluggy] Falha na sincronização:', error)
    // Erro tratado aqui não chega sozinho ao Sentry, e esta foi uma falha difícil de achar.
    Sentry.captureException(error)
    return { error: 'Não foi possível sincronizar os dados do banco.' }
  }
}

export async function getConnectedBanks() {
  const { supabase, user } = await getCurrentUser()
  if (!user) return { error: NOT_AUTHENTICATED, banks: [] }

  const { data, error } = await supabase
    .from('connected_banks')
    .select('id, item_id, institution_name, institution_logo, status, item_status, error_message, last_synced_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Pluggy] Falha ao listar bancos:', error)
    return { error: 'Falha ao carregar bancos', banks: [] }
  }
  return { success: true, banks: data || [] }
}

export async function getSyncedAccounts() {
  const { supabase, user } = await getCurrentUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('synced_accounts')
    .select('id, item_id, name, type, balance, credit_limit, currency_code')
    .eq('user_id', user.id)
    .order('name', { ascending: true })

  if (error) {
    console.error('[Pluggy] Falha ao listar contas:', error)
    return []
  }
  return data || []
}

export async function getTransactions(month: number, year: number) {
  if (!isValidMonth(month, year)) return []

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth) return []

  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)

  // Leitura protegida por RLS: a pessoa só recebe as próprias transações.
  const { data, error } = await supabase
    .from('synced_transactions')
    .select('id, description, amount, type, date, category')
    .eq('user_id', auth.claims.sub)
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: false })
    .limit(2000)

  if (error) {
    console.error('[Pluggy] Falha ao listar transações:', error)
    return []
  }
  return data || []
}

/** Disponível mesmo sem Premium: quem cancelou precisa poder revogar o acesso ao banco. */
export async function disconnectBank(itemId: string) {
  try {
    const { supabase, user } = await getCurrentUser()
    if (!user) return { error: NOT_AUTHENTICATED }

    const { data: bank } = await supabase
      .from('connected_banks')
      .select('id')
      .eq('item_id', itemId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!bank) return { error: 'Banco não encontrado na sua conta.' }

    // Primeiro na Pluggy: assim nunca fica um consentimento ativo sem registro local.
    await deletePluggyItem(itemId, await getPluggyApiKey())

    await deleteSyncedItemData(itemId)

    const admin = createAdminClient()
    const { error } = await admin
      .from('connected_banks')
      .delete()
      .eq('item_id', itemId)
      .eq('user_id', user.id)
    if (error) throw error

    revalidatePath('/open-finance')
    return { success: true }
  } catch (error) {
    console.error('[Pluggy] Falha ao desconectar banco:', error)
    return { error: 'Falha ao desconectar banco.' }
  }
}
