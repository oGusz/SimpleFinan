'use server'

import { revalidatePath } from 'next/cache'
import { getInvoiceStatus, summarizeTransactions, todayInBrazil, transactionsToHistory } from '@/lib/finance-insights'
import { hasPremiumAccess } from '@/lib/plans'
import { createClient } from '@/lib/supabase/server'
import { isValidAmount, isValidDate, isValidMonth, MAX_TITLE_LENGTH } from '@/lib/validation'

export interface Bill {
  id: string
  title?: string
  amount: number
  due_date: string
  status: 'paid' | 'pending'
  category?: string
  is_recurring?: boolean
  user_id?: string
  read_only?: boolean
}

export interface MonthlySummary {
  month: number
  year: number
  total: number
  paidTotal: number
  pendingTotal: number
  count: number
}

export interface HistoricalCashFlowItem {
  month: string
  year: number
  monthNum: number
  expense: number
  income: number
}

export interface Goal {
  id: string
  title: string
  target_amount: number
  current_amount: number
  monthly_contribution: number
  deadline?: string
  category?: string
  user_id?: string
  created_at?: string
}

/** Filtrar pelo dono no código é a segunda barreira: o RLS sozinho já falhou em bills. */
async function getCurrentUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.auth.getClaims()
  return data?.claims.sub ?? null
}

export async function deleteBill(id: string) {
  const { supabase, user } = await getAuthUser()

  const { error } = await supabase
    .from('bills')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('Erro ao excluir conta:', error)
    throw new Error(error.message || 'Falha ao excluir conta.')
  }

  revalidatePath('/')
}

// Helper interno para validar usuário autenticado
async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('Usuário não autenticado.')
  }

  return { supabase, user }
}

// 1. Buscar os boletos do mês selecionado com suporte a auto-geração de contas recorrentes
export async function getBillsByMonth(month: number, year: number): Promise<Bill[]> {
  if (!isValidMonth(month, year)) return []

  const supabase = await createClient()

  const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).toISOString()
  const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString()

  const userId = await getCurrentUserId(supabase)
  if (!userId) return []
  const user = { id: userId }

  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .eq('user_id', user.id)
    .gte('due_date', startOfMonth)
    .lte('due_date', endOfMonth)
    .order('due_date', { ascending: true })

  if (error) {
    console.error('Erro ao buscar boletos:', error)
    return []
  }

  const bills = (data as Bill[]) || []

  // Auto-propagação de contas recorrentes para o mês consultado
  {
    try {
      const { data: recurringBills } = await supabase
        .from('bills')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_recurring', true)

      if (recurringBills && recurringBills.length > 0) {
        const existingTitles = new Set(bills.map((b) => (b.title || '').trim().toLowerCase()))
        const toInsert: any[] = []
        const consultedMonth = `${year}-${String(month).padStart(2, '0')}`

        for (const rec of recurringBills) {
          const recTitle = (rec.title || '').trim().toLowerCase()
          // Abrir um mês antigo não pode criar contas de antes de a recorrência existir.
          const startedBefore = !rec.due_date || rec.due_date.slice(0, 7) <= consultedMonth
          if (startedBefore && !existingTitles.has(recTitle)) {
            existingTitles.add(recTitle)
            const origDay = rec.due_date ? parseInt(rec.due_date.split('-')[2], 10) || 10 : 10
            const maxDays = new Date(year, month, 0).getDate()
            const dayStr = String(Math.min(origDay, maxDays)).padStart(2, '0')
            const monthStr = String(month).padStart(2, '0')
            const dueDate = `${year}-${monthStr}-${dayStr}`

            toInsert.push({
              user_id: user.id,
              title: rec.title,
              amount: rec.amount,
              due_date: dueDate,
              category: rec.category || 'Outros',
              is_recurring: true,
              status: 'pending',
            })
          }
        }

        if (toInsert.length > 0) {
          const { data: created } = await supabase.from('bills').insert(toInsert).select('*')
          if (created) {
            bills.push(...(created as Bill[]))
            bills.sort((a, b) => a.due_date.localeCompare(b.due_date))
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao auto-propagar recorrentes:', e)
    }
  }

  return bills
}

// 2. Buscar o fluxo de caixa histórico REAL agrupado por mês
export async function getHistoricalCashFlow(): Promise<HistoricalCashFlowItem[]> {
  const supabase = await createClient()
  const userId = await getCurrentUserId(supabase)
  if (!userId) return []

  const { data: bills, error: billsError } = await supabase
    .from('bills')
    .select('amount, due_date, status')
    .eq('user_id', userId)

  if (billsError) {
    console.error('Erro ao buscar histórico de contas:', billsError)
    return []
  }

  const monthlyData: Record<string, { year: number; monthNum: number; expense: number; income: number }> = {}

  bills?.forEach((bill) => {
    if (!bill.due_date) return
    // Lido como texto: new Date('2026-11-01') viraria 31/10 no fuso do Brasil.
    const key = String(bill.due_date).slice(0, 7)
    const [billYear, billMonth] = key.split('-').map(Number)

    if (!monthlyData[key]) {
      monthlyData[key] = {
        year: billYear,
        monthNum: billMonth,
        expense: 0,
        income: 0,
      }
    }

    monthlyData[key].expense += Number(bill.amount || 0)
  })

  const monthsName = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

  return Object.keys(monthlyData)
    .sort()
    .map((key) => {
      const item = monthlyData[key]
      return {
        month: monthsName[item.monthNum - 1],
        year: item.year,
        monthNum: item.monthNum,
        expense: item.expense,
        income: item.income,
      }
    })
}

/** Dados do banco no formato das telas. Retorna null se a pessoa não tiver Premium ativo. */
async function getOpenFinanceData(month: number, year: number) {
  const supabase = await createClient()
  const userId = await getCurrentUserId(supabase)
  if (!userId || !isValidMonth(month, year)) return null

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle()
  if (!hasPremiumAccess(subscription)) return null

  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  const historyStart = new Date(Date.UTC(year, month - 12, 1)).toISOString().slice(0, 10)

  const [accountsResult, transactionsResult, invoicesResult] = await Promise.all([
    supabase.from('synced_accounts').select('type, balance').eq('user_id', userId),
    supabase
      .from('synced_transactions')
      .select('date, amount, type, category')
      .eq('user_id', userId)
      .gte('date', historyStart)
      .lte('date', lastDay)
      .limit(5000),
    supabase
      .from('synced_bills')
      .select('pluggy_bill_id, account_name, due_date, total_amount, has_payments')
      .eq('user_id', userId)
      .gte('due_date', `${monthPrefix}-01`)
      .lte('due_date', lastDay),
  ])

  const transactions = (transactionsResult.data ?? []).filter((item) => item.date)
  const summary = summarizeTransactions(
    transactions.filter((item) => item.date.startsWith(monthPrefix)),
  )
  const today = todayInBrazil()

  return {
    history: transactionsToHistory(transactions),
    // Faturas vêm do banco: aparecem junto das contas, mas não dá para editar nem excluir.
    invoices: (invoicesResult.data ?? []).map((invoice): Bill => ({
      id: `card-${invoice.pluggy_bill_id}`,
      title: `Fatura ${invoice.account_name || 'do cartão'}`,
      amount: Number(invoice.total_amount),
      due_date: invoice.due_date,
      status: getInvoiceStatus(invoice.has_payments, invoice.due_date, today) as Bill['status'],
      category: 'Cartão',
      read_only: true,
    })),
    summary: {
      hasAccounts: (accountsResult.data?.length ?? 0) > 0,
      // A conta de cartão guarda a dívida da fatura, que não é dinheiro disponível.
      balance: (accountsResult.data ?? [])
        .filter((account) => account.type !== 'CREDIT')
        .reduce((total, account) => total + Number(account.balance || 0), 0),
      income: summary.income,
      expense: summary.expense,
      topCategories: summary.byCategory.slice(0, 3),
    },
  }
}

// O Next executa Server Actions em fila: buscar tudo em uma só evita várias idas ao servidor.
export async function getDashboardData(
  month: number,
  year: number,
  source: 'manual' | 'open_finance' = 'manual',
) {
  const [bills, history, goals, openFinance] = await Promise.all([
    getBillsByMonth(month, year),
    getHistoricalCashFlow(),
    getGoals(),
    source === 'open_finance' ? getOpenFinanceData(month, year) : null,
  ])

  if (!openFinance) return { bills, history, goals, openFinance: null }

  return {
    bills: [...bills, ...openFinance.invoices].sort((a, b) => a.due_date.localeCompare(b.due_date)),
    history: openFinance.history,
    goals,
    openFinance: openFinance.summary,
  }
}

// 3. Buscar o resumo do mês
export async function getMonthlySummary(month: number, year: number): Promise<MonthlySummary> {
  const bills = await getBillsByMonth(month, year)

  const total = bills.reduce((acc, bill) => acc + Number(bill.amount || 0), 0)
  const paidTotal = bills
    .filter((bill) => bill.status === 'paid')
    .reduce((acc, bill) => acc + Number(bill.amount || 0), 0)
  const pendingTotal = total - paidTotal

  return {
    month,
    year,
    total,
    paidTotal,
    pendingTotal,
    count: bills.length,
  }
}

// 4. Alternar o status entre 'paid' e 'pending'
export async function toggleBillStatus(id: string, isPaid: boolean) {
  const { supabase, user } = await getAuthUser()

  const { error } = await supabase
    .from('bills')
    .update({ status: isPaid ? 'paid' : 'pending' })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    throw new Error(`Erro ao atualizar status do boleto: ${error.message}`)
  }

  revalidatePath('/')
  return { success: true }
}

// 5. Editar data e valor da conta
export async function updateBill(
  id: string,
  data: { dueDate?: string; amount?: number }
) {
  const { supabase, user } = await getAuthUser()

  if (data.dueDate !== undefined && !isValidDate(data.dueDate)) {
    throw new Error('Data de vencimento inválida.')
  }
  if (data.amount !== undefined && (!isValidAmount(data.amount) || data.amount < 0)) {
    throw new Error('Valor inválido.')
  }

  const payload: Record<string, any> = {}
  if (data.dueDate !== undefined) payload.due_date = data.dueDate
  if (data.amount !== undefined) payload.amount = data.amount

  if (Object.keys(payload).length === 0) {
    return { success: true }
  }

  const { error } = await supabase
    .from('bills')
    .update(payload)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    throw new Error(`Erro ao atualizar boleto: ${error.message}`)
  }

  revalidatePath('/')
  return { success: true }
}

// 6. Buscar todas as metas do usuário
export async function getGoals(): Promise<Goal[]> {
  const supabase = await createClient()
  const userId = await getCurrentUserId(supabase)
  if (!userId) return []

  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erro ao buscar metas:', error)
    return []
  }

  return (data as Goal[]) || []
}

// 7. Criar nova meta (com user_id para RLS)
export async function createGoal(goal: {
  title: string
  target_amount: number
  current_amount?: number
  monthly_contribution?: number
  deadline?: string
  category?: string
}) {
  const { supabase, user } = await getAuthUser()

  const title = String(goal.title ?? '').trim()
  const amounts = [goal.target_amount, goal.current_amount ?? 0, goal.monthly_contribution ?? 0]
  if (!title || title.length > MAX_TITLE_LENGTH || amounts.some((value) => !isValidAmount(value) || value < 0)) {
    throw new Error('Confira o nome e os valores da meta.')
  }
  if (goal.deadline && !isValidDate(goal.deadline)) {
    throw new Error('Data limite inválida.')
  }

  const { error } = await supabase.from('goals').insert([
    {
      user_id: user.id,
      title,
      target_amount: goal.target_amount,
      current_amount: goal.current_amount || 0,
      monthly_contribution: goal.monthly_contribution || 0,
      deadline: goal.deadline || null,
      category: goal.category || 'Outros',
    },
  ])

  if (error) {
    throw new Error(`Erro ao criar meta: ${error.message}`)
  }

  revalidatePath('/')
  return { success: true }
}

// 8. Atualizar valor acumulado na meta
export async function addFundsToGoal(id: string, additionalAmount: number) {
  const { supabase, user } = await getAuthUser()

  if (!isValidAmount(additionalAmount)) throw new Error('Valor inválido.')

  const { data: goal, error: fetchError } = await supabase
    .from('goals')
    .select('current_amount')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !goal) {
    throw new Error('Meta não encontrada.')
  }

  const newAmount = Number(goal.current_amount || 0) + additionalAmount
  if (newAmount < 0) throw new Error('O resgate é maior que o valor guardado na meta.')

  const { error } = await supabase
    .from('goals')
    .update({ current_amount: newAmount })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    throw new Error(`Erro ao atualizar saldo da meta: ${error.message}`)
  }

  revalidatePath('/')
  return { success: true }
}

// 9. Deletar meta
export async function deleteGoal(id: string) {
  const { supabase, user } = await getAuthUser()

  const { error } = await supabase.from('goals').delete().eq('id', id).eq('user_id', user.id)

  if (error) {
    throw new Error(`Erro ao deletar meta: ${error.message}`)
  }

  revalidatePath('/')
  return { success: true }
}
