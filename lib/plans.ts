// Regras de plano compartilhadas entre cliente e servidor.
// No cliente servem apenas para a interface: quem bloqueia de verdade é o servidor.

/** Cada banco conectado gera custo no provedor; o limite protege a margem do plano. */
export const MAX_CONNECTED_BANKS = 5

export interface SubscriptionAccess {
  plan: string
  status: string
  current_period_end: string | null
}

// 'canceled' e 'billing_issue' mantêm o acesso até o fim do período já pago.
const STATUSES_WITH_ACCESS = ['active', 'canceled', 'billing_issue']

export function hasPremiumAccess(subscription: SubscriptionAccess | null | undefined): boolean {
  if (!subscription) return false
  if (subscription.plan !== 'premium') return false
  if (!STATUSES_WITH_ACCESS.includes(subscription.status)) return false
  if (!subscription.current_period_end) return true
  return new Date(subscription.current_period_end).getTime() > Date.now()
}
