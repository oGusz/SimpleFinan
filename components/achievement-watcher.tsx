'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'

import { markGamificationSeen } from '@/app/actions/gamification'
import { isRouteWithoutNav } from '@/components/bottom-nav'
import { useGamification } from '@/components/gamification-data'
import { track } from '@/lib/analytics'
import type { UnseenItem } from '@/lib/gamification'

const VISIBLE_MS = 6000

const keyOf = (item: UnseenItem) => `${item.kind}:${item.code}`

function message(items: UnseenItem[]) {
  if (items.length === 1) {
    const [item] = items
    return { title: item.kind === 'challenge' ? 'Desafio do mês concluído' : 'Conquista desbloqueada', body: item.title }
  }
  return { title: `${items.length} conquistas novas`, body: items.map((item) => item.title).join(', ') }
}

/** Mostra uma vez cada conquista nova, venha ela do app ou da rotina diária, e marca como vista. */
export function AchievementWatcher() {
  const pathname = usePathname()
  const hidden = isRouteWithoutNav(pathname)
  const { data, mutate } = useGamification(!hidden)
  const [items, setItems] = useState<UnseenItem[]>([])
  const shown = useRef(new Set<string>())

  useEffect(() => {
    if (data?.status !== 'ok') return
    const fresh = data.unseen.filter((item) => !shown.current.has(keyOf(item)))
    if (fresh.length === 0) return
    for (const item of fresh) {
      shown.current.add(keyOf(item))
      track('achievement_unlocked', { kind: item.kind, code: item.kind === 'challenge' ? 'desafio_do_mes' : item.code })
    }
    setItems(fresh)
    // Marca já: se a pessoa sair da tela antes de o aviso sumir, ele não volta.
    void markGamificationSeen(fresh.map(({ kind, code }) => ({ kind, code }))).catch(() => undefined)
    void mutate((current) => (current?.status === 'ok' ? { ...current, unseen: [] } : current), { revalidate: false })
  }, [data, mutate])

  useEffect(() => {
    if (items.length === 0) return
    const timer = setTimeout(() => setItems([]), VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [items])

  const points = items.reduce((sum, item) => sum + item.points, 0)
  const text = items.length > 0 ? message(items) : null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-50 flex justify-center px-4"
    >
      <AnimatePresence>
        {!hidden && text && (
          <motion.div
            key={items.map(keyOf).join('|')}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-emerald-500/40 bg-slate-900/95 p-3 shadow-xl shadow-emerald-950/40 backdrop-blur"
          >
            <motion.span
              initial={{ rotate: -20, scale: 0.6 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 12, delay: 0.1 }}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300"
            >
              <Sparkles className="size-5" aria-hidden="true" />
            </motion.span>
            <Link href="/conquistas" onClick={() => setItems([])} className="min-h-11 min-w-0 flex-1 py-0.5">
              <span className="block text-sm font-semibold text-white">{text.title}</span>
              <span className="block truncate text-xs text-slate-300">
                {text.body} · <span className="font-semibold text-emerald-300">+{points} pontos</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setItems([])}
              aria-label="Fechar aviso de conquista"
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:text-slate-200"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
