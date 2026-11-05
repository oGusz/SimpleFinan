'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronRight, X } from 'lucide-react'
import { useQuickAdd, type QuickAddKind } from '@/components/quick-add-provider'
import { track } from '@/lib/analytics'
import { safeGet, safeSet } from '@/lib/safe-storage'

const DISMISSED_KEY = '@simplefinan:onboarding-dismissed'
const PREMIUM_DISMISSED_KEY = '@simplefinan:onboarding-premium-dismissed'
const DONE_MESSAGE_MS = 5000

const DISMISS_CLASS =
  'flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:text-slate-200'
const STEP_CLASS = 'flex min-h-11 w-full items-center gap-2.5 rounded-lg py-1 text-left'

interface Props {
  hasBills: boolean
  hasGoals: boolean
  hasAssets: boolean
  hasBanks: boolean
  isOpenFinance: boolean
  isPremium: boolean
  /** Conta nova: o painel só tem isto para mostrar, então vale mesmo se foi dispensado antes. */
  force?: boolean
}

interface Step {
  label: string
  hint: string
  done: boolean
  kind?: QuickAddKind
  href?: string
}

export function OnboardingChecklist({
  hasBills,
  hasGoals,
  hasAssets,
  hasBanks,
  isOpenFinance,
  isPremium,
  force = false,
}: Props) {
  const { open } = useQuickAdd()
  // Começam ocultos para não piscar o cartão em quem já o dispensou.
  const [dismissed, setDismissed] = useState(true)
  const [premiumDismissed, setPremiumDismissed] = useState(true)
  const [justFinished, setJustFinished] = useState(false)

  useEffect(() => {
    setDismissed(safeGet(DISMISSED_KEY) === 'true')
    setPremiumDismissed(safeGet(PREMIUM_DISMISSED_KEY) === 'true')
  }, [])

  // No Open Finance a carteira vem dos bancos: o formulário de investimento não existe nesse modo.
  const steps: Step[] = [
    { label: 'Cadastre sua primeira conta a pagar', hint: 'Veja vencimentos e alertas em um só lugar.', done: hasBills, kind: 'bill' },
    { label: 'Crie uma meta financeira', hint: 'Reserva, viagem ou o que quiser.', done: hasGoals, kind: 'goal' },
    isOpenFinance
      ? { label: 'Conecte um banco', hint: 'Veja saldos e extrato no aplicativo.', done: hasBanks, href: '/open-finance' }
      : { label: 'Adicione um investimento', hint: 'Acompanhe sua carteira em um só lugar.', done: hasAssets, kind: 'asset' },
  ]
  const completed = steps.filter((step) => step.done).length
  const allDone = completed === steps.length

  const wasDone = useRef(allDone)
  useEffect(() => {
    if (allDone && !wasDone.current) {
      wasDone.current = true
      setJustFinished(true)
      const timer = setTimeout(() => setJustFinished(false), DONE_MESSAGE_MS)
      return () => clearTimeout(timer)
    }
    wasDone.current = allDone
  }, [allDone])

  const dismiss = () => {
    safeSet(DISMISSED_KEY, 'true')
    setDismissed(true)
    track('onboarding_dismissed', { completed })
  }

  const dismissPremium = () => {
    safeSet(PREMIUM_DISMISSED_KEY, 'true')
    setPremiumDismissed(true)
  }

  return (
    <>
      {justFinished && (
        <p role="status" className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 text-sm text-emerald-100">
          Primeiros passos concluídos.
        </p>
      )}

      {!allDone && (force || !dismissed) && (
        <section className="space-y-2 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white">Comece por aqui</h2>
              <p className="text-xs text-slate-400">{completed} de {steps.length} passos concluídos</p>
            </div>
            {!force && (
              <button type="button" onClick={dismiss} aria-label="Dispensar primeiros passos" className={DISMISS_CLASS}>
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <ul className="space-y-1">
            {steps.map((step) => {
              const content = (
                <>
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                      step.done ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-600'
                    }`}
                  >
                    {step.done && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-medium ${step.done ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
                      {step.label}
                      {step.done && <span className="sr-only"> (concluído)</span>}
                    </span>
                    {!step.done && <span className="block text-xs text-slate-400">{step.hint}</span>}
                  </span>
                  {!step.done && <ChevronRight className="size-4 shrink-0 text-emerald-400" aria-hidden="true" />}
                </>
              )

              return (
                <li key={step.label}>
                  {step.done ? (
                    <div className={STEP_CLASS}>{content}</div>
                  ) : step.kind ? (
                    <button
                      type="button"
                      onClick={() => open(step.kind as QuickAddKind)}
                      className={`${STEP_CLASS} cursor-pointer`}
                    >
                      {content}
                    </button>
                  ) : (
                    <Link href={step.href as string} className={STEP_CLASS}>
                      {content}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {allDone && !isPremium && !premiumDismissed && (
        <section className="flex items-center gap-2 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-white">Conheça o Premium</h2>
            <p className="text-xs text-slate-400">Importe extrato e saldos dos seus bancos.</p>
            <Link href="/planos" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-emerald-400">
              Ver planos
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <button type="button" onClick={dismissPremium} aria-label="Dispensar aviso do Premium" className={DISMISS_CLASS}>
            <X className="size-4" aria-hidden="true" />
          </button>
        </section>
      )}
    </>
  )
}
