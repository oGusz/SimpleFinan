'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface Bill {
  id: string
  title?: string
  amount: number
  due_date: string
  status: 'paid' | 'pending'
  category?: string
  is_recurring?: boolean
  user_id?: string
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

export async function deleteBill(id: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('bills')
    .delete()
    .eq('id', id)

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
  const supabase = await createClient()

  const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).toISOString()
  const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString()

  const { data: { user } } = await supabase.auth.getUser()

  let query = supabase
    .from('bills')
    .select('*')
    .gte('due_date', startOfMonth)
    .lte('due_date', endOfMonth)
    .order('due_date', { ascending: true })

  if (user) {
    query = query.eq('user_id', user.id)
  }

  const { data, error } = await query

  if (error) {
    console.error('Erro ao buscar boletos:', error)
    return []
  }

  const bills = (data as Bill[]) || []

  // Auto-propagação de contas recorrentes para o mês consultado
  if (user) {
    try {
      const { data: recurringBills } = await supabase
        .from('bills')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_recurring', true)

      if (recurringBills && recurringBills.length > 0) {
        const existingTitles = new Set(bills.map((b) => (b.title || '').trim().toLowerCase()))
        const toInsert: any[] = []

        for (const rec of recurringBills) {
          const recTitle = (rec.title || '').trim().toLowerCase()
          if (!existingTitles.has(recTitle)) {
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

  const { data: bills, error: billsError } = await supabase
    .from('bills')
    .select('amount, due_date, status')

  if (billsError) {
    console.error('Erro ao buscar histórico de contas:', billsError)
    return []
  }

  const monthlyData: Record<string, { year: number; monthNum: number; expense: number; income: number }> = {}

  bills?.forEach((bill) => {
    if (!bill.due_date) return
    const date = new Date(bill.due_date)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

    if (!monthlyData[key]) {
      monthlyData[key] = {
        year: date.getFullYear(),
        monthNum: date.getMonth() + 1,
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
  const { supabase } = await getAuthUser()

  const { error } = await supabase
    .from('bills')
    .update({ status: isPaid ? 'paid' : 'pending' })
    .eq('id', id)

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
  const { supabase } = await getAuthUser()

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

  if (error) {
    throw new Error(`Erro ao atualizar boleto: ${error.message}`)
  }

  revalidatePath('/')
  return { success: true }
}

// 6. Buscar todas as metas do usuário
export async function getGoals(): Promise<Goal[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('goals')
    .select('*')
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

  const { error } = await supabase.from('goals').insert([
    {
      user_id: user.id,
      title: goal.title,
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
  const { supabase } = await getAuthUser()

  const { data: goal, error: fetchError } = await supabase
    .from('goals')
    .select('current_amount')
    .eq('id', id)
    .single()

  if (fetchError || !goal) {
    throw new Error('Meta não encontrada.')
  }

  const newAmount = Number(goal.current_amount || 0) + Number(additionalAmount)

  const { error } = await supabase
    .from('goals')
    .update({ current_amount: newAmount })
    .eq('id', id)

  if (error) {
    throw new Error(`Erro ao atualizar saldo da meta: ${error.message}`)
  }

  revalidatePath('/')
  return { success: true }
}

// 9. Deletar meta
export async function deleteGoal(id: string) {
  const { supabase } = await getAuthUser()

  const { error } = await supabase.from('goals').delete().eq('id', id)

  if (error) {
    throw new Error(`Erro ao deletar meta: ${error.message}`)
  }

  revalidatePath('/')
  return { success: true }
}
