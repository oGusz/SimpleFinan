'use server'

import { actionError, actionOk, type ActionResult } from '@/lib/action-result'
import { createClient } from '@/lib/supabase/server'
import { isValidAmount, isValidDate, MAX_TITLE_LENGTH } from '@/lib/validation'
import { revalidatePath } from 'next/cache'

export async function createBill(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return actionError('Usuário não autenticado.')

  const title = String(formData.get('title') ?? '').trim()
  const amount = parseFloat(formData.get('amount') as string)
  const due_date = formData.get('due_date') as string
  const category = (formData.get('category') as string) || 'Outros'
  const is_recurring = formData.get('is_recurring') === 'on'

  if (!title || title.length > MAX_TITLE_LENGTH || !isValidDate(due_date) || !isValidAmount(amount) || amount <= 0) {
    return actionError('Preencha o título, o valor e o vencimento corretamente.')
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
    return actionError('Não foi possível salvar a conta.')
  }

  revalidatePath('/')
  return actionOk()
}
