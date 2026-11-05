import { Car, Home, Plane, Shield, Target, TrendingUp, type LucideIcon } from 'lucide-react'

export type GoalCategoryId = 'emergency' | 'travel' | 'home' | 'vehicle' | 'investment' | 'other'

export const GOAL_CATEGORIES: { id: GoalCategoryId; label: string; icon: LucideIcon }[] = [
  { id: 'emergency', label: 'Reserva de emergência', icon: Shield },
  { id: 'travel', label: 'Viagem', icon: Plane },
  { id: 'home', label: 'Casa', icon: Home },
  { id: 'vehicle', label: 'Veículo', icon: Car },
  { id: 'investment', label: 'Investimento', icon: TrendingUp },
  { id: 'other', label: 'Outros', icon: Target },
]

// Metas antigas foram salvas com o rótulo em português.
const LEGACY_CATEGORIES: Record<string, GoalCategoryId> = {
  reserva: 'emergency',
  viagem: 'travel',
  bens: 'home',
  investimento: 'investment',
  outros: 'other',
}

export function normalizeGoalCategory(raw: string | null | undefined): GoalCategoryId {
  const value = raw?.trim().toLowerCase() ?? ''
  const known = GOAL_CATEGORIES.find((category) => category.id === value)
  return known?.id ?? LEGACY_CATEGORIES[value] ?? 'other'
}
