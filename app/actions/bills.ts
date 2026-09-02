'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ID de teste para ambiente local sem login
const DEV_USER_ID = '75e08dad-ec51-44cb-b637-464911d01b60'

export async function createBill(formData: FormData) {
  const supabase = await createClient()

  // Tenta obter o usuário logado
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id || DEV_USER_ID

  const title = formData.get('title') as string
  const amount = parseFloat(formData.get('amount') as string)
  const due_date = formData.get('due_date') as string
  const category = (formData.get('category') as string) || 'Outros'
  const is_recurring = formData.get('is_recurring') === 'on'

  const { error } = await supabase.from('bills').insert({
    user_id: userId,
    title,
    amount,
    due_date,
    category,
    is_recurring,
    status: 'pending',
  })

  if (error) {
    console.error('Erro ao salvar boleto no Supabase:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/')
  return { success: true }
}

export async function toggleBillStatus(billId: string, currentStatus: string) {
  const supabase = await createClient()

  const newStatus = currentStatus === 'paid' ? 'pending' : 'paid'

  const { error } = await supabase
    .from('bills')
    .update({ status: newStatus })
    .eq('id', billId)

  if (error) {
    console.error('Erro ao atualizar status:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/')
  return { success: true, newStatus }
}