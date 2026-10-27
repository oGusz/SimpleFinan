'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────
export type AppMode = 'manual' | 'open_finance'

interface AppModeContextValue {
  mode: AppMode
  isOpenFinance: boolean
  isManual: boolean
  setMode: (mode: AppMode) => Promise<void>
  loading: boolean
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AppModeContext = createContext<AppModeContextValue>({
  mode: 'manual',
  isOpenFinance: false,
  isManual: true,
  setMode: async () => {},
  loading: true,
})

const STORAGE_KEY = '@simplefinan:mode'

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>('manual')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // Carrega o modo salvo (localStorage tem prioridade para velocidade)
  useEffect(() => {
    async function loadMode() {
      // 1. Verifica localStorage imediatamente
      const cached = localStorage.getItem(STORAGE_KEY) as AppMode | null
      if (cached === 'manual' || cached === 'open_finance') {
        setModeState(cached)
      }

      // 2. Verifica Supabase user_metadata como fonte de verdade
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const serverMode = user.user_metadata?.app_mode as AppMode | undefined
        if (serverMode === 'manual' || serverMode === 'open_finance') {
          setModeState(serverMode)
          localStorage.setItem(STORAGE_KEY, serverMode)
        }
      }

      setLoading(false)
    }

    loadMode()
  }, [])

  // Persiste o modo tanto no localStorage quanto no Supabase user_metadata
  const setMode = useCallback(
    async (newMode: AppMode) => {
      setModeState(newMode)
      localStorage.setItem(STORAGE_KEY, newMode)

      // Salva no Supabase para sincronizar entre dispositivos
      await supabase.auth.updateUser({
        data: { app_mode: newMode },
      })
    },
    [supabase]
  )

  return (
    <AppModeContext.Provider
      value={{
        mode,
        isOpenFinance: mode === 'open_finance',
        isManual: mode === 'manual',
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

