'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deletePluggyItem, getPluggyApiKey } from '@/lib/pluggy/server'

const USER_TABLES = [
  'synced_transactions',
  'synced_accounts',
  'connected_banks',
  'investments',
  'goals',
  'bills',
  'subscriptions',
]

/**
 * Exclui a conta e todos os dados (exigência da App Store, do Google Play e da LGPD).
 * Aborta se não conseguir revogar um banco, para não deixar consentimento ativo sem dono.
 */
export async function deleteAccount(confirmation: string) {
  if (confirmation !== 'EXCLUIR') return { error: 'Confirmação inválida.' }

  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { error: 'Usuário não autenticado' }

  try {
    const admin = createAdminClient()

    const { data: banks, error: banksError } = await admin
      .from('connected_banks')
      .select('item_id')
      .eq('user_id', user.id)
    if (banksError) throw banksError

    if (banks?.length) {
      const apiKey = await getPluggyApiKey()
      for (const bank of banks) {
        await deletePluggyItem(bank.item_id, apiKey)
      }
    }

    const { data: avatars } = await admin.storage.from('avatars').list(user.id)
    if (avatars?.length) {
      await admin.storage.from('avatars').remove(avatars.map((file) => `${user.id}/${file.name}`))
    }

    for (const table of USER_TABLES) {
      const { error } = await admin.from(table).delete().eq('user_id', user.id)
      if (error) throw error
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteError) throw deleteError

    await supabase.auth.signOut()
    return { success: true }
  } catch (error) {
    console.error('[Conta] Falha ao excluir conta:', error)
    return { error: 'Não foi possível excluir a conta agora. Tente novamente em instantes.' }
  }
}
