'use server'

import * as Sentry from '@sentry/nextjs'
import { revalidatePath } from 'next/cache'
import { fetchAllPages } from '@/lib/finance-insights'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MAX_CONNECTED_BANKS } from '@/lib/plans'
import { BILLS_PARTIAL, ERROR_MESSAGES, IMPORT_FAILED, itemStatusFields } from '@/lib/pluggy/errors'
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { isValidMonth } from '@/lib/validation'
import {
  deleteOrphanInvestments,
  deletePluggyItem,
  deleteSyncedItemData,
  getPluggyApiKey,
  getPluggyItem,
  pluggyRequest,
  recordImportFailure,
  refreshPluggyItem,
  syncPluggyItem,
  userHasPremium,
} from '@/lib/pluggy/server'

const PREMIUM_REQUIRED = 'A conexão com bancos faz parte do plano Premium.'
const NOT_AUTHENTICATED = 'Usuário não autenticado'
const TOO_MANY_ATTEMPTS = 'Muitas tentativas em pouco tempo. Aguarde um pouco e tente novamente.'
const BANK_NOT_FOUND = 'Banco não encontrado na sua conta.'
const NEEDS_RECONNECT = 'Este banco pede uma nova autorização. Toque em Reconectar para continuar.'

// Uma importação que falhou fica para trás mesmo que a Pluggy já esteja em dia.
const RETRY_IMPORT_ERRORS = [IMPORT_FAILED, BILLS_PARTIAL]

interface BankActionResult {
  success?: boolean
  error?: string
  accCount?: number
  invCount?: number
  txCount?: number
  itemStatus?: string
  failedBills?: number
}

export interface BankRefreshResult {
  status: 'updating' | 'needs_reconnect' | 'error'
  message?: string
}

export interface BankStatusResult {
  itemStatus: string | null
  lastSyncedAt: string | null
  errorMessage: string | null
  imported: boolean
}

async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { supabase, user: error ? null : user }
}

export async function getPluggyConnectToken(itemId?: string) {
  try {
    const { supabase, user } = await getCurrentUser()
    if (!user) return { error: NOT_AUTHENTICATED }
    if (!(await userHasPremium(user.id))) return { error: PREMIUM_REQUIRED }
    if (!(await consumeRateLimit(rateLimitKey('pluggy-connect', user.id), 20, 3600))) {
      return { error: TOO_MANY_ATTEMPTS }
    }

    if (itemId) {
      // Reconectar não cria banco novo, então o limite não se aplica; o dono, sim.
      const { data: bank, error: bankError } = await supabase
        .from('connected_banks')
        .select('id')
        .eq('item_id', itemId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (bankError) throw bankError
      if (!bank) return { error: BANK_NOT_FOUND }
    } else {
      const { count, error: countError } = await supabase
        .from('connected_banks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
      if (countError) throw countError
      if ((count ?? 0) >= MAX_CONNECTED_BANKS) {
        return { error: `Você atingiu o limite de ${MAX_CONNECTED_BANKS} bancos conectados.` }
      }
    }

    // Só com o ambiente dito explicitamente: erro de configuração não pode mostrar banco falso a cliente.
    if (!process.env.PLUGGY_ENVIRONMENT && process.env.NODE_ENV === 'production') {
      console.warn('[Pluggy] PLUGGY_ENVIRONMENT não definido: bancos de teste ficam ocultos.')
    }
    const includeSandbox = process.env.PLUGGY_ENVIRONMENT === 'sandbox'
    const apiKey = await getPluggyApiKey()
    const token = await pluggyRequest('/connect_token', apiKey, {
      method: 'POST',
      body: JSON.stringify({
        ...(itemId ? { itemId } : {}),
        options: { clientUserId: user.id },
      }),
    })

    return { accessToken: token.accessToken as string, includeSandbox }
  } catch (error) {
    console.error('[Pluggy] Falha ao criar connect token:', error)
    return { error: 'Não foi possível iniciar a conexão. Tente novamente em instantes.' }
  }
}

export async function savePluggyBank(itemId: string): Promise<BankActionResult> {
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

    // last_synced_at fica de fora: nasce nulo até a importação terminar, e reconectar
    // um banco que já existe não apaga a data dos dados que ele já tem.
    const { error } = await admin.from('connected_banks').upsert({
      user_id: user.id,
      item_id: itemId,
      provider: 'pluggy',
      institution_name: item.connector?.name || 'Instituição bancária',
      institution_logo: item.connector?.imageUrl || null,
      status: 'active',
      item_status: item.status || 'UPDATING',
    }, { onConflict: 'user_id,item_id' })
    if (error) throw error

    revalidatePath('/open-finance')
    return { success: true }
  } catch (error) {
    console.error('[Pluggy] Falha ao salvar banco:', error)
    return { error: 'Não foi possível salvar a conexão com o banco.' }
  }
}

export async function syncPluggyBankData(itemId: string): Promise<BankActionResult> {
  try {
    const { supabase, user } = await getCurrentUser()
    if (!user) return { error: NOT_AUTHENTICATED }
    if (!(await userHasPremium(user.id))) return { error: PREMIUM_REQUIRED }
    if (!(await consumeRateLimit(rateLimitKey('pluggy-sync', user.id), 30, 3600))) {
      return { error: TOO_MANY_ATTEMPTS }
    }

    // Leitura com RLS: só encontra a linha se o banco for deste usuário.
    const { data: bank, error: bankError } = await supabase
      .from('connected_banks')
      .select('id')
      .eq('item_id', itemId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (bankError) throw bankError
    if (!bank) return { error: BANK_NOT_FOUND }

    try {
      const result = await syncPluggyItem(itemId, user.id)
      revalidatePath('/open-finance')
      return { success: true, ...result }
    } catch (error) {
      await recordImportFailure(itemId)
      throw error
    }
  } catch (error) {
    console.error('[Pluggy] Falha na sincronização:', error)
    // Erro tratado aqui não chega sozinho ao Sentry, e esta foi uma falha difícil de achar.
    Sentry.captureException(error)
    return { error: 'Não foi possível sincronizar os dados do banco.' }
  }
}

/** Pede uma nova coleta no banco. O resultado chega pelo webhook ou por refreshBankStatus. */
export async function requestBankRefresh(itemId: string): Promise<BankRefreshResult> {
  try {
    const { supabase, user } = await getCurrentUser()
    if (!user) return { status: 'error', message: NOT_AUTHENTICATED }
    if (!(await userHasPremium(user.id))) return { status: 'error', message: PREMIUM_REQUIRED }
    if (!(await consumeRateLimit(rateLimitKey('pluggy-sync', user.id), 30, 3600))) {
      return { status: 'error', message: TOO_MANY_ATTEMPTS }
    }

    const { data: bank, error: bankError } = await supabase
      .from('connected_banks')
      .select('id')
      .eq('item_id', itemId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (bankError) throw bankError
    if (!bank) return { status: 'error', message: BANK_NOT_FOUND }

    const outcome = await refreshPluggyItem(itemId, await getPluggyApiKey())
    const admin = createAdminClient()

    if (outcome === 'needs_reconnect') {
      const { error } = await admin
        .from('connected_banks')
        .update({ item_status: 'WAITING_USER_INPUT', error_message: ERROR_MESSAGES.WAITING_USER_INPUT })
        .eq('item_id', itemId)
        .eq('user_id', user.id)
      if (error) throw error
      revalidatePath('/open-finance')
      return { status: 'needs_reconnect', message: NEEDS_RECONNECT }
    }

    // O aviso anterior continua até a coleta terminar: ainda não se sabe se ela vai dar certo.
    const { error } = await admin
      .from('connected_banks')
      .update({ item_status: 'UPDATING' })
      .eq('item_id', itemId)
      .eq('user_id', user.id)
    if (error) throw error

    revalidatePath('/open-finance')
    return { status: 'updating' }
  } catch (error) {
    console.error('[Pluggy] Falha ao pedir atualização:', error)
    Sentry.captureException(error)
    return { status: 'error', message: 'Não foi possível pedir a atualização ao banco. Tente de novo em instantes.' }
  }
}

/**
 * Consulta o item e importa se houver dados novos, para funcionar também quando o webhook
 * não chega. A tela chama em intervalos enquanto mostra 'Atualizando'.
 */
export async function refreshBankStatus(itemId: string): Promise<BankStatusResult> {
  const empty = { itemStatus: null, lastSyncedAt: null, imported: false }

  const { supabase, user } = await getCurrentUser()
  if (!user) return { ...empty, errorMessage: NOT_AUTHENTICATED }

  const readBank = () =>
    supabase
      .from('connected_banks')
      .select('item_status, error_type, error_message, last_synced_at')
      .eq('item_id', itemId)
      .eq('user_id', user.id)
      .maybeSingle()

  const { data: bank, error: bankError } = await readBank()
  if (bankError) {
    console.error('[Pluggy] Falha ao ler status do banco:', bankError)
    return { ...empty, errorMessage: 'Não foi possível consultar o banco agora.' }
  }
  if (!bank) return { ...empty, errorMessage: BANK_NOT_FOUND }

  const storedResult = (errorMessage: string | null = bank.error_message): BankStatusResult => ({
    itemStatus: bank.item_status,
    lastSyncedAt: bank.last_synced_at,
    errorMessage,
    imported: false,
  })

  try {
    if (!(await userHasPremium(user.id))) return storedResult()
    if (!(await consumeRateLimit(rateLimitKey('pluggy-status', user.id), 120, 3600))) return storedResult()

    const item = await getPluggyItem(itemId, await getPluggyApiKey())
    const lastUpdated = item.lastUpdatedAt ? new Date(item.lastUpdatedAt).getTime() : null
    const lastSynced = bank.last_synced_at ? new Date(bank.last_synced_at).getTime() : null
    const hasNewData = lastSynced === null || (lastUpdated !== null && lastUpdated > lastSynced)

    if (item.status === 'UPDATED' && (hasNewData || RETRY_IMPORT_ERRORS.includes(bank.error_type))) {
      try {
        await syncPluggyItem(itemId, user.id)
      } catch (importError) {
        await recordImportFailure(itemId)
        throw importError
      }
      const { data: fresh, error: freshError } = await readBank()
      if (freshError) throw freshError
      revalidatePath('/open-finance')
      return {
        itemStatus: fresh?.item_status ?? null,
        lastSyncedAt: fresh?.last_synced_at ?? null,
        errorMessage: fresh?.error_message ?? null,
        imported: true,
      }
    }

    const fields = itemStatusFields(item)
    const { error: updateError } = await createAdminClient()
      .from('connected_banks')
      .update(fields)
      .eq('item_id', itemId)
      .eq('user_id', user.id)
    if (updateError) throw updateError

    return {
      itemStatus: fields.item_status,
      lastSyncedAt: bank.last_synced_at,
      errorMessage: 'error_message' in fields ? (fields.error_message ?? null) : bank.error_message,
      imported: false,
    }
  } catch (error) {
    console.error('[Pluggy] Falha ao consultar status do banco:', error)
    Sentry.captureException(error)
    return storedResult('Não foi possível consultar o banco agora.')
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
    throw new Error('Não foi possível carregar as contas do banco.')
  }
  return data || []
}

interface SyncedTransaction {
  id: string
  description: string | null
  amount: number
  type: string | null
  date: string
  category: string | null
}

export async function getTransactions(month: number, year: number): Promise<SyncedTransaction[]> {
  if (!isValidMonth(month, year)) return []

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth) return []

  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)

  try {
    // Leitura protegida por RLS: a pessoa só recebe as próprias transações.
    return await fetchAllPages<SyncedTransaction>((from, to) =>
      supabase
        .from('synced_transactions')
        .select('id, description, amount, type, date, category')
        .eq('user_id', auth.claims.sub)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    )
  } catch (error) {
    console.error('[Pluggy] Falha ao listar transações:', error)
    throw new Error('Não foi possível carregar o extrato.')
  }
}

/** Disponível mesmo sem Premium: quem cancelou precisa poder revogar o acesso ao banco. */
export async function disconnectBank(itemId: string) {
  try {
    const { supabase, user } = await getCurrentUser()
    if (!user) return { error: NOT_AUTHENTICATED }

    const { data: bank, error: bankError } = await supabase
      .from('connected_banks')
      .select('id')
      .eq('item_id', itemId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (bankError) throw bankError
    if (!bank) return { error: BANK_NOT_FOUND }

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

    await deleteOrphanInvestments(user.id)

    revalidatePath('/open-finance')
    return { success: true }
  } catch (error) {
    console.error('[Pluggy] Falha ao desconectar banco:', error)
    return { error: 'Falha ao desconectar banco.' }
  }
}
