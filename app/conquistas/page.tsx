'use client'

import { useEffect, useState } from 'react'
import { CircleCheck, Flag, Lock } from 'lucide-react'

import { setAchievementPush } from '@/app/actions/gamification'
import { BackButton } from '@/components/back-button'
import { AchievementIcon, useGamification } from '@/components/gamification-data'
import { useToast } from '@/components/ui/toast'
import { formatBRL } from '@/lib/format'
import type { AchievementView } from '@/lib/gamification'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

// O desbloqueio é gravado em UTC: à noite, o dia no Brasil ainda é o anterior.
const UNLOCK_DATE = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' })

function Bar({ pct, className = 'bg-emerald-500' }: { pct: number; className?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
      <div className={cn('h-full rounded-full', className)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}

function AchievementTile({ achievement }: { achievement: AchievementView }) {
  const unlocked = Boolean(achievement.unlockedAt)
  const progress = achievement.progress
  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-2xl border p-3',
        unlocked ? 'border-emerald-500/30 bg-emerald-500/[0.07]' : 'border-slate-800/80 bg-slate-900/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full',
            unlocked ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-500',
          )}
        >
          {unlocked ? <AchievementIcon name={achievement.icon} className="size-5" /> : <Lock className="size-4" aria-hidden="true" />}
        </span>
        <span className={cn('text-xs font-semibold tabular-nums', unlocked ? 'text-emerald-300' : 'text-slate-400')}>
          +{achievement.points}
        </span>
      </div>
      <div className="min-w-0">
        <h3 className={cn('text-sm font-semibold', unlocked ? 'text-white' : 'text-slate-300')}>
          {achievement.title}
          <span className="sr-only">{unlocked ? ' (conquistada)' : ' (bloqueada)'}</span>
        </h3>
        <p className="text-xs text-slate-400">{unlocked ? achievement.description : achievement.hint}</p>
      </div>
      {unlocked && achievement.unlockedAt ? (
        <p className="mt-auto text-xs text-emerald-200/80">Em {UNLOCK_DATE.format(new Date(achievement.unlockedAt))}</p>
      ) : progress ? (
        <div className="mt-auto space-y-1">
          <Bar pct={(progress.current / progress.target) * 100} className="bg-slate-500" />
          <p className="text-xs tabular-nums text-slate-400">
            {progress.current} de {progress.target}
          </p>
        </div>
      ) : null}
    </li>
  )
}

export default function ConquistasPage() {
  const { data, error, mutate } = useGamification()
  const { toast } = useToast()
  const [pushOn, setPushOn] = useState<boolean | null>(null)

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data: session }) => setPushOn(session.session?.user.user_metadata?.push_achievements !== false))
  }, [])

  const togglePush = async () => {
    const next = !pushOn
    setPushOn(next)
    const result = await setAchievementPush(next).catch(() => null)
    if (!result?.success) {
      setPushOn(!next)
      toast({ message: 'Não foi possível salvar a preferência.', kind: 'error' })
    }
  }

  const unlockedCount = data?.status === 'ok' ? data.achievements.filter((item) => item.unlockedAt).length : 0

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28">
      <header className="flex items-start gap-2">
        <BackButton fallbackHref="/" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-400">Seus hábitos em pontos</p>
          <h1 className="text-2xl font-bold tracking-tight text-white">Conquistas</h1>
        </div>
      </header>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-sm text-amber-200">Não foi possível carregar suas conquistas.</p>
          <button type="button" onClick={() => mutate()} className="min-h-11 cursor-pointer text-sm font-semibold text-amber-100 underline underline-offset-2">
            Tentar de novo
          </button>
        </div>
      ) : !data ? (
        <div aria-busy="true" className="space-y-3">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-32 animate-pulse rounded-2xl border border-slate-800/80 bg-slate-900/60" />
          ))}
        </div>
      ) : data.status === 'unavailable' ? (
        <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
          <p className="text-sm text-slate-300">As conquistas estarão disponíveis em breve.</p>
        </section>
      ) : (
        <>
          <section aria-labelledby="nivel-titulo" className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-300">Nível {data.level.index}</p>
                <h2 id="nivel-titulo" className="text-xl font-bold text-white">
                  {data.level.name}
                </h2>
              </div>
              <p className="shrink-0 text-right">
                <span className="block text-xl font-bold tabular-nums text-white">{data.points}</span>
                <span className="text-xs text-slate-400">pontos</span>
              </p>
            </div>
            <Bar pct={data.level.pct} />
            <p className="text-xs text-slate-300">
              {data.level.nextMin !== null && data.level.nextName
                ? `Faltam ${data.level.nextMin - data.points} pontos para ${data.level.nextName}.`
                : 'Você chegou ao nível máximo.'}
            </p>
          </section>

          <section aria-labelledby="desafio-titulo" className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <Flag className="mt-0.5 size-4 shrink-0 text-sky-300" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-400">Desafio do mês</p>
                  <h2 id="desafio-titulo" className="text-sm font-semibold text-white">
                    {data.challenge.title}
                  </h2>
                </div>
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-sky-300">+{data.challenge.points}</span>
            </div>
            <p className="text-sm text-slate-300">{data.challenge.description}</p>
            {data.challenge.done ? (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
                <CircleCheck className="size-4" aria-hidden="true" />
                Concluído
              </p>
            ) : data.challenge.applicable ? (
              <div className="space-y-1">
                <Bar pct={data.challenge.target > 0 ? (data.challenge.current / data.challenge.target) * 100 : 0} className="bg-sky-500/80" />
                <p className="text-xs tabular-nums text-slate-400">
                  {data.challenge.money
                    ? `${formatBRL(data.challenge.current)} de ${formatBRL(data.challenge.target)}`
                    : `${data.challenge.current} de ${data.challenge.target}`}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-400">{data.challenge.hint}</p>
            )}
            <p className="text-xs text-slate-500">Todo mês tem um desafio novo.</p>
          </section>

          <section aria-labelledby="selos-titulo" className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="selos-titulo" className="text-sm font-semibold text-white">
                Selos
              </h2>
              <p className="text-xs tabular-nums text-slate-400">
                {unlockedCount} de {data.achievements.length}
              </p>
            </div>
            <ul className="grid grid-cols-2 gap-2.5">
              {data.achievements.map((achievement) => (
                <AchievementTile key={achievement.code} achievement={achievement} />
              ))}
            </ul>
          </section>

          <section className="flex items-start justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
            <div>
              <h2 id="push-conquistas-label" className="text-sm font-semibold text-white">
                Avisar no celular
              </h2>
              <p className="text-xs text-slate-400">Notificação no app do celular quando você ganhar uma conquista.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={pushOn ?? false}
              aria-labelledby="push-conquistas-label"
              disabled={pushOn === null}
              onClick={togglePush}
              className={cn(
                'relative mt-1 h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-50',
                pushOn ? 'bg-emerald-500' : 'bg-slate-700',
              )}
            >
              <span className={cn('absolute top-1 left-0 size-5 rounded-full bg-white transition-transform', pushOn ? 'translate-x-6' : 'translate-x-1')} />
            </button>
          </section>

          <p className="text-xs text-slate-400">Os pontos premiam hábitos de organização. Nada aqui é recomendação de investimento.</p>
        </>
      )}
    </main>
  )
}
