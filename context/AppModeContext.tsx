'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { hasPremiumAccess } from '@/lib/plans'

// ─── Types ────────────────────────────────────────────────────────────────────
export type AppMode = 'manual' | 'open_finance'

interface AppModeContextValue {
  mode: AppMode
  isOpenFinance: boolean
  isManual: boolean
  isPremium: boolean
  /** Retorna false quando o modo pedido exige um plano que o usuário não tem. */
  setMode: (mode: AppMode) => Promise<boolean>
  loading: boolean
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AppModeContext = createContext<AppModeContextValue>({
  mode: 'manual',
  isOpenFinance: false,
  isManual: true,
  isPremium: false,
  setMode: async () => false,
  loading: true,
})

const STORAGE_KEY = '@simplefinan:mode'

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AppModeProvider({ children }: { children: ReactNode }) {
  const [preferredMode, setPreferredMode] = useState<AppMode>('manual')
  const [isPremium, setIsPremium] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // O provider sobrevive ao login e ao logout, então recarrega ao entrar e sair de /login.
  const isLoginPage = usePathname() === '/login'

  useEffect(() => {
    async function loadMode() {
      setLoading(true)

      const cached = localStorage.getItem(STORAGE_KEY) as AppMode | null
      if (cached === 'manual' || cached === 'open_finance') {
        setPreferredMode(cached)
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        // O modo é só uma preferência. O direito ao Premium vem da tabela subscriptions,
        // que o usuário não consegue alterar (ao contrário do user_metadata).
        const serverMode = user.user_metadata?.app_mode as AppMode | undefined
        if (serverMode === 'manual' || serverMode === 'open_finance') {
          setPreferredMode(serverMode)
          localStorage.setItem(STORAGE_KEY, serverMode)
        }

        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('plan, status, current_period_end')
          .eq('user_id', user.id)
          .maybeSingle()
        setIsPremium(hasPremiumAccess(subscription))
      } else {
        setIsPremium(false)
      }

      setLoading(false)
    }

    loadMode()
  }, [isLoginPage])

  const setMode = useCallback(
    async (newMode: AppMode) => {
      if (newMode === 'open_finance' && !isPremium) return false

      setPreferredMode(newMode)
      localStorage.setItem(STORAGE_KEY, newMode)

      // Salva no Supabase para sincronizar entre dispositivos
      await supabase.auth.updateUser({
        data: { app_mode: newMode },
      })
      return true
    },
    [supabase, isPremium]
  )

  // Assinatura vencida volta para o modo manual, sem perder os dados.
  const mode: AppMode = isPremium ? preferredMode : 'manual'

  return (
    <AppModeContext.Provider
      value={{
        mode,
        isOpenFinance: mode === 'open_finance',
        isManual: mode === 'manual',
        isPremium,
        setMode,
        loading,
      }}
    >
      {children}
    </AppModeContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAppMode() {
  return useContext(AppModeContext)
}
