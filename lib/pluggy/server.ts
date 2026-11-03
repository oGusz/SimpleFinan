import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { hasPremiumAccess } from '@/lib/plans'
import { nextTransactionsPath, toTransactionRow } from '@/lib/pluggy/transactions'

const TRANSACTION_HISTORY_DAYS = 90

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

  const response = await fetch(`${PLUGGY_API_URL}${path}`, { ...init, headers, cache: 'no-store' })
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

function toInvestmentRows(investments: any[], userId: string) {
  const seenTickers = new Set<string>()

  return investments.map((investment) => {
    const baseTicker = String(investment.code || investment.name || investment.id)
      .trim().replace(/\s+/g, '-').toUpperCase()
    // Dois ativos com o mesmo código fariam o upsert inteiro falhar.
    const ticker = seenTickers.has(baseTicker)
      ? `${baseTicker}-${String(investment.id).slice(0, 8).toUpperCase()}`
      : baseTicker
    seenTickers.add(ticker)

    // Com cotas, `value` é o preço unitário. Sem cotas (renda fixa), a posição é o `balance`.
    const units = Number(investment.quantity) || 0
    const unitValue = Number(investment.value) || 0
    const hasUnits = units > 0 && unitValue > 0
    const quantity = hasUnits ? units : 1
    const price = hasUnits ? unitValue : Number(investment.balance ?? investment.amount ?? 0) || 0

    return {
      user_id: userId,
      ticker,
      name: investment.name || ticker,
      quantity,
      price,
      avg_price: price,
      category: investment.type || 'Investimento',
      type: investment.type || 'Investimento',
      source: 'open_finance',
      updated_at: new Date().toISOString(),
    }
  })
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
