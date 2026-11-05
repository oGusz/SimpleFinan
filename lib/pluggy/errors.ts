export const ERROR_MESSAGES: Record<string, string> = {
  LOGIN_ERROR: 'O acesso expirou. Toque em Reconectar; seu histórico é mantido',
  OUTDATED: 'Não foi possível atualizar os dados deste banco.',
  WAITING_USER_INPUT: 'O banco pediu uma autenticação adicional.',
  WAITING_USER_ACTION: 'O banco pediu uma ação sua para continuar.',
}

export const IMPORT_FAILED = 'IMPORT_FAILED'
export const BILLS_PARTIAL = 'BILLS_PARTIAL'

export const IMPORT_FAILED_MESSAGE = 'Não foi possível importar os dados mais recentes deste banco. Tente atualizar de novo.'
export const BILLS_PARTIAL_MESSAGE = 'As faturas deste banco não foram atualizadas. Tente atualizar de novo.'

/**
 * O que gravar em connected_banks para o status real do item. O erro só é limpo com o item
 * UPDATED; durante UPDATING o aviso anterior continua valendo até sair o resultado.
 */
export function itemStatusFields(item: { status?: unknown; error?: { code?: unknown } | null }) {
  const status = String(item.status || 'OUTDATED')
  if (status === 'UPDATED') return { item_status: status, error_type: null, error_message: null }
  if (status === 'UPDATING') return { item_status: status }
  return {
    item_status: status,
    error_type: item.error?.code ? String(item.error.code) : null,
    error_message: ERROR_MESSAGES[status] || ERROR_MESSAGES.OUTDATED,
  }
}
