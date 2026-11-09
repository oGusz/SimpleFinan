'use server'

import { isEmailConfigured } from '@/lib/email/send'
import { isPushEnabled } from '@/lib/push'

/** Sem o envio configurado, o controle não aparece: seria a promessa de um aviso que nunca chega. */
export async function getReminderAvailability() {
  return { emailEnabled: isEmailConfigured(), pushEnabled: isPushEnabled() }
}
