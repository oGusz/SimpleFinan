'use client'

import { useEffect, useState, type ComponentType } from 'react'
import useSWR, { mutate } from 'swr'
import {
  BadgeCheck,
  BellRing,
  CalendarCheck,
  CalendarHeart,
  CalendarRange,
  CircleCheck,
  Flag,
  History,
  ListChecks,
  Medal,
  Milestone,
  PiggyBank,
  ReceiptText,
  Target,
  Trophy,
  Wallet,
} from 'lucide-react'

import type { GamificationState } from '@/lib/gamification'
import { createClient } from '@/lib/supabase/client'

const KEY = 'gamification'

async function fetchGamification(): Promise<GamificationState> {
  const response = await fetch('/api/gamification', { cache: 'no-store' })
  if (response.status === 401) return { status: 'unavailable' }
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

type IconProps = { className?: string; strokeWidth?: number; 'aria-hidden'?: 'true' }

const ICONS: Record<string, ComponentType<IconProps>> = {
  BadgeCheck,
  BellRing,
  CalendarCheck,
  CalendarHeart,
  CalendarRange,
  CircleCheck,
  Flag,
  History,
  ListChecks,
  Medal,
  Milestone,
  PiggyBank,
  ReceiptText,
  Target,
  Trophy,
  Wallet,
}

export function AchievementIcon({ name, ...props }: { name: string } & IconProps) {
  const Icon = ICONS[name] ?? Trophy
  return <Icon aria-hidden="true" {...props} />
}

/** Id de quem está logado; a chave do SWR leva o id para a troca de conta não mostrar os pontos de outra pessoa. */
function useUserId() {
  const [userId, setUserId] = useState<string | null>(null)
  useEffect(() => {
    const supabase = createClient()
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null))
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])
  return userId
}

/** Estado compartilhado entre o painel, a tela de conquistas e o aviso: uma busca só. */
export function useGamification(enabled = true) {
  const userId = useUserId()
  return useSWR(enabled && userId ? [KEY, userId] : null, fetchGamification, {
    revalidateOnFocus: false,
    dedupingInterval: 10_000,
  })
}

/** Chamar depois de algo que pode destravar uma conquista: o aviso aparece na hora. */
export function refreshGamification() {
  void mutate((key) => Array.isArray(key) && key[0] === KEY)
}
