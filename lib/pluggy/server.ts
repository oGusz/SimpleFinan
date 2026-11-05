import 'server-only'

import * as Sentry from '@sentry/nextjs'
import { isMissingColumnError } from '@/lib/finance-insights'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPremiumAccess } from '@/lib/plans'
import {
  BILLS_PARTIAL,
  BILLS_PARTIAL_MESSAGE,
  IMPORT_FAILED,
  IMPORT_FAILED_MESSAGE,
  itemStatusFields,
} from '@/lib/pluggy/errors'
import { nextTransactionsPath, toBillRow, toInvestmentRows, toTransactionRow } from '@/lib/pluggy/transactions'

const TABLE_NOT_FOUND = 'PGRST205'
// A rotina diária tem tempo limitado: o que passar disso fica para o dia seguinte.
const MAX_DAILY_IMPORT_RETRIES = 5

const TRANSACTION_HISTORY_DAYS = 90
const REQUEST_TIMEOUT_MS = 30_000

// Este módulo NÃO é uma Server Action de propósito: tudo que é exportado de um
// arquivo 'use server' vira um endpoint público, com argumentos escolhidos por quem chama.

const PLUGGY_API_URL = process.env.PLUGGY_API_URL?.trim() || 'https://api.pluggy.ai'

export class PluggyError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

export async function pluggyRequest(path: string, apiKey?: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (apiKey) headers.set('X-API-KEY', apiKey)

  const response = await fetch(`${PLUGGY_API_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new PluggyError(data?.message || `Pluggy retornou HTTP ${response.status}`, response.status)
  }
  return data
}

export async function getPluggyApiKey() {
  const clientId = process.env.PLUGGY_CLIENT_ID?.trim()
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    throw new Error('Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no ambiente.')
  }

  const auth = await pluggyRequest('/auth', undefined, {
    method: 'POST',
    body: JSON.stringify({ clientId, clientSecret }),
  })
  return auth.apiKey as string
}

export function getPluggyItem(itemId: string, apiKey: string) {
  return pluggyRequest(`/items/${encodeURIComponent(itemId)}`, apiKey)
}

/**
 * Pede à Pluggy uma nova coleta no banco, com as credenciais guardadas. Conector que exige MFA
 * responde 400: só a pessoa consegue continuar, abrindo a conexão de novo.
 */
export async function refreshPluggyItem(itemId: string, apiKey: string): Promise<'updating' | 'needs_reconnect'> {
  try {
    await pluggyRequest(`/items/${encodeURIComponent(itemId)}`, apiKey, {
      method: 'PATCH',
      body: JSON.stringify({}),
    })
    return 'updating'
  } catch (error) {
    if (error instanceof PluggyError && error.status === 400) return 'needs_reconnect'
    // A documentação não explica o 409: só tratamos como sucesso se o item estiver mesmo atualizando.
    if (error instanceof PluggyError && error.status === 409) {
      const item = await getPluggyItem(itemId, apiKey)
      if (item.status === 'UPDATING') return 'updating'
    }
    throw error
  }
}

/** Remove o item na Pluggy, revogando o acesso ao banco. Item já removido não é erro. */
export async function deletePluggyItem(itemId: string, apiKey: string) {
  try {
    await pluggyRequest(`/items/${encodeURIComponent(itemId)}`, apiKey, { method: 'DELETE' })
  } catch (error) {
    if (error instanceof PluggyError && error.status === 404) return
    throw error
  }
}

export async function userHasPremium(userId: string) {
  const { data, error } = await createAdminClient()
    .from('subscriptions')
    .select('plan, status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle()
  // Falha de leitura não é falta de plano: diria a um assinante para assinar.
  if (error) throw error
  return hasPremiumAccess(data)
}

async function listInvestments(itemId: string, apiKey: string) {
  const results: any[] = []
  let page = 1
  let totalPages = 1

  do {
    const response = await pluggyRequest(
      `/investments?itemId=${encodeURIComponent(itemId)}&page=${page}`,
      apiKey
    )
    results.push(...(response.results || []))
    totalPages = response.totalPages || 1
    page += 1
  } while (page <= totalPages)

  return results
}

/** Remove o que foi importado de um banco: sem o consentimento, esses dados não podem ficar. */
export async function deleteSyncedItemData(itemId: string) {
  const supabase = createAdminClient()
  for (const table of ['synced_transactions', 'synced_accounts', 'synced_bills']) {
    const { error } = await supabase.from(table).delete().eq('item_id', itemId)
    if (error && !(table === 'synced_bills' && error.code === TABLE_NOT_FOUND)) throw error
  }

  const { error: investmentsError } = await supabase
    .from('investments')
    .delete()
    .eq('source', 'open_finance')
    .eq('item_id', itemId)
  if (investmentsError && !isMissingColumnError(investmentsError)) throw investmentsError
}

/**
 * Linhas importadas antes de existir item_id não dizem de qual banco vieram. Sem banco
 * nenhum, todas podem sair. Chamar depois de remover o banco.
 */
export async function deleteOrphanInvestments(userId: string) {
  const supabase = createAdminClient()
  const { data: banks, error: banksError } = await supabase
    .from('connected_banks')
    .select('item_id')
    .eq('user_id', userId)
  if (banksError) throw banksError
  if (banks?.length) {
    await deleteLegacyInvestmentsOfRemovedBank(userId, banks.map((bank) => bank.item_id as string))
    return
  }

  const { error } = await supabase
    .from('investments')
    .delete()
    .eq('user_id', userId)
    .eq('source', 'open_finance')
    .is('item_id', null)
  if (!error) return
  if (!isMissingColumnError(error)) throw error

  // Sem a coluna, nenhuma linha tem banco de origem: todas são desse caso.
  const { error: fallbackError } = await supabase
    .from('investments')
    .delete()
    .eq('user_id', userId)
    .eq('source', 'open_finance')
  if (fallbackError) throw fallbackError
}

/**
 * Com outros bancos conectados, uma linha sem item_id pode ser de qualquer um. Reimportar os
 * investimentos deles marca o que continua existindo, e o que sobrar sem marca é do banco removido.
 * Se a lista de algum banco não for confiável, nada é apagado: a remoção do banco já terminou.
 */
async function deleteLegacyInvestmentsOfRemovedBank(userId: string, remainingItemIds: string[]) {
  const supabase = createAdminClient()
  const { count, error: countError } = await supabase
    .from('investments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'open_finance')
    .is('item_id', null)
  if (countError) {
    // Sem a coluna não há como separar as linhas de cada banco.
    if (!isMissingColumnError(countError)) throw countError
    return
  }
  if (!count) return

  try {
    const apiKey = await getPluggyApiKey()
    const items = await Promise.all(remainingItemIds.map((itemId) => getPluggyItem(itemId, apiKey)))
    // Durante a coleta a lista pode estar incompleta, e um ativo de outro banco seria apagado.
    if (items.some((item) => item.status !== 'UPDATED')) return
    for (const itemId of remainingItemIds) await syncInvestments(itemId, userId, apiKey, false)
  } catch (error) {
    console.error('[Pluggy] Falha ao separar investimentos antigos:', error)
    Sentry.captureException(error)
    return
  }

  const { error } = await supabase
    .from('investments')
    .delete()
    .eq('user_id', userId)
    .eq('source', 'open_finance')
    .is('item_id', null)
  if (error) throw error
}

/** A resposta da Pluggy pode vir em páginas; sem isso, faturas antigas ficariam de fora. */
async function listBills(accountId: string, apiKey: string) {
  const results: any[] = []
  let page = 1
  let totalPages = 1

  do {
    const response = await pluggyRequest(
      `/bills?accountId=${encodeURIComponent(accountId)}&page=${page}`,
      apiKey,
    )
    results.push(...(response.results || []))
    totalPages = response.totalPages || 1
    page += 1
  } while (page <= totalPages)

  return results
}

/** Faturas são um extra: se falharem, o extrato e os saldos continuam sendo importados. */
async function syncCardBills(accounts: any[], itemId: string, userId: string, apiKey: string) {
  const supabase = createAdminClient()
  let failed = 0

  for (const account of accounts.filter((item) => item.type === 'CREDIT')) {
    try {
      const rows = (await listBills(account.id, apiKey)).map((bill) => toBillRow(bill, account, userId, itemId))
      if (rows.length === 0) continue

      const { error } = await supabase
        .from('synced_bills')
        .upsert(rows, { onConflict: 'user_id,pluggy_bill_id' })
      if (!error) continue
      if (!isMissingColumnError(error)) throw error

      // Migração ainda não aplicada: guarda o que dá, e o status fica sem saber dos pagamentos.
      const legacyRows = rows.map(({ payments_total: _payments, finance_charges_total: _charges, ...row }) => row)
      const { error: legacyError } = await supabase
        .from('synced_bills')
        .upsert(legacyRows, { onConflict: 'user_id,pluggy_bill_id' })
      if (legacyError) throw legacyError
    } catch (error) {
      failed += 1
      console.error('[Pluggy] Falha ao importar faturas:', error)
      Sentry.captureException(error)
    }
  }
  return { failed }
}

async function syncInvestments(itemId: string, userId: string, apiKey: string, canRemoveMissing: boolean) {
  const supabase = createAdminClient()
  const investments = await listInvestments(itemId, apiKey)

  const { data: otherRows, error: otherError } = await supabase
    .from('investments')
    .select('ticker')
    .eq('user_id', userId)
    .eq('source', 'open_finance')
    .neq('item_id', itemId)
  if (otherError && !isMissingColumnError(otherError)) throw otherError

  let hasItemColumn = !otherError
  const rows = toInvestmentRows(investments, userId, {
    itemId: hasItemColumn ? itemId : undefined,
    reservedTickers: (otherRows ?? []).map((row) => row.ticker as string),
  })

  if (rows.length) {
    const { error } = await supabase
      .from('investments')
      .upsert(rows, { onConflict: 'user_id,source,ticker' })
    if (error) {
      if (!isMissingColumnError(error)) throw error
      hasItemColumn = false
      const legacyRows = rows.map(({ item_id: _itemId, ...row }) => row)
      const { error: legacyError } = await supabase
        .from('investments')
        .upsert(legacyRows, { onConflict: 'user_id,source,ticker' })
      if (legacyError) throw legacyError
    }
  }

  // Durante a coleta a lista pode estar incompleta, e aí pareceria que a pessoa vendeu o ativo.
  if (hasItemColumn && canRemoveMissing) {
    const { data: savedRows, error: savedError } = await supabase
      .from('investments')
      .select('ticker')
      .eq('user_id', userId)
      .eq('source', 'open_finance')
      .eq('item_id', itemId)
    if (savedError) throw savedError

    const returned = new Set(rows.map((row) => row.ticker))
    const missing = (savedRows ?? []).map((row) => row.ticker as string).filter((ticker) => !returned.has(ticker))
    if (missing.length) {
      const { error: removeError } = await supabase
        .from('investments')
        .delete()
        .eq('user_id', userId)
        .eq('source', 'open_finance')
        .eq('item_id', itemId)
        .in('ticker', missing)
      if (removeError) throw removeError
    }
  }

  return rows.length
}

async function listTransactions(accountId: string, dateFrom: string, apiKey: string) {
  const results: any[] = []
  let path: string | null =
    `/v2/transactions?accountId=${encodeURIComponent(accountId)}&dateFrom=${dateFrom}`

  while (path) {
    const response: any = await pluggyRequest(path, apiKey)
    results.push(...(response.results || []))
    path = nextTransactionsPath(response.next)
  }
  return results
}

/** Importação que falhou não pode deixar o banco parecendo em dia. A data antiga fica como está. */
export async function recordImportFailure(itemId: string) {
  const { error } = await createAdminClient()
    .from('connected_banks')
    .update({ item_status: 'ERROR', error_type: IMPORT_FAILED, error_message: IMPORT_FAILED_MESSAGE })
    .eq('item_id', itemId)
  if (error) console.error('[Pluggy] Falha ao registrar erro de importação:', error)
}

/**
 * Rotina diária: tenta de novo o que falhou e o que nunca terminou de importar, sem depender de
 * webhook ou de a pessoa abrir o app. Só com o item em dia na Pluggy, senão a lista viria incompleta.
 */
export async function retryFailedImports() {
  const supabase = createAdminClient()
  const columns = 'item_id, user_id'
  const [failedResult, neverResult] = await Promise.all([
    supabase
      .from('connected_banks')
      .select(columns)
      .in('error_type', [IMPORT_FAILED, BILLS_PARTIAL])
      .order('last_synced_at', { ascending: true })
      .range(0, MAX_DAILY_IMPORT_RETRIES - 1),
    supabase
      .from('connected_banks')
      .select(columns)
      .is('last_synced_at', null)
      .range(0, MAX_DAILY_IMPORT_RETRIES - 1),
  ])
  if (failedResult.error) throw failedResult.error
  if (neverResult.error) throw neverResult.error

  const byItem = new Map([...(failedResult.data ?? []), ...(neverResult.data ?? [])].map((bank) => [bank.item_id, bank]))
  const banks = [...byItem.values()].slice(0, MAX_DAILY_IMPORT_RETRIES)
  if (banks.length === 0) return { retried: 0, failed: 0 }

  const apiKey = await getPluggyApiKey()
  let retried = 0
  let failed = 0
  for (const bank of banks) {
    try {
      if (!(await userHasPremium(bank.user_id))) continue
      const item = await getPluggyItem(bank.item_id, apiKey)
      if (item.status !== 'UPDATED') continue
      retried += 1
      await syncPluggyItem(bank.item_id, bank.user_id)
    } catch (error) {
      failed += 1
      console.error('[Pluggy] Falha ao importar de novo:', error)
      Sentry.captureException(error)
      await recordImportFailure(bank.item_id)
    }
  }
  return { retried, failed }
}

/** Importa contas, investimentos e extrato. Quem chama precisa já ter validado o dono do item. */
export async function syncPluggyItem(itemId: string, userId: string) {
  const supabase = createAdminClient()
  const apiKey = await getPluggyApiKey()

  // Consulta primeiro: o resultado precisa refletir o banco, não o fato de termos lido os dados.
  const item = await getPluggyItem(itemId, apiKey)
  const itemStatus = String(item.status || 'OUTDATED')
  const dataDate: string = item.lastUpdatedAt ?? new Date().toISOString()

  const accountsResponse = await pluggyRequest(`/accounts?itemId=${encodeURIComponent(itemId)}`, apiKey)
  const accounts: any[] = accountsResponse.results || []

  if (accounts.length) {
    const accountRows = accounts.map((account) => ({
      user_id: userId,
      pluggy_account_id: account.id,
      item_id: itemId,
      name: account.name || account.number || 'Conta bancária',
      type: account.type || 'BANK',
      subtype: account.subtype || account.type || 'CHECKING_ACCOUNT',
      balance: Number(account.balance ?? 0) || 0,
      credit_limit: account.creditData?.creditLimit ? Number(account.creditData.creditLimit) : null,
      currency_code: account.currencyCode || 'BRL',
      last_synced_at: dataDate,
    }))
    const { error } = await supabase
      .from('synced_accounts')
      .upsert(accountRows, { onConflict: 'user_id,pluggy_account_id' })
    if (error) throw error
  }

  const investmentCount = await syncInvestments(itemId, userId, apiKey, itemStatus === 'UPDATED')

  const dateFrom = new Date(Date.now() - TRANSACTION_HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10)
  let transactionCount = 0
  for (const account of accounts) {
    const rows = (await listTransactions(account.id, dateFrom, apiKey))
      .map((transaction) => toTransactionRow(transaction, userId, itemId))
    transactionCount += rows.length

    // O limite de 500 por lote evita requisições grandes demais ao banco.
    for (let start = 0; start < rows.length; start += 500) {
      const { error } = await supabase
        .from('synced_transactions')
        .upsert(rows.slice(start, start + 500), { onConflict: 'user_id,pluggy_transaction_id' })
      if (error) throw error
    }
  }

  const { failed: failedBills } = await syncCardBills(accounts, itemId, userId, apiKey)

  const { error: bankError } = await supabase
    .from('connected_banks')
    .update({
      status: 'active',
      ...itemStatusFields(item),
      // Falha parcial fica visível sem esconder um erro mais grave do próprio item.
      ...(failedBills > 0 && itemStatus === 'UPDATED'
        ? { error_type: BILLS_PARTIAL, error_message: BILLS_PARTIAL_MESSAGE }
        : {}),
      last_synced_at: dataDate,
    })
    .eq('item_id', itemId)
    .eq('user_id', userId)
  if (bankError) throw bankError

  return {
    accCount: accounts.length,
    invCount: investmentCount,
    txCount: transactionCount,
    itemStatus,
    failedBills,
  }
}
