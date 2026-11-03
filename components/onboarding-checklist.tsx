'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, X } from 'lucide-react'
import { track } from '@/lib/analytics'

const DISMISSED_KEY = '@simplefinan:onboarding-dismissed'

interface Props {
  hasBills: boolean
  hasGoals: boolean
  hasAssets: boolean
  isPremium: boolean
}

export function OnboardingChecklist({ hasBills, hasGoals, hasAssets, isPremium }: Props) {
  // Começa oculto para não piscar o cartão em quem já o dispensou.
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true')
  }, [])

  const steps = [
    { label: 'Cadastre sua primeira conta', hint: 'Use o botão de nova conta, logo acima.', done: hasBills, href: null },
    { label: 'Crie uma meta financeira', hint: 'Reserva, viagem ou o que quiser.', done: hasGoals, href: '/metas' },
    { label: 'Adicione um investimento', hint: 'Acompanhe sua carteira em um só lugar.', done: hasAssets, href: '/carteira' },
    { label: 'Conheça o Premium', hint: 'Importe extrato e saldos dos seus bancos.', done: isPremium, href: '/planos' },
  ]
  const completed = steps.filter((step) => step.done).length

  if (dismissed || completed === steps.length) return null

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setDismissed(true)
    track('onboarding_dismissed', { completed })
  }

  return (
    <section className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white">Comece por aqui</h2>
          <p className="text-[11px] text-slate-400">{completed} de {steps.length} passos concluídos</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dispensar primeiros passos"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="space-y-2">
        {steps.map((step) => {
          const content = (
            <>
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  step.done ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-700'
                }`}
              >
                {step.done && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span>
                <span className={`block text-xs font-medium ${step.done ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                  {step.label}
                </span>
                {!step.done && <span className="block text-[11px] text-slate-500">{step.hint}</span>}
              </span>
            </>
          )

          return (
            <li key={step.label}>
              {step.href && !step.done ? (
                <Link href={step.href} className="flex items-start gap-2.5">{content}</Link>
              ) : (
                <div className="flex items-start gap-2.5">{content}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
