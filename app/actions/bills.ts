'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createBill(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Usuário não autenticado.' }

  const title = String(formData.get('title') ?? '').trim()
  const amount = parseFloat(formData.get('amount') as string)
  const due_date = formData.get('due_date') as string
  const category = (formData.get('category') as string) || 'Outros'
  const is_recurring = formData.get('is_recurring') === 'on'

  if (!title || !due_date || !Number.isFinite(amount) || amount < 0) {
    return { success: false, error: 'Preencha o título, o valor e o vencimento corretamente.' }
  }

  const { error } = await supabase.from('bills').insert({
    user_id: user.id,
    title,
    amount,
    due_date,
    category,
    is_recurring,
    status: 'pending',
  })

  if (error) {
    console.error('Erro ao salvar boleto no Supabase:', error)
    return { success: false, error: 'Não foi possível salvar a conta.' }
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
    return { success: false, error: 'Não foi possível atualizar a conta.' }
  }

  revalidatePath('/')
  return { success: true, newStatus }
}
