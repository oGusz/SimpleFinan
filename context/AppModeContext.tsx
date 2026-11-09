'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { hasPremiumAccess } from '@/lib/plans'
import { identifyUser } from '@/lib/analytics'
import { safeGet, safeRemove, safeSet } from '@/lib/safe-storage'

// ─── Types ────────────────────────────────────────────────────────────────────
export type AppMode = 'manual' | 'open_finance'

export interface SubscriptionInfo {
  plan: string
  status: string
  provider: string | null
  store: string | null
  currentPeriodEnd: string | null
}

interface AppModeContextValue {
  mode: AppMode
  isOpenFinance: boolean
  isManual: boolean
  isPremium: boolean
  /** null significa sem assinatura, salvo quando subscriptionError é true. */
  subscription: SubscriptionInfo | null
  /** A leitura falhou: o plano exibido é o último conhecido, e não uma resposta do banco. */
  subscriptionError: boolean
  reloadSubscription: () => Promise<void>
  /** Retorna false quando o plano não permite o modo ou quando a preferência não pôde ser salva. */
  setMode: (mode: AppMode) => Promise<boolean>
  loading: boolean
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AppModeContext = createContext<AppModeContextValue>({
  mode: 'manual',
  isOpenFinance: false,
  isManual: true,
  isPremium: false,
  subscription: null,
  subscriptionError: false,
  reloadSubscription: async () => {},
  setMode: async () => false,
  loading: true,
})

const STORAGE_KEY = '@simplefinan:mode'
const PLAN_KEY = '@simplefinan:plan'

const isAppMode = (value: unknown): value is AppMode =>
  value === 'manual' || value === 'open_finance'

const toAccess = (subscription: SubscriptionInfo | null) =>
  subscription && {
    plan: subscription.plan,
    status: subscription.status,
    current_period_end: subscription.currentPeriodEnd,
  }

// O dono acompanha o plano guardado, para que uma conta nunca herde o Premium de outra.
function readCachedPlan(userId: string | null): SubscriptionInfo | null {
  const raw = safeGet(PLAN_KEY)
  if (!raw) return null
  try {
    const cached = JSON.parse(raw)
    if (userId && cached?.userId !== userId) return null
    return cached?.subscription ?? null
  } catch {
    return null
  }
}

function hasSavedMode(user: User): boolean {
  return isAppMode(user.user_metadata?.app_mode) || isAppMode(safeGet(STORAGE_KEY))
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AppModeProvider({ children }: { children: ReactNode }) {
  const [preferredMode, setPreferredMode] = useState<AppMode>('manual')
  const [isPremium, setIsPremium] = useState(false)
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null)
  const [subscriptionError, setSubscriptionError] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const loadRun = useRef(0)
  const planRun = useRef(0)
  // setMode pode vir logo depois de reloadSubscription, antes de o estado chegar à closure.
  const isPremiumRef = useRef(false)
  const preferredModeRef = useRef<AppMode>('manual')

  // O provider sobrevive ao login e ao logout, então recarrega ao entrar e sair de /login.
  const isLoginPage = usePathname() === '/login'

  const applyPreferredMode = useCallback((next: AppMode) => {
    preferredModeRef.current = next
    setPreferredMode(next)
  }, [])

  const applyPlan = useCallback((next: SubscriptionInfo | null, failed: boolean) => {
    const premium = hasPremiumAccess(toAccess(next))
    isPremiumRef.current = premium
    setIsPremium(premium)
    setSubscription(next)
    setSubscriptionError(failed)
  }, [])

  const fetchSubscription = useCallback(
    async (userId: string): Promise<SubscriptionInfo | null> => {
      const query = (columns: string) =>
        supabase.from('subscriptions').select(columns).eq('user_id', userId).maybeSingle()

      let result = await query('plan, status, provider, store, current_period_end')
      // Banco ainda sem as colunas novas não pode virar erro permanente de assinatura.
      if (result.error?.code === '42703' || result.error?.code === 'PGRST204') {
        result = await query('plan, status, current_period_end')
      }
      if (result.error) throw result.error

      const row = result.data as unknown as Record<string, string | null> | null
      if (!row) return null
      return {
        plan: row.plan ?? '',
        status: row.status ?? '',
        provider: row.provider ?? null,
        store: row.store ?? null,
        currentPeriodEnd: row.current_period_end ?? null,
      }
    },
    [supabase]
  )

  /** Consulta o plano e aplica o resultado de uma vez, para o modo não piscar no caminho. */
  const refreshPlan = useCallback(
    async (user: User, run: number) => {
      let next: SubscriptionInfo | null
      try {
        next = await fetchSubscription(user.id)
      } catch (err) {
        console.warn('Não foi possível ler a assinatura:', err)
        if (run === planRun.current) applyPlan(readCachedPlan(user.id), true)
        return
      }
      if (run !== planRun.current) return

      safeSet(PLAN_KEY, JSON.stringify({ userId: user.id, subscription: next }))

      // Premium sem preferência salva vê os dados do banco. Quem tem ativos manuais continua
      // no manual, porque a troca os esconderia; a decisão fica para o aviso da conexão.
      if (hasPremiumAccess(toAccess(next)) && !hasSavedMode(user)) {
        try {
          const { count, error } = await supabase
            .from('investments')
            .select('ticker', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('source', 'manual')
          if (run !== planRun.current) return
          if (!error && count === 0 && !hasSavedMode(user)) applyPreferredMode('open_finance')
        } catch (err) {
          console.warn('Não foi possível verificar os ativos manuais:', err)
          if (run !== planRun.current) return
        }
      }

      applyPlan(next, false)
    },
    [supabase, fetchSubscription, applyPlan, applyPreferredMode]
  )

  const reloadSubscription = useCallback(async () => {
    const run = ++planRun.current
    try {
      const { data, error } = await supabase.auth.getSession()
      const user = data.session?.user
      if (user) {
        await refreshPlan(user, run)
      } else if (run === planRun.current) {
        // Sessão que não pôde ser confirmada não é o mesmo que conta sem plano.
        if (error) applyPlan(readCachedPlan(null), true)
        else applyPlan(null, false)
      }
    } catch (err) {
      console.warn('Não foi possível recarregar a assinatura:', err)
      if (run === planRun.current) applyPlan(readCachedPlan(null), true)
    }
  }, [supabase, refreshPlan, applyPlan])

  useEffect(() => {
    const run = ++loadRun.current

    async function loadMode() {
      setLoading(true)
      const plan = ++planRun.current

      try {
        // Parte do manual para a preferência da conta anterior não passar a esta.
        const cached = safeGet(STORAGE_KEY)
        let nextMode: AppMode = isAppMode(cached) ? cached : 'manual'

        // A sessão local evita esperar a rede. O plano continua vindo do banco, protegido por RLS.
        const { data, error } = await supabase.auth.getSession()
        if (run !== loadRun.current) return
        const user = data.session?.user

        if (user) {
          identifyUser(user.id)

          // O modo é só uma preferência. O direito ao Premium vem da tabela subscriptions,
          // que o usuário não consegue alterar (ao contrário do user_metadata).
          const serverMode = user.user_metadata?.app_mode
          if (isAppMode(serverMode)) {
            nextMode = serverMode
            safeSet(STORAGE_KEY, serverMode)
          }
          applyPreferredMode(nextMode)
          await refreshPlan(user, plan)
        } else {
          applyPreferredMode(nextMode)
          if (error) applyPlan(readCachedPlan(null), true)
          else applyPlan(null, false)
        }
      } catch (err) {
        console.warn('Não foi possível carregar o modo do app:', err)
        if (run === loadRun.current) applyPlan(readCachedPlan(null), true)
      } finally {
        // Só a execução mais recente encerra, e ela sempre encerra: a carteira espera por isso.
        if (run === loadRun.current) setLoading(false)
      }
    }

    loadMode()
  }, [isLoginPage, supabase, refreshPlan, applyPlan, applyPreferredMode])

  // A falha pode ter durado só um instante: sem isto, o rebaixamento ficaria até fechar o app.
  useEffect(() => {
    if (!subscriptionError) return

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') reloadSubscription()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [subscriptionError, reloadSubscription])

  const setMode = useCallback(
    async (newMode: AppMode) => {
      if (newMode === 'open_finance' && !isPremiumRef.current) return false

      const previousMode = preferredModeRef.current
      const previousCached = safeGet(STORAGE_KEY)

      applyPreferredMode(newMode)
      safeSet(STORAGE_KEY, newMode)

      // Salva no Supabase para sincronizar entre dispositivos
      let failed = false
      try {
        const { error } = await supabase.auth.updateUser({ data: { app_mode: newMode } })
        failed = Boolean(error)
      } catch {
        failed = true
      }

      if (failed) {
        applyPreferredMode(previousMode)
        if (previousCached === null) safeRemove(STORAGE_KEY)
        else safeSet(STORAGE_KEY, previousCached)
        return false
      }
      return true
    },
    [supabase, applyPreferredMode]
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
        subscription,
        subscriptionError,
        reloadSubscription,
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
