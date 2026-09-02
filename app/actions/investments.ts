'use server'

import { createClient } from '@/lib/supabase/server'

export async function getInvestments() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('investments')
    .select('*')
    .order('category', { ascending: true })

  if (error) {
    console.error('Erro ao buscar investimentos:', error)
    return []
  }

  return data || []
}