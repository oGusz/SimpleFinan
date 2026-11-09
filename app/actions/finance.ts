'use server'

import { revalidatePath } from 'next/cache'
import { actionError, actionOk, type ActionResult } from '@/lib/action-result'
import {
  addDays,
  compareMonthToDate,
  fetchAllPages,
  findNextBillPayments,
  getInvoiceStatus,
  isMissingColumnError,
  isMissingTableError,
  isSettledBill,
  monthsInRange,
  summarizeTransactions,
  todayInBrazil,
  transactionsToHistory,
} from '@/lib/finance-insights'
import { hasPremiumAccess } from '@/lib/plans'
import { buildRecurringRows, monthKey, normalizeBillTitle, type BillSkip } from '@/lib/recurring-bills'
import { createClient } from '@/lib/supabase/server'
import { isValidAmount, isValidDate, isValidMonth, MAX_TITLE_LENGTH } from '@/lib/validation'

export interface Bill {
  id: string
  title?: string
  amount: number
  due_date: string
  status: 'paid' | 'pending' | 'partial' | 'unconfirmed'
  paid_amount?: number
  category?: string
  is_recurring?: boolean
  user_id?: string
  read_only?: boolean
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

export interface OpenFinanceSummary {
  hasAccounts: boolean
  balance: number
  foreignBalances: { currency: string; total: number }[]
  income: number
  expense: number
  topCategories: { category: string; total: number; percent: number }[]
  lastSyncedAt: string | null
  comparison: { currentToDay: number; previousToDay: number; day: number } | null
}

export interface DashboardData {
  bills: Bill[]
  history: HistoricalCashFlowItem[] | null
  goals: Goal[] | null
  openFinance: OpenFinanceSummary | null
  attentionBills: Bill[]
  next30Bills: Bill[]
  failed: { history: boolean; goals: boolean; openFinance: boolean }
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

const ATTENTION_DAYS = 3
const NEXT_BILLS_DAYS = 30
const ID_CHUNK = 200
const SAVE_FAILED = 'Não foi possível salvar. Verifique a conexão e tente de novo.'
const NOT_AUTHENTICATED = 'Usuário não autenticado.'
const GOAL_WRITE_ATTEMPTS = 3

/** Filtrar pelo dono no código é a segunda barreira: o RLS sozinho já falhou em bills. */
async function getCurrentUserId(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getClaims()
  return data?.claims.sub ?? null
}

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  return { supabase, user: error ? null : user }
}

/** Falha inesperada (rede, por exemplo) também precisa voltar como resultado, nunca como exceção. */
async function guarded(label: string, run: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await run()
  } catch (error) {
    console.error(`${label}:`, error)
    return actionError(SAVE_FAILED)
  }
}

interface SeriesRow {
  id: string
  title: string | null
  due_date: string
  is_recurring: boolean | null
}

/** Compara o título em memória: o filtro do banco trataria % e _ do título como curinga. */
async function loadSeries(supabase: SupabaseClient, userId: string, title: string | null | undefined) {
  const key = normalizeBillTitle(title)
  const rows = await fetchAllPages<SeriesRow>((from, to) =>
    supabase
      .from('bills')
      .select('id, title, due_date, is_recurring')
      .eq('user_id', userId)
      .order('due_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )
  return rows.filter((row) => normalizeBillTitle(row.title) === key)
}

async function updateBillsByIds(
  supabase: SupabaseClient,
  userId: string,
  ids: string[],
  payload: Record<string, unknown>,
) {
  for (let start = 0; start < ids.length; start += ID_CHUNK) {
    const { error } = await supabase
      .from('bills')
      .update(payload)
      .eq('user_id', userId)
      .in('id', ids.slice(start, start + ID_CHUNK))
    if (error) throw error
  }
}

async function deleteBillsByIds(supabase: SupabaseClient, userId: string, ids: string[]) {
  for (let start = 0; start < ids.length; start += ID_CHUNK) {
    const { error } = await supabase
      .from('bills')
      .delete()
      .eq('user_id', userId)
      .in('id', ids.slice(start, start + ID_CHUNK))
    if (error) throw error
  }
}

function parseMonthKey(key: string) {
  const [year, month] = key.split('-').map(Number)
  return { year, month }
}

function followingMonth(key: string) {
  const { year, month } = parseMonthKey(key)
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

export async function deleteBill(id: string, scope: 'only' | 'following' = 'only'): Promise<ActionResult> {
  return guarded('Erro ao excluir conta', async () => {
    const { supabase, user } = await getAuthUser()
    if (!user) return actionError(NOT_AUTHENTICATED)

    const { data: bill, error: billError } = await supabase
      .from('bills')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (billError) throw billError
    if (!bill) return actionError('Conta não encontrada.')

    const titleKey = normalizeBillTitle(bill.title)
    const series = await loadSeries(supabase, user.id, bill.title)
    const billMonth = String(bill.due_date).slice(0, 7)

    if (!series.some((row) => row.is_recurring)) {
      await deleteBillsByIds(supabase, user.id, [id])
    } else if (scope === 'following') {
      // Desliga antes de apagar: se apagar falhar, tentar de novo ainda encontra a conta.
      const earlier = series.filter((row) => row.is_recurring && row.due_date.slice(0, 7) < billMonth)
      await updateBillsByIds(supabase, user.id, earlier.map((row) => row.id), { is_recurring: false })

      const following = series.filter(
        (row) => row.id === id || (row.is_recurring && row.due_date.slice(0, 7) >= billMonth),
      )
      await deleteBillsByIds(supabase, user.id, following.map((row) => row.id))
    } else {
      const { error: skipError } = await supabase
        .from('bill_skips')
        .upsert(
          { user_id: user.id, title_key: titleKey, month: billMonth },
          { onConflict: 'user_id,title_key,month', ignoreDuplicates: true },
        )
      if (skipError) {
        if (isMissingTableError(skipError)) return actionError('Disponível em breve. Use "Este e os próximos".')
        throw skipError
      }

      // A série só existe nas próprias linhas. Sem outra cópia, ela acabaria junto com esta,
      // e 'só este mês' viraria 'todos os meses'.
      if (!series.some((row) => row.id !== id && row.is_recurring)) {
        const { data: skipRows, error: skipsError } = await supabase
          .from('bill_skips')
          .select('month')
          .eq('user_id', user.id)
          .eq('title_key', titleKey)
        if (skipsError) throw skipsError
        const skippedMonths = new Set((skipRows ?? []).map((row) => row.month as string))

        const currentMonth = todayInBrazil().slice(0, 7)
        const next = followingMonth(billMonth)
        // Excluir uma conta antiga não pode criar uma pendência atrasada no mês seguinte a ela.
        let target = monthKey(next.year, next.month) < currentMonth ? parseMonthKey(currentMonth) : next
        // A cópia não pode ressuscitar um mês que a pessoa já tinha pulado.
        while (skippedMonths.has(monthKey(target.year, target.month))) {
          target = followingMonth(monthKey(target.year, target.month))
        }
        const [copy] = buildRecurringRows({
          recurringRows: [bill],
          existingBills: series.filter((row) => row.due_date.slice(0, 7) === monthKey(target.year, target.month)),
          skips: [],
          year: target.year,
          month: target.month,
          currentMonth,
        })
        if (copy) {
          const { error: copyError } = await supabase.from('bills').insert({ ...copy, user_id: user.id })
          if (copyError) throw copyError
        }
      }

      await deleteBillsByIds(supabase, user.id, [id])
    }

    revalidatePath('/')
    return actionOk()
  })
}

// 1. Buscar os boletos do mês selecionado, criando as cópias recorrentes que faltam
export async function getBillsByMonth(month: number, year: number): Promise<Bill[]> {
  if (!isValidMonth(month, year)) return []

  const supabase = await createClient()
  const userId = await getCurrentUserId(supabase)
  if (!userId) return []

  const target = monthKey(year, month)
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).toISOString()
  const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString()

  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .eq('user_id', userId)
    .gte('due_date', startOfMonth)
    .lte('due_date', endOfMonth)
    .order('due_date', { ascending: true })

  if (error) {
    console.error('Erro ao buscar boletos:', error)
    throw new Error('Não foi possível carregar suas contas.')
  }

  const bills = (data as Bill[]) || []
  const currentMonth = todayInBrazil().slice(0, 7)
  if (target < currentMonth) return bills

  let toInsert
  try {
    const recurringRows = await fetchAllPages<Bill>((from, to) =>
      supabase
        .from('bills')
        .select('title, amount, due_date, category')
        .eq('user_id', userId)
        .eq('is_recurring', true)
        .order('due_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    )
    if (recurringRows.length === 0) return bills

    // Sem saber o que foi pulado, gerar traria de volta uma conta que a pessoa excluiu.
    const { data: skips, error: skipsError } = await supabase
      .from('bill_skips')
      .select('title_key, month')
      .eq('user_id', userId)
      .eq('month', target)
    if (skipsError && !isMissingTableError(skipsError)) throw skipsError

    toInsert = buildRecurringRows({
      recurringRows,
      existingBills: bills,
      skips: skipsError ? [] : ((skips ?? []) as BillSkip[]),
      year,
      month,
      currentMonth,
    })
  } catch (readError) {
    console.error('Erro ao ler contas recorrentes:', readError)
    throw new Error('Não foi possível carregar suas contas.')
  }

  if (toInsert.length === 0) return bills

  const { data: created, error: insertError } = await supabase
    .from('bills')
    .insert(toInsert.map((row) => ({ ...row, user_id: userId })))
    .select('*')
  if (insertError) {
    // As contas lidas são reais; a rotina diária e a próxima abertura tentam criar de novo.
    console.error('Erro ao criar contas recorrentes:', insertError)
    return bills
  }

  return [...bills, ...((created as Bill[]) ?? [])].sort((a, b) => a.due_date.localeCompare(b.due_date))
}

// 2. Buscar o fluxo de caixa histórico REAL agrupado por mês
export async function getHistoricalCashFlow(): Promise<HistoricalCashFlowItem[]> {
  const supabase = await createClient()
  const userId = await getCurrentUserId(supabase)
  if (!userId) return []

  let bills: { amount: number; due_date: string | null }[]
  try {
    bills = await fetchAllPages((from, to) =>
      supabase
        .from('bills')
        .select('amount, due_date')
        .eq('user_id', userId)
        .order('due_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    )
  } catch (billsError) {
    console.error('Erro ao buscar histórico de contas:', billsError)
    throw new Error('Não foi possível carregar o histórico.')
  }

  const monthlyData: Record<string, { year: number; monthNum: number; expense: number; income: number }> = {}

  bills.forEach((bill) => {
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

interface InvoiceRow {
  pluggy_bill_id: string
  pluggy_account_id: string
  account_name: string | null
  due_date: string
  total_amount: number
  payments_total?: number | string | null
}

async function loadInvoices(supabase: SupabaseClient, userId: string, start: string, end: string) {
  const baseColumns = 'pluggy_bill_id, pluggy_account_id, account_name, due_date, total_amount'
  const query = (columns: string) =>
    fetchAllPages<InvoiceRow>((from, to) =>
      supabase
        .from('synced_bills')
        .select(columns)
        .eq('user_id', userId)
        .gte('due_date', start)
        .lte('due_date', end)
        .order('due_date', { ascending: true })
        .order('pluggy_bill_id', { ascending: true })
        .range(from, to),
    )

  try {
    return await query(`${baseColumns}, payments_total`)
  } catch (error) {
    // Sem a coluna, os pagamentos são desconhecidos e nextBillPayments fica nulo.
    if (isMissingColumnError(error)) return query(baseColumns)
    throw error
  }
}

/** Dados do banco no formato das telas. Retorna null se a pessoa não tiver Premium ativo. */
async function getOpenFinanceData(month: number, year: number) {
  const supabase = await createClient()
  const userId = await getCurrentUserId(supabase)
  if (!userId || !isValidMonth(month, year)) return null

  const { data: subscription, error: subscriptionError } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle()
  if (subscriptionError) throw subscriptionError
  if (!hasPremiumAccess(subscription)) return null

  const monthPrefix = monthKey(year, month)
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  const historyStart = new Date(Date.UTC(year, month - 12, 1)).toISOString().slice(0, 10)
  // A fatura seguinte é a que diz se esta foi paga.
  const lastDayOfNextMonth = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)

  const [accountsResult, banksResult, transactions, invoices] = await Promise.all([
    supabase.from('synced_accounts').select('type, balance, currency_code').eq('user_id', userId),
    supabase.from('connected_banks').select('last_synced_at').eq('user_id', userId),
    fetchAllPages<{ date: string; amount: number; type: string | null; category: string | null }>((from, to) =>
      supabase
        .from('synced_transactions')
        .select('pluggy_transaction_id, date, amount, type, category')
        .eq('user_id', userId)
        .gte('date', historyStart)
        .lte('date', lastDay)
        .order('date', { ascending: false })
        .order('pluggy_transaction_id')
        .range(from, to),
    ),
    loadInvoices(supabase, userId, `${monthPrefix}-01`, lastDayOfNextMonth),
  ])
  if (accountsResult.error) throw accountsResult.error
  if (banksResult.error) throw banksResult.error

  const datedTransactions = transactions.filter((item) => item.date)
  const summary = summarizeTransactions(
    datedTransactions.filter((item) => item.date.startsWith(monthPrefix)),
  )
  const today = todayInBrazil()
  const accounts = accountsResult.data ?? []
  // A conta de cartão guarda a dívida da fatura, que não é dinheiro disponível.
  const cashAccounts = accounts.filter((account) => account.type !== 'CREDIT')
  const isBrl = (account: { currency_code: string | null }) => !account.currency_code || account.currency_code === 'BRL'

  const foreign = new Map<string, number>()
  for (const account of cashAccounts.filter((item) => !isBrl(item))) {
    const currency = account.currency_code as string
    foreign.set(currency, (foreign.get(currency) ?? 0) + Number(account.balance || 0))
  }

  // Com vários bancos, vale a data mais antiga: o saldo somado só está em dia até ela.
  const syncDates = (banksResult.data ?? [])
    .map((bank) => bank.last_synced_at as string | null)
    .filter((value): value is string => Boolean(value))
    .sort()

  const openFinanceSummary: OpenFinanceSummary = {
    hasAccounts: accounts.length > 0,
    balance: cashAccounts
      .filter(isBrl)
      .reduce((total, account) => total + Number(account.balance || 0), 0),
    foreignBalances: [...foreign.entries()].map(([currency, total]) => ({ currency, total })),
    income: summary.income,
    expense: summary.expense,
    topCategories: summary.byCategory.slice(0, 3),
    lastSyncedAt: syncDates[0] ?? null,
    comparison: monthPrefix === today.slice(0, 7) ? compareMonthToDate(datedTransactions, today) : null,
  }

  return {
    history: transactionsToHistory(datedTransactions),
    // Faturas vêm do banco: aparecem junto das contas, mas não dá para editar nem excluir.
    invoices: invoices
      .filter((invoice) => invoice.due_date.startsWith(monthPrefix))
      .map((invoice): Bill => {
        const totalAmount = Number(invoice.total_amount)
        const nextBillPayments = findNextBillPayments(invoice, invoices)
        return {
          id: `card-${invoice.pluggy_bill_id}`,
          title: `Fatura ${invoice.account_name || 'do cartão'}`,
          amount: totalAmount,
          due_date: invoice.due_date,
          status: getInvoiceStatus({ totalAmount, dueDate: invoice.due_date, today, nextBillPayments }),
          ...(nextBillPayments ? { paid_amount: nextBillPayments } : {}),
          category: 'Cartão',
          read_only: true,
        }
      }),
    summary: openFinanceSummary,
  }
}

/** Independe do mês na tela: a conta de 28/10 não pode sumir dos alertas em 1º/11. */
async function getAttentionBills(today: string): Promise<Bill[]> {
  const supabase = await createClient()
  const userId = await getCurrentUserId(supabase)
  if (!userId) return []

  try {
    const rows = await fetchAllPages<Bill>((from, to) =>
      supabase
        .from('bills')
        .select('*')
        .eq('user_id', userId)
        .neq('status', 'paid')
        .lte('due_date', `${addDays(today, ATTENTION_DAYS)}T23:59:59`)
        .order('due_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    )
    return rows.filter((bill) => !isSettledBill(bill.status))
  } catch (error) {
    console.error('Erro ao buscar contas em atenção:', error)
    throw new Error('Não foi possível carregar suas contas.')
  }
}

// O Next executa Server Actions em fila: buscar tudo em uma só evita várias idas ao servidor.
export async function getDashboardData(
  month: number,
  year: number,
  source: 'manual' | 'open_finance' = 'manual',
): Promise<DashboardData> {
  // Em sequência e sem repetir mês: duas leituras simultâneas criariam a recorrente em dobro.
  const loaded = new Map<string, Bill[]>()
  const loadMonth = async (targetYear: number, targetMonth: number) => {
    const key = monthKey(targetYear, targetMonth)
    const cached = loaded.get(key)
    if (cached) return cached
    const rows = await getBillsByMonth(targetMonth, targetYear)
    loaded.set(key, rows)
    return rows
  }

  const today = todayInBrazil()
  const horizon = addDays(today, NEXT_BILLS_DAYS)

  const bills = await loadMonth(year, month)
  const upcoming: Bill[] = []
  for (const target of monthsInRange(today, horizon)) {
    upcoming.push(...(await loadMonth(target.year, target.month)))
  }
  const next30Bills = upcoming
    .filter((bill) => {
      const dueDate = bill.due_date.slice(0, 10)
      return String(bill.status).toLowerCase() === 'pending' && dueDate >= today && dueDate <= horizon
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  // Depois de criar as recorrentes, para enxergar também as que acabaram de nascer.
  const attentionBills = await getAttentionBills(today)

  const [historyResult, goalsResult, openFinanceResult] = await Promise.allSettled([
    getHistoricalCashFlow(),
    getGoals(),
    source === 'open_finance' ? getOpenFinanceData(month, year) : Promise.resolve(null),
  ])

  for (const result of [historyResult, goalsResult, openFinanceResult]) {
    if (result.status === 'rejected') console.error('Falha em um bloco do painel:', result.reason)
  }

  const goals = goalsResult.status === 'fulfilled' ? goalsResult.value : null
  const base = { attentionBills, next30Bills }

  if (openFinanceResult.status === 'rejected') {
    return {
      ...base,
      bills,
      // O histórico das contas teria outro significado no lugar do extrato.
      history: null,
      goals,
      openFinance: null,
      failed: { history: true, goals: goals === null, openFinance: true },
    }
  }

  const openFinance = openFinanceResult.value
  if (!openFinance) {
    const history = historyResult.status === 'fulfilled' ? historyResult.value : null
    return {
      ...base,
      bills,
      history,
      goals,
      openFinance: null,
      failed: { history: history === null, goals: goals === null, openFinance: false },
    }
  }

  return {
    ...base,
    bills: [...bills, ...openFinance.invoices].sort((a, b) => a.due_date.localeCompare(b.due_date)),
    history: openFinance.history,
    goals,
    openFinance: openFinance.summary,
    failed: { history: false, goals: goals === null, openFinance: false },
  }
}

// 4. Alternar o status entre 'paid' e 'pending'
export async function toggleBillStatus(id: string, isPaid: boolean): Promise<ActionResult> {
  return guarded('Erro ao atualizar status da conta', async () => {
    const { supabase, user } = await getAuthUser()
    if (!user) return actionError(NOT_AUTHENTICATED)

    const { error } = await supabase
      .from('bills')
      .update({ status: isPaid ? 'paid' : 'pending' })
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) throw error

    revalidatePath('/')
    return actionOk()
  })
}

// 5. Editar a conta
export async function updateBill(
  id: string,
  data: { dueDate?: string; amount?: number; title?: string; category?: string; is_recurring?: boolean },
): Promise<ActionResult> {
  return guarded('Erro ao atualizar conta', async () => {
    const { supabase, user } = await getAuthUser()
    if (!user) return actionError(NOT_AUTHENTICATED)

    if (data.dueDate !== undefined && !isValidDate(data.dueDate)) {
      return actionError('Data de vencimento inválida.')
    }
    if (data.amount !== undefined && (!isValidAmount(data.amount) || data.amount <= 0)) {
      return actionError('Valor inválido.')
    }

    const title = data.title?.trim()
    if (data.title !== undefined && (!title || title.length > MAX_TITLE_LENGTH)) {
      return actionError('Informe um nome válido para a conta.')
    }
    const category = data.category?.trim()
    if (data.category !== undefined && (!category || category.length > MAX_TITLE_LENGTH)) {
      return actionError('Categoria inválida.')
    }

    const payload: Record<string, unknown> = {}
    if (data.dueDate !== undefined) payload.due_date = data.dueDate
    if (data.amount !== undefined) payload.amount = data.amount
    if (title !== undefined) payload.title = title
    if (category !== undefined) payload.category = category
    if (data.is_recurring !== undefined) payload.is_recurring = data.is_recurring

    if (Object.keys(payload).length === 0) return actionOk()

    if (title !== undefined || data.is_recurring === false) {
      const { data: bill, error: billError } = await supabase
        .from('bills')
        .select('title, due_date')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (billError) throw billError
      if (!bill) return actionError('Conta não encontrada.')

      const series = await loadSeries(supabase, user.id, bill.title)
      const others = series.filter((row) => row.id !== id && row.is_recurring)

      if (data.is_recurring === false) {
        // Uma cópia recorrente que sobrasse faria a conta voltar no mês seguinte.
        await updateBillsByIds(supabase, user.id, others.map((row) => row.id), { is_recurring: false })
      } else if (title !== undefined && normalizeBillTitle(title) !== normalizeBillTitle(bill.title)) {
        // A série é o título: renomear só uma linha deixaria a antiga gerando a conta com o nome velho.
        // O novo nome vale deste mês em diante, e os meses anteriores ficam como foram.
        const billMonth = String(bill.due_date).slice(0, 7)
        const earlier = others.filter((row) => row.due_date.slice(0, 7) < billMonth)
        const later = others.filter((row) => row.due_date.slice(0, 7) >= billMonth)
        await updateBillsByIds(supabase, user.id, earlier.map((row) => row.id), { is_recurring: false })
        await updateBillsByIds(supabase, user.id, later.map((row) => row.id), { title })
      }
    }

    const { error } = await supabase
      .from('bills')
      .update(payload)
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) throw error

    revalidatePath('/')
    return actionOk()
  })
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
    throw new Error('Não foi possível carregar suas metas.')
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
}): Promise<ActionResult> {
  return guarded('Erro ao criar meta', async () => {
    const { supabase, user } = await getAuthUser()
    if (!user) return actionError(NOT_AUTHENTICATED)

    const title = String(goal.title ?? '').trim()
    const amounts = [goal.current_amount ?? 0, goal.monthly_contribution ?? 0]
    if (!title || title.length > MAX_TITLE_LENGTH || amounts.some((value) => !isValidAmount(value) || value < 0)) {
      return actionError('Confira o nome e os valores da meta.')
    }
    if (!isValidAmount(goal.target_amount) || goal.target_amount <= 0) {
      return actionError('Informe um valor alvo maior que zero.')
    }
    if (goal.deadline && !isValidDate(goal.deadline)) {
      return actionError('Data limite inválida.')
    }
    // Um dia de folga: quem está a oeste de Brasília ainda pode estar no dia anterior.
    if (goal.deadline && goal.deadline < addDays(todayInBrazil(), -1)) {
      return actionError('O prazo não pode ser anterior a hoje.')
    }

    const { error } = await supabase.from('goals').insert([
      {
        user_id: user.id,
        title,
        target_amount: goal.target_amount,
        current_amount: goal.current_amount || 0,
        monthly_contribution: goal.monthly_contribution || 0,
        deadline: goal.deadline || null,
        category: goal.category || 'other',
      },
    ])
    if (error) throw error

    revalidatePath('/')
    return actionOk()
  })
}

// 8. Atualizar valor acumulado na meta
export async function addFundsToGoal(id: string, additionalAmount: number): Promise<ActionResult> {
  return guarded('Erro ao atualizar saldo da meta', async () => {
    const { supabase, user } = await getAuthUser()
    if (!user) return actionError(NOT_AUTHENTICATED)

    if (!isValidAmount(additionalAmount)) return actionError('Valor inválido.')

    // Só grava se o saldo ainda for o que foi lido: dois aparelhos ao mesmo tempo não podem perder uma movimentação.
    for (let attempt = 0; attempt < GOAL_WRITE_ATTEMPTS; attempt += 1) {
      const { data: goal, error: fetchError } = await supabase
        .from('goals')
        .select('current_amount')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (fetchError) throw fetchError
      if (!goal) return actionError('Meta não encontrada.')

      const newAmount = Number(goal.current_amount || 0) + additionalAmount
      if (newAmount < 0) return actionError('O resgate é maior que o valor guardado na meta.')

      const update = supabase
        .from('goals')
        .update({ current_amount: newAmount })
        .eq('id', id)
        .eq('user_id', user.id)
      const { data: updated, error } = await (goal.current_amount === null
        ? update.is('current_amount', null)
        : update.eq('current_amount', goal.current_amount)
      ).select('id')
      if (error) throw error

      if (updated?.length) {
        revalidatePath('/')
        return actionOk()
      }
    }

    return actionError('O saldo desta meta mudou em outro aparelho. Confira e tente de novo.')
  })
}

// 9. Deletar meta
export async function deleteGoal(id: string): Promise<ActionResult> {
  return guarded('Erro ao excluir meta', async () => {
    const { supabase, user } = await getAuthUser()
    if (!user) return actionError(NOT_AUTHENTICATED)

    const { error } = await supabase.from('goals').delete().eq('id', id).eq('user_id', user.id)
    if (error) throw error

    revalidatePath('/')
    return actionOk()
  })
}
