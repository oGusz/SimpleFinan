'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Crown, ExternalLink, Newspaper, Plus } from 'lucide-react'

import { BackButton } from '@/components/back-button'
import { useQuickAdd } from '@/components/quick-add-provider'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { usePortfolio } from '@/context/PortfolioContext'
import { todayInBrazil } from '@/lib/finance-insights'
import { formatDate, plural } from '@/lib/format'
import { NEWS_CATEGORY_LABELS, type NewsItem, type NewsResponse } from '@/lib/news'
import { isExchangeTicker } from '@/lib/tickers'
import { cn } from '@/lib/utils'

type Scope = 'mine' | 'market'

const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'Fato Relevante', label: 'Fatos relevantes' },
  { value: 'Aviso aos Acionistas', label: 'Avisos e proventos' },
  { value: 'Comunicado ao Mercado', label: 'Comunicados' },
] as const

const CATEGORY_STYLE: Record<string, string> = {
  'Fato Relevante': 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  'Aviso aos Acionistas': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  'Comunicado ao Mercado': 'border-sky-500/40 bg-sky-500/10 text-sky-200',
}

const fetchNews = async ([, scope, tickers]: [string, Scope, string]): Promise<NewsResponse> => {
  const response = await fetch(`/api/news?scope=${scope}&tickers=${encodeURIComponent(tickers)}`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

function dayLabel(iso: string, today: string, yesterday: string) {
  if (iso === today) return 'Hoje'
  if (iso === yesterday) return 'Ontem'
  return formatDate(iso, { withYear: iso.slice(0, 4) !== today.slice(0, 4) })
}

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <li className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold', CATEGORY_STYLE[item.category] ?? 'border-slate-700 text-slate-300')}>
          {NEWS_CATEGORY_LABELS[item.category] ?? item.category}
        </span>
        {item.tickers.map((ticker) => (
          <span key={ticker} className="rounded-md bg-slate-800 px-1.5 py-0.5 text-xs font-semibold text-slate-200">
            {ticker}
          </span>
        ))}
      </div>
      <p title={item.subject} className="mt-2 line-clamp-4 text-sm font-semibold leading-snug text-white">{item.subject}</p>
      <p className="mt-0.5 truncate text-xs text-slate-400">{item.company}</p>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-emerald-400"
      >
        Ler documento na CVM
        <ExternalLink className="size-4" aria-hidden="true" />
        <span className="sr-only">(abre em outra janela)</span>
      </a>
    </li>
  )
}

export default function NoticiasPage() {
  const [scope, setScope] = useState<Scope>('mine')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('all')
  const { assets, isLoaded } = usePortfolio()
  const { open: openQuickAdd } = useQuickAdd()

  const tickers = useMemo(
    () => [...new Set(assets.map((asset) => asset.ticker.toUpperCase()).filter(isExchangeTicker))].sort().join(','),
    [assets],
  )
  const waitingAssets = scope === 'mine' && !isLoaded
  const { data, error, isLoading, mutate } = useSWR(waitingAssets ? null : ['news', scope, tickers], fetchNews, {
    revalidateOnFocus: false,
  })

  const [today, yesterday] = useMemo(() => {
    const current = todayInBrazil()
    const date = new Date(`${current}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate() - 1)
    return [current, date.toISOString().slice(0, 10)]
  }, [])

  const groups = useMemo(() => {
    const items = (data?.items ?? []).filter((item) => filter === 'all' || item.category === filter)
    const byDay = new Map<string, NewsItem[]>()
    for (const item of items) byDay.set(item.delivered_on, [...(byDay.get(item.delivered_on) ?? []), item])
    return [...byDay.entries()]
  }, [data, filter])

  const noExchangeAssets = scope === 'mine' && isLoaded && tickers === ''
  const loading = waitingAssets || (isLoading && !data)

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28">
      <header className="flex items-start gap-2">
        <BackButton fallbackHref="/" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-400">Comunicados oficiais das empresas</p>
          <h1 className="text-2xl font-bold tracking-tight text-white">Notícias</h1>
        </div>
      </header>

      <div role="tablist" aria-label="Origem das notícias" className="grid grid-cols-2 rounded-xl border border-slate-800 bg-slate-950/60 p-0.5">
        {(
          [
            ['mine', 'Seus ativos'],
            ['market', 'Mercado'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={scope === value}
            onClick={() => setScope(value)}
            className={cn(
              'min-h-11 cursor-pointer rounded-lg text-sm font-semibold',
              scope === value ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-400">
        {scope === 'mine'
          ? 'Fatos relevantes, comunicados e avisos aos acionistas das empresas da sua carteira nos últimos 90 dias.'
          : 'Fatos relevantes de todas as empresas da bolsa nos últimos 7 dias.'}
      </p>

      {scope === 'mine' && !noExchangeAssets && (
        <div role="group" aria-label="Tipo de comunicado" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                'min-h-11 shrink-0 cursor-pointer rounded-full border px-4 text-sm font-semibold',
                filter === option.value
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {noExchangeAssets ? (
        <EmptyState
          icon={Newspaper}
          title="Nenhuma ação na carteira"
          description="Adicione ações da bolsa para acompanhar os comunicados dessas empresas. Fundos imobiliários não publicam comunicados nesta base da CVM."
          actionLabel="Adicionar investimento"
          onAction={() => openQuickAdd('asset')}
        />
      ) : loading ? (
        <ul aria-busy="true" className="space-y-3">
          {[0, 1, 2].map((key) => (
            <li key={key} className="h-32 animate-pulse rounded-2xl border border-slate-800/80 bg-slate-900/60" />
          ))}
        </ul>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-sm text-amber-200">Não foi possível carregar as notícias.</p>
          <button type="button" onClick={() => mutate()} className="min-h-11 cursor-pointer text-sm font-semibold text-amber-100 underline underline-offset-2">
            Tentar de novo
          </button>
        </div>
      ) : data?.status === 'unavailable' ? (
        <EmptyState
          icon={Newspaper}
          title="As notícias ainda não estão disponíveis"
          description="Os comunicados da CVM são atualizados uma vez por dia. Volte mais tarde."
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title={filter === 'all' ? 'Nenhum comunicado no período' : 'Nenhum comunicado deste tipo'}
          description={
            scope === 'mine'
              ? 'As empresas da sua carteira não publicaram comunicados no período.'
              : 'Nenhuma empresa publicou fato relevante nos últimos 7 dias.'
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map(([day, items]) => (
            <section key={day} aria-label={dayLabel(day, today, yesterday)}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{dayLabel(day, today, yesterday)}</h2>
              <ul className="space-y-3">
                {items.map((item) => (
                  <NewsCard key={item.protocol} item={item} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {data && data.locked > 0 && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4">
          <div className="flex items-center gap-2">
            <Crown className="size-5 text-emerald-300" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">
              Mais {plural(data.locked, 'comunicado', 'comunicados')} no Premium
            </h2>
          </div>
          <p className="mt-1 text-sm text-slate-300">
            Veja todos os comunicados das suas empresas e os fatos relevantes do mercado inteiro.
          </p>
          <Link href="/planos" className={buttonVariants({ className: 'mt-3 w-full' })}>
            Conhecer o Premium
          </Link>
        </section>
      )}

      {scope === 'mine' && !noExchangeAssets && (
        <button
          type="button"
          onClick={() => openQuickAdd('asset')}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 self-start text-sm font-semibold text-emerald-400"
        >
          <Plus className="size-4" aria-hidden="true" />
          Acompanhar outra empresa
        </button>
      )}

      <p className="text-xs text-slate-400">
        Fonte: Comissão de Valores Mobiliários (CVM), dados abertos, atualizados uma vez por dia. O SimpleFinan mostra o
        assunto e o link do documento original, sem resumo nem opinião.
      </p>
    </main>
  )
}
