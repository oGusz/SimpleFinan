'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ChevronRight, Newspaper } from 'lucide-react'

import { SummaryBar } from '@/components/summary-bar'
import { UpcomingPayments } from '@/components/upcoming-payments'
import { OnboardingChecklist } from '@/components/onboarding-checklist'
import { BillAlerts, monthComparisonFootnote, OpenFinanceOverview } from '@/components/home-insights'
import { FinancialGoalsSection } from '@/components/goals/FinancialGoalsSection'
import { MonthSelector } from '@/components/month-selector'
import { useQuickAdd } from '@/components/quick-add-provider'
import { Button } from '@/components/ui/button'

import { getDashboardData, type Bill, type DashboardData } from '@/app/actions/finance'
import { usePortfolio } from '@/context/PortfolioContext'
import { useAppMode } from '@/context/AppModeContext'
import { formatBRL, formatMonthYear } from '@/lib/format'
import { totalValue } from '@/lib/portfolio-metrics'
import { createClient } from '@/lib/supabase/client'

const NO_BILLS: Bill[] = []
const SKELETON_CLASS = 'animate-pulse rounded-2xl border border-slate-800/80 bg-slate-900/60'

interface UserProfile {
  name: string
  avatarUrl: string | null
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Carregando seu painel">
      <div className={`h-28 ${SKELETON_CLASS}`} />
      <div className={`h-14 ${SKELETON_CLASS}`} />
      <div className={`h-14 ${SKELETON_CLASS}`} />
      <div className={`h-14 ${SKELETON_CLASS}`} />
      <div className={`h-24 ${SKELETON_CLASS}`} />
      <div className={`h-16 ${SKELETON_CLASS}`} />
    </div>
  )
}

function BlockNotice({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-x-3 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-1 text-xs text-slate-300">
      <p className="py-2">{children}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 cursor-pointer font-semibold text-emerald-400"
        >
          Tentar de novo
        </button>
      )}
    </div>
  )
}

export default function Page() {
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date())
  const [userProfile, setUserProfile] = useState<UserProfile>({ name: '', avatarUrl: null })

  const { assets, isSynced, loadError, quotesFailed, reloadAssets } = usePortfolio()
  const { isPremium, isOpenFinance, mode, loading: modeLoading } = useAppMode()
  const { open: openQuickAdd } = useQuickAdd()

  const month = currentDate.getMonth() + 1
  const year = currentDate.getFullYear()
  const now = new Date()
  const isCurrentMonth = now.getMonth() + 1 === month && now.getFullYear() === year

  // Espera o plano carregar para não buscar duas vezes quem está no modo Open Finance.
  const dashboardKey = modeLoading ? null : ['dashboard', year, month, mode]
  const { data: shown, error: dashboardError, isValidating, mutate: refreshDashboard } = useSWR(
    dashboardKey,
    () => getDashboardData(month, year, mode),
    { keepPreviousData: true },
  )
  // Mesma entrada do cache, sem o mês anterior: diz se o que está em tela é mesmo deste mês.
  const { data: dataForMonth } = useSWR<DashboardData>(dashboardKey)
  const showingOtherMonth = Boolean(shown) && dataForMonth === undefined
  // Se a troca de mês falhar, o mês anterior não pode continuar na tela como se fosse o escolhido.
  const dashboard = dashboardError && showingOtherMonth ? undefined : shown
  const dimClass = `transition-opacity ${showingOtherMonth && isValidating ? 'opacity-60' : ''}`

  const bills = dashboard?.bills ?? NO_BILLS
  const attentionBills = dashboard?.attentionBills ?? NO_BILLS
  const next30Bills = dashboard?.next30Bills ?? NO_BILLS
  const goals = dashboard?.goals ?? null
  const history = dashboard?.history ?? null
  const openFinance = dashboard?.openFinance ?? null
  const failed = dashboard?.failed

  useEffect(() => {
    async function fetchUserData() {
      // A sessão local basta para exibir nome e foto, sem esperar a rede.
      const {
        data: { session },
      } = await createClient().auth.getSession()
      const user = session?.user
      if (!user) return

      const metadata = user.user_metadata || {}
      setUserProfile({
        name: metadata.full_name || metadata.name || user.email?.split('@')[0] || '',
        avatarUrl: metadata.avatar_url || metadata.picture || null,
      })
    }

    fetchUserData()
  }, [])

  // Resumo e alertas acompanham a lista na hora; a resposta do banco confirma ou corrige logo depois.
  const applyBillStatus = (billId: string, paid: boolean) => {
    const status: Bill['status'] = paid ? 'paid' : 'pending'
    const withStatus = (items: Bill[]) => items.map((bill) => (bill.id === billId ? { ...bill, status } : bill))
    void refreshDashboard(
      (current) =>
        current && {
          ...current,
          bills: withStatus(current.bills),
          attentionBills: paid ? current.attentionBills.filter((bill) => bill.id !== billId) : current.attentionBills,
        },
      { revalidate: false },
    )
  }

  // Atrasadas de outros meses entram na lista do mês atual: é para ela que o alerta aponta.
  const listBills = useMemo(() => {
    if (!isCurrentMonth) return bills
    const ids = new Set(bills.map((bill) => bill.id))
    return [...attentionBills.filter((bill) => !ids.has(bill.id)), ...bills]
  }, [isCurrentMonth, bills, attentionBills])

  const firstName = userProfile.name.trim().split(' ')[0]
  const monthName = formatMonthYear(year, month).split(' de ')[0]

  // Uma falha de leitura da carteira mostra o cache do aparelho, com aviso, em vez de carregar sem fim.
  const patrimonio = isSynced || (loadError && assets.length > 0) ? totalValue(assets) : null

  // No Open Finance o histórico vem do extrato, e não das contas cadastradas.
  const hasBills =
    bills.length > 0 ||
    attentionBills.length > 0 ||
    next30Bills.length > 0 ||
    (!isOpenFinance && (history?.length ?? 0) > 0)
  const hasBanks = Boolean(openFinance?.hasAccounts)
  const hasGoals = (goals?.length ?? 0) > 0
  const hasDashboardContent = hasBills || hasGoals || hasBanks || (history?.length ?? 0) > 0
  const everythingLoaded =
    Boolean(dashboard) && !failed?.history && !failed?.goals && !failed?.openFinance && isSynced && !loadError

  const isNewAccount = everythingLoaded && !hasDashboardContent && assets.length === 0
  // Sem nada nas contas, a resposta da carteira é que decide entre o painel e as boas-vindas.
  const waitingPortfolio = Boolean(dashboard) && !hasDashboardContent && !isSynced && !loadError

  const footnote = showingOtherMonth
    ? undefined
    : monthComparisonFootnote({ isOpenFinance, history, openFinance, month, year, isCurrentMonth })

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28">
      <header className="flex items-center gap-3">
        {userProfile.avatarUrl ? (
          <img
            src={userProfile.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="size-11 rounded-full border-2 border-emerald-500/30 object-cover shadow-sm"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex size-11 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-sm font-semibold text-slate-300"
          >
            {firstName[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-tight text-white">
            {firstName ? `Olá, ${firstName}` : 'Olá'}
          </h1>
          <p className="text-xs text-slate-400">Que bom ter você por aqui</p>
        </div>
        <Link
          href="/noticias"
          aria-label="Notícias das suas empresas"
          className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white"
        >
          <Newspaper className="size-5" aria-hidden="true" />
        </Link>
      </header>

      {dashboardError && !dashboard ? (
        <>
          {/* Sem isto, quem foi a um mês que falhou ficaria preso nele até a rede voltar. */}
          {shown && <MonthSelector currentDate={currentDate} onChangeDate={setCurrentDate} />}
          <section role="alert" className="space-y-1 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
            <p className="text-sm text-rose-100">Não foi possível carregar seus dados.</p>
            <Button type="button" onClick={() => refreshDashboard()} disabled={isValidating} className="mt-2 w-full">
              {isValidating ? 'Tentando...' : 'Tentar novamente'}
            </Button>
          </section>
        </>
      ) : !dashboard || waitingPortfolio ? (
        <DashboardSkeleton />
      ) : isNewAccount ? (
        <>
          <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
            <h2 className="text-base font-bold text-white">Boas-vindas ao SimpleFinan</h2>
            <p className="mt-1 text-sm text-slate-300">
              Conforme você adiciona seus dados, este painel passa a mostrar o que há para pagar e quanto você tem investido.
            </p>
          </section>
          <OnboardingChecklist
            hasBills={false}
            hasGoals={false}
            hasAssets={false}
            hasBanks={false}
            isOpenFinance={isOpenFinance}
            isPremium={isPremium}
            force
          />
        </>
      ) : (
        <>
          {dashboardError && (
            <BlockNotice onRetry={() => refreshDashboard()}>
              Mostrando dados salvos; não foi possível atualizar
            </BlockNotice>
          )}

          <section
            aria-busy={showingOtherMonth}
            className={`rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 ${dimClass}`}
          >
            <SummaryBar bills={bills} patrimonio={patrimonio} footnote={footnote} />
          </section>

          <BillAlerts
            bills={attentionBills}
            onNavigate={() => {
              if (!isCurrentMonth) setCurrentDate(new Date())
            }}
          />

          {everythingLoaded && (
            <OnboardingChecklist
              hasBills={hasBills}
              hasGoals={hasGoals}
              hasAssets={assets.length > 0}
              hasBanks={hasBanks}
              isOpenFinance={isOpenFinance}
              isPremium={isPremium}
            />
          )}

          {failed?.openFinance && <BlockNotice onRetry={() => refreshDashboard()}>Não foi possível carregar os dados dos seus bancos.</BlockNotice>}
          {openFinance && (
            <div className={dimClass}>
              <OpenFinanceOverview summary={openFinance} />
            </div>
          )}

          {/* O '+' central não existe no Open Finance: a conta a pagar precisa de um caminho aqui. */}
          {isOpenFinance && (
            <div className="grid grid-cols-2 gap-2.5">
              <Button type="button" onClick={() => openQuickAdd('bill')} className="w-full">
                Nova conta a pagar
              </Button>
              <Link
                href="/open-finance"
                className="flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-2 text-center text-sm font-medium text-slate-100"
              >
                Atualizar bancos
              </Link>
            </div>
          )}

          <section
            id="contas"
            aria-busy={showingOtherMonth}
            className={`scroll-mt-4 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 ${dimClass}`}
          >
            <UpcomingPayments
              bills={listBills}
              onStatusChange={() => refreshDashboard()}
              onOptimisticStatus={applyBillStatus}
              loading={showingOtherMonth && isValidating}
              limit={3}
              title={`Contas de ${monthName}`}
              headerSlot={<MonthSelector currentDate={currentDate} onChangeDate={setCurrentDate} />}
            />
          </section>

          {goals === null ? (
            <BlockNotice onRetry={() => refreshDashboard()}>Não foi possível carregar suas metas.</BlockNotice>
          ) : (
            <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
              <FinancialGoalsSection goals={goals} onRefresh={() => refreshDashboard()} compact />
            </section>
          )}

          <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 px-4 py-1">
            <Link href="/carteira" className="flex min-h-11 items-center justify-between gap-3 py-2">
              <span className="min-w-0 text-sm text-slate-300">Patrimônio em investimentos</span>
              <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-white">
                {formatBRL(patrimonio)}
                <ChevronRight className="size-4 text-slate-400" aria-hidden="true" />
              </span>
            </Link>
            {quotesFailed && patrimonio !== null && (
              <p className="pb-2 text-xs text-slate-400">Algumas cotações não foram atualizadas agora.</p>
            )}
            <Link
              href="/analises"
              className="flex min-h-11 items-center border-t border-slate-800/80 text-sm font-semibold text-emerald-400"
            >
              Ver análises
            </Link>
          </section>

          {loadError && (
            <BlockNotice onRetry={reloadAssets}>
              {assets.length > 0
                ? 'Carteira salva neste aparelho; não foi possível atualizar.'
                : 'Não foi possível carregar sua carteira.'}
            </BlockNotice>
          )}
        </>
      )}
    </main>
  )
}
