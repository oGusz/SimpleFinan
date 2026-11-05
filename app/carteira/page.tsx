'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ChevronRight, Target, Trophy } from 'lucide-react'
import { PageSkeleton } from '@/components/page-skeleton'
import PortfolioManager from '@/components/PortfolioManager'
import { RebalanceWidget } from '@/components/RebalanceWidget'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { MoneyInput } from '@/components/ui/money-input'
import { useToast } from '@/components/ui/toast'
import { useAppMode } from '@/context/AppModeContext'
import { usePortfolio } from '@/context/PortfolioContext'
import { formatBRL, formatPercent } from '@/lib/format'
import { totalValue } from '@/lib/portfolio-metrics'

// O gráfico do simulador é o maior peso da tela e fica no fim dela.
const FutureProjectionSimulator = dynamic(
  () => import('@/components/FutureProjectionSimulator').then((module) => module.FutureProjectionSimulator),
  {
    ssr: false,
    loading: () => (
      <div role="status" aria-label="Carregando simulador" className="h-96 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />
    ),
  },
)

const CARD_CLASS = 'rounded-2xl border border-slate-800 bg-slate-900/60 p-4'

function GoalCard({ total }: { total: number }) {
  const { goalAmount, updateGoal } = usePortfolio()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<number | null>(goalAmount)
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(goalAmount)
  }, [goalAmount])

  const handleBlur = async () => {
    focused.current = false
    setEditing(false)
    const previous = goalAmount
    const result = await updateGoal(draft)
    if (!result.ok) {
      setDraft(previous)
      toast({ message: result.error ?? 'Não foi possível salvar a meta. Tente de novo.', kind: 'error' })
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
  }

  if (goalAmount === null && !editing) {
    return (
      <section className={CARD_CLASS}>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => {
            setDraft(null)
            setEditing(true)
          }}
        >
          <Target aria-hidden="true" />
          Definir meta de patrimônio
        </Button>
      </section>
    )
  }

  const progress = goalAmount ? Math.min(100, (total / goalAmount) * 100) : null

  return (
    <section className={`${CARD_CLASS} flex flex-col gap-3`}>
      <Field label="Meta de patrimônio">
        {({ id, describedBy }) => (
          <MoneyInput
            id={id}
            aria-label="Meta de patrimônio em reais"
            aria-describedby={describedBy}
            value={draft}
            onValueChange={setDraft}
            autoFocus={editing}
            onFocus={() => {
              focused.current = true
            }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
        )}
      </Field>

      {progress !== null && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-slate-400">
              Atual: <strong className="font-semibold text-white">{formatBRL(total)}</strong>
            </span>
            <span className="flex items-center gap-1 font-semibold text-emerald-400">
              {progress >= 100 && <Trophy className="size-4 text-amber-400" aria-hidden="true" />}
              {progress >= 100 ? 'Meta atingida' : formatPercent(progress)}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Progresso da meta de patrimônio"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            className="h-2.5 w-full overflow-hidden rounded-full bg-slate-950"
          >
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </section>
  )
}

export default function CarteiraPage() {
  const { assets, isLoaded } = usePortfolio()
  const { isOpenFinance, isPremium, loading: modeLoading } = useAppMode()

  if (!isLoaded || modeLoading) return <PageSkeleton />

  // Assinante que escolheu o modo manual não está no plano gratuito.
  const modeLabel = isOpenFinance ? 'Open Finance' : isPremium ? 'Modo manual' : 'Plano Gratuito'

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28">
      <header className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-white">Minha carteira</h1>
        <span className="mt-1 shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
          {modeLabel}
        </span>
      </header>

      <GoalCard total={totalValue(assets)} />

      <PortfolioManager readOnly={isOpenFinance} />

      {assets.length > 0 && (
        <>
          <RebalanceWidget assets={assets} />
          <FutureProjectionSimulator assets={assets} />
        </>
      )}

      <nav aria-label="Mais sobre a carteira" className="flex flex-col divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/60 px-4">
        {[
          { href: '/fundos', label: 'Ver rentabilidade e índices' },
          { href: '/analises', label: 'Ver análises' },
        ].map(({ href, label }) => (
          <Link key={href} href={href} className="flex min-h-12 items-center justify-between gap-2 text-sm font-medium text-slate-200 hover:text-white">
            {label}
            <ChevronRight className="size-4 text-slate-400" aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </main>
  )
}
