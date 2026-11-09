'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Crown, SlidersHorizontal } from 'lucide-react'

import { startFreeTrial } from '@/app/actions/subscription'
import { BackButton } from '@/components/back-button'
import { useAppMode } from '@/context/AppModeContext'
import { track } from '@/lib/analytics'
import { formatDate } from '@/lib/format'
import { isNativeApp, onNativeEvent, postToNative, type NativePackage } from '@/lib/native-bridge'
import { MAX_CONNECTED_BANKS, TRIAL_DAYS } from '@/lib/plans'
import { safeSessionGet, safeSessionSet } from '@/lib/safe-storage'
import { createClient } from '@/lib/supabase/client'

// Definido pelo app nativo (mobile/App.tsx). No navegador não existe.
declare global {
  interface Window {
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
  'Radar de proventos: renda mês a mês, yield sobre o preço pago e meta de renda passiva',
  'Notícias: todos os comunicados oficiais das suas empresas e fatos relevantes do mercado',
  'Rentabilidade real da carteira contra CDI e Ibovespa, descontando seus aportes',
  'Relatório mensal com contas, carteira, proventos e metas',
  'Alertas de preço e de comunicados das suas empresas',
]

const POLL_INTERVAL_MS = 3_000
const POLL_LIMIT_MS = 60_000
const OFFERINGS_TIMEOUT_MS = 15_000
// Quem sai da tela e volta logo após pagar não pode encontrar o botão de compra de novo.
const PENDING_KEY = '@simplefinan:purchase-pending'
const PENDING_MAX_AGE_MS = 15 * 60_000

const UNAVAILABLE = 'Planos indisponíveis agora. Tente de novo.'
const CONFIRMING_TEXT = 'Confirmando sua assinatura...'
const DELAYED_TEXT = {
  purchase: 'Pagamento recebido; pode levar alguns minutos',
  restore: 'Assinatura encontrada; pode levar alguns minutos',
}

// A loja informa o período em ISO 8601 (P1M, P1Y).
const PERIOD_WORDS: Record<string, string> = {
  P1W: 'semana',
  P7D: 'semana',
  P1M: 'mês',
  P4W: 'mês',
  P2M: 'bimestre',
  P3M: 'trimestre',
  P6M: 'semestre',
  P1Y: 'ano',
  P12M: 'ano',
}

const INTRO_UNITS: Record<string, [string, string]> = {
  D: ['dia', 'dias'],
  W: ['semana', 'semanas'],
  M: ['mês', 'meses'],
  Y: ['ano', 'anos'],
}

/** A loja exige deixar claro quanto tempo dura a oferta. Sem a duração, mostra só o preço. */
function introLabel({ introPrice, introPeriod, introCycles }: NativePackage) {
  const match = /^P(\d+)([DWMY])$/.exec(introPeriod ?? '')
  if (!match) return `Oferta inicial: ${introPrice}`
  const count = Number(match[1])
  const [singular, plural] = INTRO_UNITS[match[2]]
  const duration = `${count} ${count === 1 ? singular : plural}`
  const cycles = introCycles ?? 1
  return cycles > 1
    ? `Oferta inicial: ${introPrice} a cada ${duration}, por ${cycles} vezes`
    : `Oferta inicial: ${introPrice} por ${duration}`
}

const PRIMARY_BUTTON =
  'flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-emerald-700 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:cursor-default disabled:opacity-50'

const MESSAGE_COLOR = { success: 'text-emerald-400', error: 'text-rose-400', neutral: 'text-slate-300' }

type Message = { kind: keyof typeof MESSAGE_COLOR; text: string }
type Flow = 'idle' | 'working' | 'confirming' | 'delayed'
type ConfirmKind = keyof typeof DELAYED_TEXT
type Offerings = { status: 'loading' | 'ok' | 'empty' | 'error'; packages: NativePackage[] }

function periodWord(period: string) {
  return PERIOD_WORDS[period?.toUpperCase()] ?? null
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function StoreLinks() {
  const appStore = process.env.NEXT_PUBLIC_APP_STORE_URL?.trim()
  const playStore = process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim()
  if (!appStore || !playStore) return null
  const linkClass = 'flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-700 px-3 text-sm font-medium text-slate-200'
  return (
    <div className="flex flex-wrap gap-2">
      <a href={appStore} target="_blank" rel="noopener noreferrer" className={linkClass}>App Store</a>
      <a href={playStore} target="_blank" rel="noopener noreferrer" className={linkClass}>Google Play</a>
    </div>
  )
}

export default function PlanosPage() {
  const { isPremium, loading, subscription, subscriptionError, reloadSubscription } = useAppMode()
  // Só o efeito sabe onde a página está rodando; antes disso, nada de botão de compra ou teste.
  const [env, setEnv] = useState<{ native: boolean; iap: boolean } | null>(null)
  const [flow, setFlow] = useState<Flow>('idle')
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>('purchase')
  const [message, setMessage] = useState<Message | null>(null)
  const [offerings, setOfferings] = useState<Offerings>({ status: 'loading', packages: [] })
  const [offeringsAttempt, setOfferingsAttempt] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const onTrial = isPremium && subscription?.provider === 'trial'
  const confirmed = isPremium && !onTrial
  const wantsOfferings = Boolean(env?.iap) && !loading && !confirmed && !(subscriptionError && !isPremium)

  const startConfirming = useCallback((kind: ConfirmKind) => {
    safeSessionSet(PENDING_KEY, `${kind}:${Date.now()}`)
    setConfirmKind(kind)
    setMessage(null)
    setFlow('confirming')
  }, [])

  useEffect(() => {
    track('plans_viewed')
    setEnv({ native: isNativeApp(), iap: window.__SIMPLEFINAN_IAP__ === true })

    const [kind, startedAt] = (safeSessionGet(PENDING_KEY) ?? '').split(':')
    if ((kind === 'purchase' || kind === 'restore') && Date.now() - Number(startedAt) < PENDING_MAX_AGE_MS) {
      setConfirmKind(kind)
      setFlow('delayed')
    }

    return onNativeEvent('simplefinan:iap', (detail) => {
      switch (detail?.status) {
        case 'success':
          track('purchase_completed')
          startConfirming('purchase')
          break
        case 'restored':
          track('restore_completed')
          startConfirming('restore')
          break
        case 'nothing_to_restore':
          setFlow('idle')
          setMessage({ kind: 'neutral', text: 'Nenhuma assinatura encontrada nesta conta da loja' })
          break
        case 'cancelled':
          setFlow('idle')
          setMessage(null)
          break
        default:
          setFlow('idle')
          setMessage({ kind: 'error', text: detail?.message || 'Não foi possível concluir. Tente novamente.' })
      }
    })
  }, [startConfirming])

  // O direito ao Premium nasce no webhook da RevenueCat, que pode atrasar: a página acompanha
  // a tabela de assinaturas em vez de presumir que a compra já valeu.
  useEffect(() => {
    if (flow !== 'confirming') return
    void reloadSubscription()
    const interval = setInterval(() => void reloadSubscription(), POLL_INTERVAL_MS)
    const limit = setTimeout(() => setFlow('delayed'), POLL_LIMIT_MS)
    return () => {
      clearInterval(interval)
      clearTimeout(limit)
    }
  }, [flow, reloadSubscription])

  useEffect(() => {
    if (!confirmed) return
    safeSessionSet(PENDING_KEY, '')
    if (flow === 'confirming' || flow === 'delayed') {
      setFlow('idle')
      setMessage({ kind: 'success', text: 'Seu Premium está ativo.' })
    }
  }, [confirmed, flow])

  useEffect(() => {
    if (!wantsOfferings) return

    let active = true
    setOfferings({ status: 'loading', packages: [] })
    const fail = () => {
      if (active) setOfferings({ status: 'error', packages: [] })
    }

    // App antigo não responde a este pedido, e o carregamento não pode ficar sem fim.
    const timer = setTimeout(fail, OFFERINGS_TIMEOUT_MS)
    const unsubscribe = onNativeEvent('simplefinan:offerings', (detail) => {
      clearTimeout(timer)
      if (!active) return
      const packages = Array.isArray(detail?.packages) ? detail.packages : []
      if (detail?.status === 'ok' && packages.length > 0) {
        setOfferings({ status: 'ok', packages })
        // Só há o que escolher com mais de uma opção; entre duas, a pessoa decide.
        setSelectedId((current) =>
          packages.length === 1
            ? packages[0].identifier
            : packages.some((item) => item.identifier === current) ? current : null,
        )
      } else {
        setOfferings({ status: detail?.status === 'error' ? 'error' : 'empty', packages: [] })
      }
    })

    createClient().auth.getSession().then(({ data }) => {
      if (!active) return
      const userId = data.session?.user.id
      if (!userId || !postToNative({ type: 'offerings', userId })) {
        clearTimeout(timer)
        fail()
      }
    }).catch(() => {
      clearTimeout(timer)
      fail()
    })

    return () => {
      active = false
      clearTimeout(timer)
      unsubscribe()
    }
  }, [wantsOfferings, offeringsAttempt])

  const handleStartTrial = async () => {
    setFlow('working')
    setMessage(null)
    try {
      const result = await startFreeTrial()
      if (result.error) {
        setMessage({ kind: 'error', text: result.error })
        setFlow('idle')
        return
      }
    } catch {
      setMessage({ kind: 'error', text: 'Não foi possível iniciar o teste. Verifique a conexão e tente de novo.' })
      setFlow('idle')
      return
    }
    track('trial_started')
    // Recarrega por inteiro para o contexto ler o novo plano.
    window.location.assign('/open-finance')
  }

  const sendToNativeApp = async (type: 'purchase' | 'restore') => {
    setFlow('working')
    setMessage(null)
    let userId: string | undefined
    try {
      const { data } = await createClient().auth.getSession()
      userId = data.session?.user.id
    } catch {
      userId = undefined
    }
    if (!userId) {
      setFlow('idle')
      setMessage({ kind: 'error', text: 'Sua sessão expirou. Entre de novo para continuar.' })
      return
    }

    let sent = false
    if (type === 'purchase') {
      if (selectedId) {
        track('purchase_started')
        sent = postToNative({ type: 'purchase', userId, packageId: selectedId })
      }
    } else {
      track('restore_started')
      sent = postToNative({ type: 'restore', userId })
    }
    if (!sent) {
      setFlow('idle')
      setMessage({ kind: 'error', text: 'Não foi possível concluir. Tente novamente.' })
    }
  }

  const blocked = loading || flow !== 'idle'
  const selected = offerings.packages.find((item) => item.identifier === selectedId) ?? null
  const selectedPeriod = selected ? periodWord(selected.period) : null
  const periodEnd = subscription?.currentPeriodEnd ?? null
  const endedAt = periodEnd && new Date(periodEnd).getTime() <= Date.now() ? ` em ${formatDate(periodEnd)}` : ''
  const endedText = subscription?.provider === 'trial' ? `Seu teste terminou${endedAt}.` : `Sua assinatura terminou${endedAt}.`
  const hasEnded = Boolean(subscription) && !isPremium && subscription?.plan === 'premium'

  const buyBlock = (
    <div className="space-y-3">
      {offerings.status === 'loading' && (
        <p role="status" className="text-center text-sm text-slate-400">Buscando os preços na loja...</p>
      )}

      {(offerings.status === 'empty' || offerings.status === 'error') && (
        <div className="space-y-2">
          <p role="alert" className="text-center text-sm text-slate-300">{UNAVAILABLE}</p>
          <button
            type="button"
            disabled={blocked}
            onClick={() => setOfferingsAttempt((attempt) => attempt + 1)}
            className="min-h-11 w-full cursor-pointer rounded-xl border border-slate-700 text-sm font-medium text-slate-200 disabled:opacity-50"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {offerings.status === 'ok' && (
        <>
          <div role="radiogroup" aria-label="Escolha o plano" className="space-y-2">
            {offerings.packages.map((item) => {
              const word = periodWord(item.period)
              const isSelected = item.identifier === selectedId
              return (
                <button
                  key={item.identifier}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={blocked}
                  onClick={() => setSelectedId(item.identifier)}
                  className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-default ${
                    isSelected ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">{item.title}</span>
                    <span className="block text-sm text-slate-200">
                      {item.priceString}{word ? ` por ${word}` : ''}
                    </span>
                    {item.introPrice && (
                      <span className="block text-xs text-slate-400">{introLabel(item)}</span>
                    )}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      isSelected ? 'border-emerald-400 bg-emerald-500' : 'border-slate-500'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-slate-950" />}
                  </span>
                </button>
              )
            })}
          </div>

          {selected && (
            <p className="text-xs leading-relaxed text-slate-400">
              Renova automaticamente por {selected.priceString}{selectedPeriod ? `/${selectedPeriod}` : ''} até ser
              cancelada. Cancele na App Store ou no Google Play com pelo menos 24 h de antecedência.
            </p>
          )}

          <button
            type="button"
            disabled={blocked || !selected}
            onClick={() => sendToNativeApp('purchase')}
            className={PRIMARY_BUTTON}
          >
            {flow === 'working' ? 'Processando...' : selected ? 'Assinar o Premium' : 'Escolha um plano'}
          </button>
        </>
      )}

      <button
        type="button"
        disabled={blocked}
        onClick={() => sendToNativeApp('restore')}
        className="min-h-11 w-full cursor-pointer text-sm text-slate-400 underline disabled:opacity-50"
      >
        Restaurar compras
      </button>
    </div>
  )

  const renderAction = () => {
    if (!env || loading) {
      return <button type="button" disabled aria-busy="true" className={PRIMARY_BUTTON}>Carregando...</button>
    }

    if (flow === 'confirming' || flow === 'delayed') {
      return (
        <div className="space-y-2">
          <p role="status" className="text-center text-sm text-slate-200">
            {flow === 'confirming' ? CONFIRMING_TEXT : DELAYED_TEXT[confirmKind]}
          </p>
          {flow === 'delayed' && (
            <button
              type="button"
              onClick={() => setFlow('confirming')}
              className="min-h-11 w-full cursor-pointer rounded-xl border border-slate-700 text-sm font-medium text-slate-200"
            >
              Verificar de novo
            </button>
          )}
        </div>
      )
    }

    if (confirmed) {
      return <Link href="/open-finance" className={PRIMARY_BUTTON}>Gerenciar bancos conectados</Link>
    }

    // Sem saber o plano, oferecer compra ou teste poderia cobrar quem já assina.
    if (subscriptionError && !isPremium) {
      return (
        <div className="space-y-2">
          <p role="alert" className="text-center text-sm text-slate-300">
            Não foi possível confirmar seu plano agora.
          </p>
          <button
            type="button"
            onClick={() => void reloadSubscription()}
            className="min-h-11 w-full cursor-pointer rounded-xl border border-slate-700 text-sm font-medium text-slate-200"
          >
            Tentar de novo
          </button>
        </div>
      )
    }

    const trialNotice = onTrial && (
      <p className="text-center text-sm text-slate-200">Teste ativo até {formatDate(periodEnd)}</p>
    )
    const banksLink = onTrial && (
      <Link href="/open-finance" className={PRIMARY_BUTTON}>Gerenciar bancos conectados</Link>
    )

    if (env.iap) {
      return (
        <div className="space-y-3">
          {trialNotice}
          {hasEnded && <p className="text-center text-sm text-slate-200">{endedText}</p>}
          {buyBlock}
          {banksLink}
        </div>
      )
    }

    if (env.native) {
      return (
        <div className="space-y-3">
          {trialNotice}
          {banksLink}
          {process.env.NODE_ENV === 'production' ? (
            !onTrial && <p role="alert" className="text-center text-sm text-slate-300">{UNAVAILABLE}</p>
          ) : (
            <button type="button" disabled className="h-12 w-full rounded-xl bg-slate-800 text-sm font-semibold text-slate-400">
              Assinatura disponível em breve
            </button>
          )}
        </div>
      )
    }

    // Navegador: o teste só aparece para quem nunca teve assinatura; a compra é feita no app.
    if (!subscription) {
      return (
        <div className="space-y-2">
          <button type="button" disabled={blocked} onClick={handleStartTrial} className={PRIMARY_BUTTON}>
            {flow === 'working' ? 'Ativando...' : `Testar grátis por ${TRIAL_DAYS} dias`}
          </button>
          <p className="text-center text-xs leading-relaxed text-slate-400">
            Sem cartão e sem cobrança. Ao fim dos {TRIAL_DAYS} dias, você volta ao plano Gratuito sem perder seus dados
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {trialNotice}
        {banksLink}
        {hasEnded ? (
          <p className="text-center text-sm text-slate-200">
            {endedText} {subscription.provider === 'trial' ? 'Assine pelo app SimpleFinan' : 'Assine de novo pelo app SimpleFinan'}
          </p>
        ) : onTrial ? (
          <p className="text-center text-sm text-slate-300">Para continuar depois do teste, assine pelo app SimpleFinan</p>
        ) : (
          <p className="text-center text-sm text-slate-300">A assinatura é feita pelo app SimpleFinan</p>
        )}
        <StoreLinks />
      </div>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28">
      <header className="flex items-center justify-between">
        <BackButton fallbackHref="/perfil" />
        <h1 className="text-base font-bold tracking-tight text-white">Planos</h1>
        <div className="w-11" />
      </header>

      <section className="space-y-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/60 to-slate-900/60 p-5 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
            <Crown className="h-5 w-5 text-emerald-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Premium</h2>
            <p className="text-xs text-slate-400">Seus bancos atualizando o app por você</p>
          </div>
        </div>

        <FeatureList items={PREMIUM_FEATURES} />

        {renderAction()}

        {message && (
          <p
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={`text-center text-sm ${MESSAGE_COLOR[message.kind]}`}
          >
            {message.text}
          </p>
        )}

        <p className="text-center text-xs text-slate-400">
          <Link href="/termos" className="inline-block py-3 underline">Termos de Uso</Link>
          {' · '}
          <Link href="/privacidade" className="inline-block py-3 underline">Política de Privacidade</Link>
        </p>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-800">
            <SlidersHorizontal className="h-5 w-5 text-slate-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Gratuito</h2>
            <p className="text-xs text-slate-400">Você insere os dados à mão</p>
          </div>
        </div>

        <FeatureList items={FREE_FEATURES} />
      </section>
    </main>
  )
}
