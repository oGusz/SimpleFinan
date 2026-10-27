'use server'

import { PluggyClient } from 'pluggy-sdk'
import { createClient } from '@/lib/supabase/server'

// ─── Cliente Pluggy (servidor apenas — credenciais nunca vão ao browser) ───────
const pluggy = new PluggyClient({
  clientId: process.env.PLUGGY_CLIENT_ID!,
  clientSecret: process.env.PLUGGY_CLIENT_SECRET!,
})

// ─── Types ────────────────────────────────────────────────────────────────────
export type ItemStatus =
  | 'UPDATING'
  | 'UPDATED'
  | 'ERROR'
  | 'LOGIN_ERROR'
  | 'WAITING_USER_INPUT'

export interface ConnectedBank {
  id: string
  item_id: string
  institution_name: string
  institution_logo: string | null
  item_status: ItemStatus
  error_type: string | null
  error_message: string | null
  last_synced_at: string | null
  created_at: string
}

// ─── 1. Gerar Connect Token (por usuário, expira em 30min) ────────────────────
// Para produção: NUNCA reutilize tokens. Gere um novo a cada abertura do widget.
export async function getPluggyConnectToken(itemId?: string) {
  try {
    // Se itemId for passado, é um UPDATE (reconexão) — não uma nova conexão
    const options = itemId ? { itemId } : {}
    const data = await pluggy.createConnectToken(undefined, options)
    return { accessToken: data.accessToken }
  } catch (error) {
    console.error('[Pluggy] Erro ao gerar Connect Token:', error)
    return { error: 'Falha ao autenticar com Pluggy' }
  }
}

// ─── 2. Salvar/Atualizar item conectado no Supabase ───────────────────────────
export async function saveConnectedBank(
  itemId: string,
  institutionName: string,
  institutionLogo?: string
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuário não autenticado' }

    const { data, error } = await supabase
      .from('connected_banks')
      .upsert(
        {
          user_id: user.id,
          item_id: itemId,
          institution_name: institutionName,
          institution_logo: institutionLogo || null,
          item_status: 'UPDATING', // começa como UPDATING enquanto o webhook não confirma
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,item_id' }
      )
      .select()
      .single()

    if (error) throw error
    return { success: true, bank: data }
  } catch (error) {
    console.error('[Pluggy] Erro ao salvar banco:', error)
    return { error: 'Falha ao salvar conexão bancária' }
  }
}

// ─── 3. Pipeline completo de sincronização (chamado pelo webhook e pelo UI) ────
// Esta é a função central de produção: busca tudo e upserta no Supabase
export async function syncBankDataToSupabase(itemId: string, userId: string) {
  const supabase = await createClient()

  try {
    // Marcar como UPDATING
    await supabase
      .from('connected_banks')
      .update({ item_status: 'UPDATING' })
      .eq('user_id', userId)
      .eq('item_id', itemId)

    // ── A. Sincronizar Contas Bancárias ─────────────────────────────────────
    let syncedAccountIds: string[] = []
    try {
      const accountsRes = await pluggy.fetchAccounts(itemId)
      const accounts = accountsRes.results || []

      if (accounts.length > 0) {
        const accountRows = accounts.map((acc) => ({
          user_id: userId,
          pluggy_account_id: acc.id,
          item_id: itemId,
          name: acc.name,
          type: acc.type,
          subtype: acc.subtype,
          balance: acc.balance || 0,
          credit_limit: acc.creditData?.creditLimit || null,
          currency_code: acc.currencyCode || 'BRL',
          last_synced_at: new Date().toISOString(),
        }))

        await supabase
          .from('synced_accounts')
          .upsert(accountRows, { onConflict: 'user_id,pluggy_account_id' })

        syncedAccountIds = accounts.map((a) => a.id)
      }
    } catch (err) {
      console.error('[Pluggy] Erro ao sincronizar contas:', err)
    }

    // ── B. Sincronizar Transações (últimos 90 dias) ─────────────────────────
    let totalTransactions = 0
    for (const accountId of syncedAccountIds) {
      try {
        const txRes = await pluggy.fetchTransactions(accountId, { pageSize: 100 })
        const txs = txRes.results || []

        if (txs.length > 0) {
          const txRows = txs.map((tx) => ({
            user_id: userId,
            pluggy_transaction_id: tx.id,
            pluggy_account_id: accountId,
            item_id: itemId,
            description: tx.description || tx.descriptionRaw || 'Transação',
            amount: Math.abs(tx.amount || 0),
            type: (tx.amount || 0) < 0 ? 'debit' : 'credit',
            date: tx.date ? new Date(tx.date).toISOString().split('T')[0] : null,
            category: tx.category || 'outros',
            balance_after: tx.balance || null,
          }))

          await supabase
            .from('synced_transactions')
            .upsert(txRows, { onConflict: 'user_id,pluggy_transaction_id' })

          totalTransactions += txs.length
        }
      } catch (err) {
        console.error(`[Pluggy] Erro ao sincronizar transações da conta ${accountId}:`, err)
      }
    }

    // ── C. Sincronizar Investimentos ────────────────────────────────────────
    let totalInvestments = 0
    try {
      const invRes = await pluggy.fetchInvestments(itemId)
      const investments = invRes.results || []

      if (investments.length > 0) {
        const invRows = investments.map((inv) => ({
          user_id: userId,
          ticker: inv.code || inv.number || inv.name?.slice(0, 10).toUpperCase() || 'FUND',
          name: inv.name,
          quantity: inv.quantity || 1,
          price: inv.lastMonthRate || 0,
          avg_price: inv.amountOriginal ? inv.amountOriginal / (inv.quantity || 1) : null,
          dividend_yield: inv.lastMonthRate || 0,
          type: mapInvestmentType(inv.type),
          category: mapInvestmentType(inv.type),
        }))

        await supabase
          .from('investments')
          .upsert(invRows, { onConflict: 'user_id,ticker' })

        totalInvestments = investments.length
      }
    } catch (err) {
      console.error('[Pluggy] Erro ao sincronizar investimentos:', err)
    }

    // ── D. Marcar como UPDATED com sucesso ──────────────────────────────────
    await supabase
      .from('connected_banks')
      .update({
        item_status: 'UPDATED',
        error_type: null,
        error_message: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('item_id', itemId)

    return {
      success: true,
      summary: {
        accounts: syncedAccountIds.length,
        transactions: totalTransactions,
        investments: totalInvestments,
      },
    }
  } catch (error: any) {
    console.error('[Pluggy] Erro crítico no sync:', error)

    // Marcar como ERROR
    await supabase
      .from('connected_banks')
      .update({
        item_status: 'ERROR',
        error_message: error?.message || 'Erro desconhecido',
      })
      .eq('user_id', userId)
      .eq('item_id', itemId)

    return { error: 'Falha na sincronização' }
  }
}

// ─── 4. Listar bancos conectados do usuário autenticado ───────────────────────
export async function getConnectedBanks() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuário não autenticado', banks: [] }

    const { data, error } = await supabase
      .from('connected_banks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return { success: true, banks: (data || []) as ConnectedBank[] }
  } catch (error) {
    console.error('[Pluggy] Erro ao listar bancos:', error)
    return { error: 'Falha ao carregar bancos', banks: [] }
  }
}

// ─── 5. Desconectar banco (Pluggy + Supabase) ────────────────────────────────
export async function disconnectBank(itemId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuário não autenticado' }

    // Apagar o item no Pluggy (boa prática: não deixar conexões abertas)
    try {
      await pluggy.deleteItem(itemId)
    } catch {
      // Continua mesmo se falhar no Pluggy (item pode já ter expirado)
    }

    // Remover do Supabase (cascata apaga synced_accounts e synced_transactions via item_id)
    const { error } = await supabase
      .from('connected_banks')
      .delete()
      .eq('user_id', user.id)
      .eq('item_id', itemId)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('[Pluggy] Erro ao desconectar:', error)
    return { error: 'Falha ao desconectar banco' }
  }
}

// ─── 6. Disparar sync manual (chamado pelo botão "Sincronizar") ───────────────
export async function triggerManualSync(itemId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuário não autenticado' }

    return await syncBankDataToSupabase(itemId, user.id)
  } catch (error) {
    console.error('[Pluggy] Erro no sync manual:', error)
    return { error: 'Falha ao sincronizar' }
  }
}

// ─── 7. Buscar contas sincronizadas do usuário ────────────────────────────────
export async function getSyncedAccounts() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuário não autenticado', accounts: [] }

    const { data, error } = await supabase
      .from('synced_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('balance', { ascending: false })

    if (error) throw error
    return { success: true, accounts: data || [] }
  } catch (error) {
    console.error('[Pluggy] Erro ao buscar contas:', error)
    return { error: 'Falha ao buscar contas', accounts: [] }
  }
}

// ─── 8. Buscar transações sincronizadas ───────────────────────────────────────
export async function getSyncedTransactions(limit = 50) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuário não autenticado', transactions: [] }

    const { data, error } = await supabase
      .from('synced_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(limit)

    if (error) throw error
    return { success: true, transactions: data || [] }
  } catch (error) {
    console.error('[Pluggy] Erro ao buscar transações:', error)
    return { error: 'Falha ao buscar transações', transactions: [] }
  }
}

// ─── Helper interno ───────────────────────────────────────────────────────────
function mapInvestmentType(pluggyType: string): string {
  const map: Record<string, string> = {
    MUTUAL_FUND: 'Fundo de Investimento',
    INVESTMENT_FUND: 'Fundo de Investimento',
    EQUITY: 'Ações',
    FIXED_INCOME: 'Renda Fixa',
    ETF: 'ETF',
    REAL_ESTATE_FUND: 'FII',
  }
  return map[pluggyType] || pluggyType || 'Outros'
}
