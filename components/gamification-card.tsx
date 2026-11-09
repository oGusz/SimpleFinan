'use client'

import Link from 'next/link'
import { ChevronRight, Trophy } from 'lucide-react'

import { useGamification } from '@/components/gamification-data'
import { formatBRL } from '@/lib/format'

/** Resumo do nível e do desafio do mês no painel. Some enquanto carrega ou se não houver dados. */
export function GamificationCard() {
  const { data } = useGamification()
  if (data?.status !== 'ok') return null

  const { level, points, challenge } = data
  const amount = (value: number) => (challenge.money ? formatBRL(value) : String(value))
  const challengeLine = challenge.done
    ? `Desafio concluído: ${challenge.title}`
    : challenge.applicable
      ? `Desafio: ${challenge.title} · ${amount(challenge.current)} de ${amount(challenge.target)}`
      : `Desafio: ${challenge.title}`

  return (
    <Link
      href="/conquistas"
      className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 transition-colors hover:border-emerald-500/30"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
        <Trophy className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-white">
            Nível {level.index} · {level.name}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-slate-300">{points} pontos</span>
        </span>
        <span className="block h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
          <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${level.pct}%` }} />
        </span>
        <span className="block text-xs text-slate-400">{challengeLine}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
    </Link>
  )
}
