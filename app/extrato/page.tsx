'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowDownLeft, ArrowUpRight, Crown, Receipt } from 'lucide-react'

import { getConnectedBanks, getTransactions } from '@/app/actions/pluggy'
import { BackButton } from '@/components/back-button'
import { MonthSelector } from '@/components/month-selector'
import { SkeletonCards } from '@/components/page-skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useAppMode, type SubscriptionInfo } from '@/context/AppModeContext'
import { summarizeTransactions } from '@/lib/finance-insights'
import { formatBRL, formatDate } from '@/lib/format'

// Igual ao alcance da importação em lib/pluggy/server.ts, que não pode ser importado no cliente.
const IMPORT_WINDOW_DAYS = 90

const monthIndex = (year: number, month: number) => year * 12 + month

/** Só com Premium que já terminou: sem data, ou para quem nunca assinou, não há o que afirmar. */
function endedPlanMessage(subscription: SubscriptionInfo | null) {
  const end = subscription?.currentPeriodEnd
  if (subscription?.plan !== 'premium' || !end || new Date(end).getTime() > Date.now()) return null
  const what = subscription.provider === 'trial' ? 'Seu teste terminou' : 'Seu Premium terminou'
  return `${what} em ${formatDate(end)}; seus dados continuam guardados`
}

interface BankInfo {
  created_at: string
  last_synced_at: string | null
}

function emptyMonthContent(year: number, month: number, today: Date, banks: BankInfo[] | null) {
  if (monthIndex(year, month) > monthIndex(today.getFullYear(), today.getMonth() + 1)) {
    return { title: 'Este mês ainda não começou', description: 'As transações aparecem aqui conforme acontecem.' }
  }

  const toBanks = { actionLabel: 'Ver meus bancos', href: '/open-finance' }

  // A lista de bancos falhou: não dá para dizer que não há banco.
  if (!banks) {
    return { title: 'Nenhuma transação neste mês', description: 'Importamos os últimos 90 dias a partir da conexão.', ...toBanks }
  }

  if (banks.length === 0) {
    return {
      title: 'Nenhum banco conectado',
      description: 'Conecte um banco para ver seu extrato e seus gastos aqui.',
      actionLabel: 'Conectar banco',
      href: '/open-finance',
    }
  }

  const firstConnection = Math.min(...banks.map((bank) => new Date(bank.created_at).getTime()))
  const windowStart = firstConnection - IMPORT_WINDOW_DAYS * 86_400_000
  if (Date.UTC(year, month, 0, 23, 59, 59) < windowStart) {
    return { title: 'Mês fora do período importado', description: 'Importamos os últimos 90 dias a partir da conexão.' }
  }

  if (banks.every((bank) => !bank.last_synced_at)) {
    return { title: 'Dados ainda não importados', description: 'Confira o andamento na tela de bancos.', ...toBanks }
  }

  return { title: 'Nenhuma transação neste mês', description: 'Não encontramos movimentações nos bancos conectados.' }
}

export default function ExtratoPage() {
  const { isPremium, loading: planLoading, subscription, subscriptionError, reloadSubscription } = useAppMode()
  const [today] = useState(() => new Date())
  const [currentDate, setCurrentDate] = useState(today)
  const month = currentDate.getMonth() + 1
  const year = currentDate.getFullYear()

  // A resposta leva o mês junto: keepPreviousData também devolve o mês anterior quando este falha.
  const { data, error, isValidating, mutate } = useSWR(
    isPremium ? ['transactions', year, month] : null,
    async () => ({ year, month, rows: await getTransactions(month, year) }),
    { keepPreviousData: true },
  )
  const { data: banksData, isLoading: banksLoading } = useSWR(
    isPremium ? ['connected-banks'] : null,
    () => getConnectedBanks(),
  )

  const isCurrentData = data?.year === year && data?.month === month
  const isSwitchingMonth = Boolean(data) && !isCurrentData && isValidating
  const transactions = data?.rows

  const summary = useMemo(() => summarizeTransactions(transactions ?? []), [transactions])

  const banks = banksData && !banksData.error ? (banksData.banks as BankInfo[]) : null
  const endedMessage = endedPlanMessage(subscription)

  const renderMonth = () => {
    if (error && !isCurrentData) {
      return (
        <section role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6 text-center">
          <p className="text-sm text-rose-300">Não foi possível carregar o extrato.</p>
          <button
            type="button"
            onClick={() => mutate()}
            disabled={isValidating}
            className="mt-2 h-11 cursor-pointer rounded-xl px-4 text-sm font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
          >
            Tentar novamente
          </button>
        </section>
      )
    }

    const nothingToShowYet = !data || (isSwitchingMonth && !transactions?.length)
    if (nothingToShowYet) return <SkeletonCards />

    if (!transactions?.length) {
      if (banksLoading) return <SkeletonCards />
      return <EmptyState icon={Receipt} {...emptyMonthContent(year, month, today, banks)} />
    }

    return (
      <div
        aria-busy={isSwitchingMonth}
        className={`flex flex-col gap-5 transition-opacity ${isSwitchingMonth ? 'opacity-50' : ''}`}
      >
        {error && (
          <div role="alert" className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 py-1 pr-1 pl-3.5">
            <p className="text-xs text-rose-300">Não foi possível atualizar. Estes são os últimos dados carregados.</p>
            <button
              type="button"
              onClick={() => mutate()}
              disabled={isValidating}
              className="h-11 shrink-0 cursor-pointer rounded-lg px-3 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
            >
              Tentar novamente
            </button>
          </div>
        )}

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
            <p className="flex items-center gap-1 text-xs text-slate-400">
              <ArrowDownLeft className="h-3 w-3 text-emerald-400" aria-hidden="true" /> Entradas
            </p>
            <p className="mt-1 text-sm font-bold text-emerald-400">{formatBRL(summary.income)}</p>
          </div>
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
            <p className="flex items-center gap-1 text-xs text-slate-400">
              <ArrowUpRight className="h-3 w-3 text-rose-400" aria-hidden="true" /> Saídas
            </p>
            <p className="mt-1 text-sm font-bold text-rose-400">{formatBRL(summary.expense)}</p>
          </div>
        </section>

        {summary.byCategory.length > 0 && (
          <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Gastos por categoria</h2>
            {summary.byCategory.map((item) => (
              <div key={item.category} className="space-y-1">
                <div className="flex justify-between gap-3 text-xs">
                  <span className="text-slate-200">{item.category}</span>
                  <span className="shrink-0 text-slate-400">{formatBRL(item.total)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${item.percent}%` }} />
                </div>
              </div>
            ))}
          </section>
        )}

        <section aria-label="Transações" className="rounded-2xl border border-slate-800/80 bg-slate-900/40 divide-y divide-slate-800/60">
          {transactions.map((transaction) => (
            <div key={transaction.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-200">{transaction.description || 'Sem descrição'}</p>
                <p className="text-xs text-slate-400">
                  {formatDate(transaction.date)} · {transaction.category || 'Outros'}
                </p>
              </div>
              <span className={`shrink-0 text-xs font-semibold ${transaction.type === 'CREDIT' ? 'text-emerald-400' : 'text-slate-200'}`}>
                {transaction.type === 'CREDIT' ? '+' : '-'} {formatBRL(Math.abs(Number(transaction.amount)))}
              </span>
            </div>
          ))}
        </section>
      </div>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28">
      <header className="flex items-center justify-between">
        <BackButton fallbackHref="/open-finance" />
        <h1 className="text-base font-bold text-white tracking-tight">Extrato e gastos</h1>
        <div className="w-11" />
      </header>

      {planLoading ? (
        <SkeletonCards />
      ) : !isPremium && subscriptionError ? (
        // O plano não pôde ser confirmado: oferecer assinatura aqui seria afirmar que não há plano.
        <section role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6 text-center">
          <p className="text-sm text-rose-300">Não foi possível confirmar seu plano.</p>
          <button
            type="button"
            onClick={() => reloadSubscription()}
            className="mt-2 h-11 cursor-pointer rounded-xl px-4 text-sm font-semibold text-rose-200 hover:bg-rose-500/10"
          >
            Tentar novamente
          </button>
        </section>
      ) : !isPremium ? (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-6 text-center space-y-3">
          <Crown className="mx-auto h-6 w-6 text-emerald-400" aria-hidden="true" />
          <h2 className="text-sm font-bold text-white">{endedMessage ?? 'Veja para onde vai seu dinheiro'}</h2>
          <p className="text-xs text-slate-400">
            {endedMessage
              ? 'Com o Premium ativo, você volta a ver o extrato e seus bancos voltam a atualizar.'
              : 'No Premium, o extrato dos seus bancos chega sozinho e os gastos já vêm separados por categoria.'}
          </p>
          <Link
            href="/planos"
            className="flex h-11 items-center justify-center rounded-xl bg-emerald-700 text-sm font-semibold text-white"
          >
            Ver planos
          </Link>
        </section>
      ) : (
        <>
          <div className="flex items-center justify-center">
            <MonthSelector currentDate={currentDate} onChangeDate={setCurrentDate} maxDate={today} />
          </div>
          {renderMonth()}
        </>
      )}
    </main>
  )
}
