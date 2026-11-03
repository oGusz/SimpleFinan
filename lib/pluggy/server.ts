import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { hasPremiumAccess } from '@/lib/plans'
import { nextTransactionsPath, toBillRow, toInvestmentRows, toTransactionRow } from '@/lib/pluggy/transactions'

const TABLE_NOT_FOUND = 'PGRST205'

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
  const { data } = await createAdminClient()
    .from('subscriptions')
    .select('plan, status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle()
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
}

/** Faturas são um extra: se falharem, o extrato e os saldos continuam sendo importados. */
async function syncCardBills(accounts: any[], itemId: string, userId: string, apiKey: string) {
  const supabase = createAdminClient()

  for (const account of accounts.filter((item) => item.type === 'CREDIT')) {
    try {
      const response = await pluggyRequest(`/bills?accountId=${encodeURIComponent(account.id)}`, apiKey)
      const rows = (response.results || []).map((bill: any) => toBillRow(bill, account, userId, itemId))
      if (rows.length === 0) continue

      const { error } = await supabase
        .from('synced_bills')
        .upsert(rows, { onConflict: 'user_id,pluggy_bill_id' })
      if (error) throw error
    } catch (error) {
      console.error('[Pluggy] Falha ao importar faturas:', error)
    }
  }
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

/** Importa contas, investimentos e extrato. Quem chama precisa já ter validado o dono do item. */
export async function syncPluggyItem(itemId: string, userId: string) {
  const supabase = createAdminClient()
  const apiKey = await getPluggyApiKey()
  const now = new Date().toISOString()

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
      last_synced_at: now,
    }))
    const { error } = await supabase
      .from('synced_accounts')
      .upsert(accountRows, { onConflict: 'user_id,pluggy_account_id' })
    if (error) throw error
  }

  const investmentRows = toInvestmentRows(await listInvestments(itemId, apiKey), userId)
  if (investmentRows.length) {
    const { error } = await supabase
      .from('investments')
      .upsert(investmentRows, { onConflict: 'user_id,source,ticker' })
    if (error) throw error
  }

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

  await syncCardBills(accounts, itemId, userId, apiKey)

  const { error: bankError } = await supabase
    .from('connected_banks')
    .update({
      status: 'active',
      item_status: 'UPDATED',
      error_type: null,
      error_message: null,
      last_synced_at: now,
    })
    .eq('item_id', itemId)
    .eq('user_id', userId)
  if (bankError) throw bankError

  return { accCount: accounts.length, invCount: investmentRows.length, txCount: transactionCount }
}
