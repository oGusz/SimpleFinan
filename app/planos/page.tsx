'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Crown, SlidersHorizontal } from 'lucide-react'

import { startFreeTrial } from '@/app/actions/subscription'
import { useAppMode } from '@/context/AppModeContext'
import { track } from '@/lib/analytics'
import { MAX_CONNECTED_BANKS, TRIAL_DAYS } from '@/lib/plans'
import { createClient } from '@/lib/supabase/client'

interface NativePurchaseResult {
  status: 'success' | 'cancelled' | 'error'
  message?: string
}

// Definidos pelo app nativo (mobile/App.tsx). No navegador não existem.
declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void }
    __SIMPLEFINAN_IAP__?: boolean
  }
}

const FREE_FEATURES = [
  'Contas e vencimentos com recorrência',
  'Metas financeiras e aportes',
  'Carteira de investimentos manual',
  'Cotações, rebalanceamento e simulador',
]

const PREMIUM_FEATURES = [
  'Tudo do plano Gratuito',
  `Conexão com até ${MAX_CONNECTED_BANKS} bancos via Open Finance`,
  'Extrato importado e gastos por categoria',
  'Importação automática de investimentos',
  'Saldos das contas em um só lugar',
]

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-xs text-slate-300">
          <Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export default function PlanosPage() {
  const { isPremium, loading } = useAppMode()
  const [isNativeApp, setIsNativeApp] = useState(false)
  const [iapAvailable, setIapAvailable] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    track('plans_viewed')
    setIsNativeApp(Boolean(window.ReactNativeWebView))
    setIapAvailable(window.__SIMPLEFINAN_IAP__ === true)

    // A compra é confirmada pelo webhook da RevenueCat, que pode levar alguns segundos.
    const handleResult = (event: Event) => {
      const { status, message: resultMessage } = (event as CustomEvent<NativePurchaseResult>).detail
      setWorking(false)
      if (status === 'success') {
        track('purchase_completed')
        setMessage('Tudo certo! Ativando seu Premium...')
        setTimeout(() => window.location.reload(), 4000)
      } else if (status === 'error') {
        setMessage(resultMessage || 'Não foi possível concluir. Tente novamente.')
      }
    }
    window.addEventListener('simplefinan:iap', handleResult)
    return () => window.removeEventListener('simplefinan:iap', handleResult)
  }, [])

  const handleStartTrial = async () => {
    setWorking(true)
    setMessage(null)
    const result = await startFreeTrial()
    if (result.error) {
      setMessage(result.error)
      setWorking(false)
      return
    }
    track('trial_started')
    // Recarrega por inteiro para o contexto ler o novo plano.
    window.location.assign('/open-finance')
  }

  const sendToNativeApp = async (type: 'purchase' | 'restore') => {
    const { data } = await createClient().auth.getSession()
    if (!data.session) return
    setWorking(true)
    setMessage(null)
    track(type === 'purchase' ? 'purchase_started' : 'restore_started')
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type, userId: data.session.user.id }))
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28 select-none">
        <header className="flex items-center justify-between">
          <Link
            href="/perfil"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-slate-300 active:scale-90 transition-all shadow-sm"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-base font-bold text-white tracking-tight">Planos</h1>
          <div className="w-10" />
        </header>

        <section className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/60 to-slate-900/60 p-5 space-y-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <Crown className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Premium</h2>
              <p className="text-[11px] text-slate-400">Seus bancos atualizando o app por você</p>
            </div>
          </div>

          <FeatureList items={PREMIUM_FEATURES} />

          {isPremium ? (
            <Link
              href="/open-finance"
              className="flex items-center justify-center w-full h-12 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500 active:scale-[0.98] transition-all"
            >
              Gerenciar bancos conectados
            </Link>
          ) : iapAvailable ? (
            <div className="space-y-2">
              <button
                type="button"
                disabled={working}
                onClick={() => sendToNativeApp('purchase')}
                className="w-full h-12 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {working ? 'Processando...' : 'Assinar o Premium'}
              </button>
              <button
                type="button"
                disabled={working}
                onClick={() => sendToNativeApp('restore')}
                className="w-full text-xs text-slate-400 underline"
              >
                Restaurar compras
              </button>
            </div>
          ) : isNativeApp ? (
            <button type="button" disabled className="w-full h-12 rounded-xl bg-slate-800 text-sm font-semibold text-slate-400 cursor-not-allowed">
              Assinatura disponível em breve
            </button>
          ) : (
            <button
              type="button"
              disabled={loading || working}
              onClick={handleStartTrial}
              className="w-full h-12 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {working ? 'Ativando...' : `Testar grátis por ${TRIAL_DAYS} dias`}
            </button>
          )}

          {message && <p className="text-center text-xs text-amber-300">{message}</p>}
        </section>

        <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 border border-slate-700">
              <SlidersHorizontal className="h-5 w-5 text-slate-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Gratuito</h2>
              <p className="text-[11px] text-slate-400">Você insere os dados à mão</p>
            </div>
          </div>

          <FeatureList items={FREE_FEATURES} />
        </section>

        <p className="text-center text-[11px] text-slate-500">
          <Link href="/termos" className="underline">Termos de Uso</Link>
          {' · '}
          <Link href="/privacidade" className="underline">Política de Privacidade</Link>
        </p>
      </main>
    </>
  )
}
