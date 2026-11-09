'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  Building2,
  Crown,
  Loader2,
  PauseCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react'
import { mutate } from 'swr'

import {
  disconnectBank,
  getConnectedBanks,
  getSyncedAccounts,
  refreshBankStatus,
  requestBankRefresh,
} from '@/app/actions/pluggy'
import { BackButton } from '@/components/back-button'
import { OpenFinanceButton } from '@/components/open-finance-button'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { useAppMode } from '@/context/AppModeContext'
import { usePortfolio } from '@/context/PortfolioContext'
import { formatBRL, formatDateTime } from '@/lib/format'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConnectedBank {
  id: string
  item_id: string
  institution_name: string | null
  institution_logo: string | null
  status: string
  item_status: string | null
  error_message: string | null
  last_synced_at: string | null
  created_at: string
}

interface SyncedAccount {
  id: string
  item_id: string
  name: string | null
  type: string | null
  balance: number
  credit_limit: number | null
  currency_code: string | null
}

type RefreshState = 'requesting' | 'polling' | 'timeout'

const POLL_INTERVAL_MS = 5_000
const POLL_LIMIT_MS = 2 * 60_000

const LOAD_FAILED = 'Não foi possível carregar seus bancos.'
const REFRESH_FAILED = 'Não foi possível pedir a atualização ao banco. Tente de novo em instantes.'
const REFRESH_TIMEOUT = 'A atualização está demorando. Tente de novo mais tarde.'
const DISCONNECT_FAILED = 'Não foi possível desconectar o banco. Tente novamente.'

const OK_STATUSES = ['UPDATED', 'UPDATING']
// Nestes, uma nova coleta não resolve: só a pessoa consegue continuar, autorizando de novo.
const RECONNECT_ONLY_STATUSES = ['LOGIN_ERROR', 'WAITING_USER_INPUT', 'WAITING_USER_ACTION']

const PROBLEM_LABELS: Record<string, string> = {
  LOGIN_ERROR: 'Acesso expirado',
  WAITING_USER_INPUT: 'Ação necessária',
  WAITING_USER_ACTION: 'Ação necessária',
  OUTDATED: 'Desatualizado',
  ERROR: 'Falha na atualização',
}

const bankName = (bank: ConnectedBank) => bank.institution_name || 'Instituição'

const formatMoney = (value: number, currency: string | null) =>
  !currency || currency === 'BRL'
    ? formatBRL(Number(value))
    : Number(value).toLocaleString('pt-BR', { style: 'currency', currency })

function StatusBadge({ status, paused, timedOut }: { status: string | null; paused: boolean; timedOut: boolean }) {
  const base = 'flex shrink-0 items-center gap-1 text-xs font-medium'

  if (paused) {
    return (
      <span className={`${base} text-slate-400`}>
        <PauseCircle className="h-3 w-3" aria-hidden="true" />
        Atualização pausada
      </span>
    )
  }
  if (status === null) {
    return (
      <span className={`${base} text-slate-400`}>
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
        Status desconhecido
      </span>
    )
  }
  if (status === 'UPDATED') {
    return (
      <span className={`${base} text-emerald-400`}>
        <Wifi className="h-3 w-3" aria-hidden="true" />
        Ativo
      </span>
    )
  }
  if (status === 'UPDATING') {
    return (
      <span className={`${base} ${timedOut ? 'text-amber-400' : 'text-sky-400'}`}>
        {timedOut ? (
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
        ) : (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        )}
        {timedOut ? 'Atualização demorando' : 'Atualizando'}
      </span>
    )
  }
  return (
    <span className={`${base} text-amber-400`}>
      <AlertCircle className="h-3 w-3" aria-hidden="true" />
      {PROBLEM_LABELS[status] ?? 'Atenção'}
    </span>
  )
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function OpenFinancePage() {
  const { isPremium, loading: planLoading } = useAppMode()
  const { reloadAssets } = usePortfolio()
  const { toast } = useToast()

  const [banks, setBanks] = useState<ConnectedBank[]>([])
  const [accounts, setAccounts] = useState<SyncedAccount[]>([])
  const [loadingBanks, setLoadingBanks] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [refreshState, setRefreshState] = useState<Record<string, RefreshState>>({})

  const [disconnectTarget, setDisconnectTarget] = useState<ConnectedBank | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [disconnectError, setDisconnectError] = useState<string | null>(null)

  const loadRun = useRef(0)
  const pollTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const loadBanks = useCallback(async () => {
    const run = ++loadRun.current
    setLoadingBanks(true)
    try {
      const [banksResult, accountsResult] = await Promise.all([getConnectedBanks(), getSyncedAccounts()])
      if (run !== loadRun.current) return
      if (banksResult.error) {
        setLoadError(banksResult.error)
        return
      }
      setBanks(banksResult.banks as ConnectedBank[])
      setAccounts(accountsResult as SyncedAccount[])
      setLoadError(null)
    } catch (error) {
      console.error('Falha ao carregar bancos:', error)
      if (run === loadRun.current) setLoadError(LOAD_FAILED)
    } finally {
      if (run === loadRun.current) setLoadingBanks(false)
    }
  }, [])

  useEffect(() => {
    loadBanks()
  }, [loadBanks])

  // Tela inicial, extrato e carteira guardam os dados em cache: precisam saber da novidade.
  const refreshImportedData = useCallback(() => {
    mutate((key) => Array.isArray(key) && ['dashboard', 'transactions', 'connected-banks'].includes(key[0]))
    reloadAssets()
  }, [reloadAssets])

  const clearRefreshState = useCallback((itemId: string) => {
    setRefreshState(({ [itemId]: _removed, ...rest }) => rest)
  }, [])

  const stopPolling = useCallback((itemId: string) => {
    clearTimeout(pollTimers.current.get(itemId))
    pollTimers.current.delete(itemId)
  }, [])

  // Não depende só do webhook: sem ele, 'Atualizando' ficaria para sempre na tela.
  const startPolling = useCallback(
    (itemId: string, name: string) => {
      if (pollTimers.current.has(itemId)) return
      const deadline = Date.now() + POLL_LIMIT_MS

      const tick = async () => {
        const status = await refreshBankStatus(itemId).catch(() => null)
        // Sem a entrada, a tela saiu ou o banco foi desconectado durante a consulta.
        if (!pollTimers.current.has(itemId)) return

        if (status && status.itemStatus === null) {
          stopPolling(itemId)
          clearRefreshState(itemId)
          setErrorMsg(status.errorMessage ?? REFRESH_FAILED)
          return
        }

        if (status && status.itemStatus !== 'UPDATING') {
          stopPolling(itemId)
          clearRefreshState(itemId)
          setBanks((prev) =>
            prev.map((bank) =>
              bank.item_id === itemId
                ? {
                    ...bank,
                    item_status: status.itemStatus,
                    last_synced_at: status.lastSyncedAt,
                    error_message: status.errorMessage,
                  }
                : bank,
            ),
          )
          loadBanks()
          refreshImportedData()
          if (status.itemStatus === 'UPDATED' && !status.errorMessage) {
            toast({ kind: 'success', message: `${name} atualizado.` })
          }
          return
        }

        if (Date.now() >= deadline) {
          stopPolling(itemId)
          setRefreshState((prev) => ({ ...prev, [itemId]: 'timeout' }))
          setErrorMsg(REFRESH_TIMEOUT)
          return
        }

        pollTimers.current.set(itemId, setTimeout(tick, POLL_INTERVAL_MS))
      }

      pollTimers.current.set(itemId, setTimeout(tick, POLL_INTERVAL_MS))
    },
    [clearRefreshState, loadBanks, refreshImportedData, stopPolling, toast],
  )

  useEffect(() => {
    const timers = pollTimers.current
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    }
  }, [])

  // Um banco pode já chegar em UPDATING: coleta pedida antes de sair da tela, ou conexão recente.
  useEffect(() => {
    if (!isPremium) return
    for (const bank of banks) {
      if (bank.item_status !== 'UPDATING' || pollTimers.current.has(bank.item_id)) continue
      const state = refreshState[bank.item_id]
      if (state === 'requesting' || state === 'timeout') continue
      setRefreshState((prev) => ({ ...prev, [bank.item_id]: 'polling' }))
      startPolling(bank.item_id, bankName(bank))
    }
  }, [banks, isPremium, refreshState, startPolling])

  const handleSyncBank = async (bank: ConnectedBank) => {
    const itemId = bank.item_id
    setErrorMsg(null)
    setRefreshState((prev) => ({ ...prev, [itemId]: 'requesting' }))

    const failed = (message: string) => {
      setErrorMsg(message)
      // Se o banco segue em UPDATING, 'timeout' evita recomeçar a consulta sem a pessoa pedir.
      if (bank.item_status === 'UPDATING') setRefreshState((prev) => ({ ...prev, [itemId]: 'timeout' }))
      else clearRefreshState(itemId)
    }

    try {
      const result = await requestBankRefresh(itemId)
      if (result.status === 'updating') {
        setRefreshState((prev) => ({ ...prev, [itemId]: 'polling' }))
        setBanks((prev) => prev.map((b) => (b.item_id === itemId ? { ...b, item_status: 'UPDATING' } : b)))
        startPolling(itemId, bankName(bank))
      } else if (result.status === 'needs_reconnect') {
        clearRefreshState(itemId)
        setBanks((prev) => prev.map((b) => (b.item_id === itemId ? { ...b, item_status: 'WAITING_USER_INPUT' } : b)))
        setErrorMsg(result.message ?? REFRESH_FAILED)
        loadBanks()
      } else {
        failed(result.message ?? REFRESH_FAILED)
      }
    } catch (error) {
      console.error('Falha ao pedir atualização:', error)
      failed(REFRESH_FAILED)
    }
  }

  const handleDisconnect = async () => {
    if (!disconnectTarget) return
    const bank = disconnectTarget
    setDisconnecting(true)
    setDisconnectError(null)
    try {
      const res = await disconnectBank(bank.item_id)
      if (!res.success) {
        setDisconnectError(res.error || DISCONNECT_FAILED)
        return
      }
      stopPolling(bank.item_id)
      clearRefreshState(bank.item_id)
      setBanks((prev) => prev.filter((b) => b.item_id !== bank.item_id))
      setAccounts((prev) => prev.filter((a) => a.item_id !== bank.item_id))
      setDisconnectTarget(null)
      refreshImportedData()
      toast({ kind: 'success', message: `${bankName(bank)} desconectado.` })
    } catch (error) {
      console.error('Falha ao desconectar banco:', error)
      setDisconnectError(DISCONNECT_FAILED)
    } finally {
      setDisconnecting(false)
    }
  }

  const handleBankConnected = () => {
    setErrorMsg(null)
    loadBanks()
    refreshImportedData()
  }

  const paused = !planLoading && !isPremium

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28">

      {/* CABEÇALHO */}
      <header className="flex items-center justify-between">
        <BackButton fallbackHref="/" />
        <div className="flex flex-col items-center">
          <h1 className="text-base font-bold text-white tracking-tight">Open Finance</h1>
          <span className="text-xs text-emerald-400 font-medium">Premium</span>
        </div>
        <div className="w-11" />
      </header>

      {/* HERO */}
      <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/60 to-slate-900/60 p-5 shadow-lg">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Zap className="h-5 w-5 text-emerald-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Sincronização automática</h2>
            <p className="text-xs text-slate-400">Conecte seus bancos com Open Finance</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Importe automaticamente seu extrato, investimentos e saldos, sem digitação manual.
        </p>

        {isPremium && (
          <Link
            href="/extrato"
            className="mt-3 flex h-11 items-center justify-center rounded-xl bg-emerald-700 text-sm font-semibold text-white active:scale-[0.98] transition-all"
          >
            Ver extrato e gastos por categoria
          </Link>
        )}

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-emerald-500/10">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
          <span className="text-xs text-emerald-400/80">
            Conexão via Pluggy · Somente leitura · Não guardamos a senha do seu banco
          </span>
        </div>
      </div>

      {/* ERROS */}
      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 py-1 pr-1 pl-3.5 text-xs text-rose-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-3" aria-hidden="true" />
          <p className="flex-1 py-3">{errorMsg}</p>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            aria-label="Fechar aviso"
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-rose-300 hover:bg-rose-500/10"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* CONEXÃO (PREMIUM) OU CONVITE PARA OS PLANOS */}
      {planLoading ? (
        <div className="flex items-center justify-center h-13">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-label="Carregando" />
        </div>
      ) : isPremium ? (
        <OpenFinanceButton
          label="Conectar banco"
          className="min-h-13 w-full rounded-2xl text-sm shadow-lg"
          onConnected={handleBankConnected}
          onError={setErrorMsg}
        />
      ) : (
        <Link
          href="/planos"
          className="flex items-center justify-center gap-2 w-full h-13 rounded-2xl bg-emerald-700 text-sm font-semibold text-white shadow-lg hover:bg-emerald-600 active:scale-[0.98] transition-all"
        >
          <Crown className="h-4 w-4" aria-hidden="true" />
          Conhecer o plano Premium
        </Link>
      )}

      {/* LISTA DE BANCOS CONECTADOS */}
      <section aria-labelledby="bancos-conectados">
        <div className="flex items-center justify-between mb-1">
          <h2 id="bancos-conectados" className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Bancos conectados
          </h2>
          <button
            type="button"
            onClick={loadBanks}
            disabled={loadingBanks}
            className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
            aria-label="Atualizar lista de bancos"
          >
            <RefreshCw className={`h-4 w-4 ${loadingBanks ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>

        {loadingBanks && banks.length === 0 ? (
          <div role="status" className="flex items-center justify-center py-10 gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span className="text-xs">Carregando bancos...</span>
          </div>
        ) : (
          <div className="space-y-2.5">
            {loadError && (
              <div role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-center">
                <p className="text-sm text-rose-300">{loadError}</p>
                <button
                  type="button"
                  onClick={loadBanks}
                  disabled={loadingBanks}
                  className="mt-2 h-11 cursor-pointer rounded-xl px-4 text-sm font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {!loadError && banks.length === 0 && (
              <EmptyState
                icon={WifiOff}
                title="Nenhum banco conectado"
                description="Depois de conectar, extrato, saldos e investimentos aparecem aqui."
              />
            )}

            {banks.map((bank) => {
              const name = bankName(bank)
              const status = bank.item_status
              const state = refreshState[bank.item_id]
              const timedOut = state === 'timeout'
              const refreshing = state === 'requesting' || (state === 'polling' && status === 'UPDATING')
              const needsAttention = status !== null && !OK_STATUSES.includes(status)
              const showReconnect = isPremium && needsAttention
              const showSync = isPremium && !RECONNECT_ONLY_STATUSES.includes(status ?? '')
              const isBeingDisconnected = disconnecting && disconnectTarget?.item_id === bank.item_id
              const bankAccounts = accounts.filter((account) => account.item_id === bank.item_id)

              return (
                <article
                  key={bank.id}
                  className="rounded-2xl border border-slate-800/80 bg-slate-900/40 overflow-hidden"
                >
                  <div className="flex items-center gap-3 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 border border-slate-700 overflow-hidden shrink-0">
                      {bank.institution_logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={bank.institution_logo} alt="" className="h-8 w-8 object-contain" />
                      ) : (
                        <Building2 className="h-5 w-5 text-slate-400" aria-hidden="true" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2">
                        <h3 className="text-sm font-semibold text-white truncate">{name}</h3>
                        <StatusBadge status={status} paused={paused} timedOut={timedOut} />
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {bank.last_synced_at
                          ? `Atualizado em ${formatDateTime(bank.last_synced_at)}`
                          : 'Dados ainda não importados'}
                      </p>
                    </div>
                  </div>

                  {!paused && bank.error_message && (
                    <p className="mx-4 mb-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                      {bank.error_message}
                    </p>
                  )}

                  {bankAccounts.length > 0 && (
                    <ul className="mx-4 mb-3 divide-y divide-slate-800/60 border-y border-slate-800/60">
                      {bankAccounts.map((account) => (
                        <li key={account.id} className="flex items-center justify-between gap-3 py-2">
                          <span className="text-xs text-slate-300 truncate">{account.name}</span>
                          <span className="text-xs font-medium text-white shrink-0">
                            {formatMoney(account.balance, account.currency_code)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex items-stretch gap-2 px-4 pb-3.5 pt-0">
                    {/* Fica montado sem gatilho: o resumo da reconexão sobrevive ao banco voltar a ficar saudável. */}
                    {isPremium && (
                      <OpenFinanceButton
                        itemId={bank.item_id}
                        institutionName={name}
                        hideTrigger={!showReconnect}
                        className="flex-1 rounded-xl text-xs"
                        onConnected={handleBankConnected}
                        onError={setErrorMsg}
                      />
                    )}

                    {showSync && (
                      <button
                        type="button"
                        onClick={() => handleSyncBank(bank)}
                        disabled={refreshing || isBeingDisconnected}
                        aria-label={refreshing ? `Atualizando ${name}` : `Sincronizar ${name}`}
                        className="flex-1 flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50 active:scale-95"
                      >
                        {refreshing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {refreshing ? 'Atualizando...' : 'Sincronizar'}
                      </button>
                    )}

                    {paused && (
                      <Link
                        href="/planos"
                        className="flex-1 flex min-h-11 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                      >
                        Conhecer o plano
                      </Link>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setDisconnectError(null)
                        setDisconnectTarget(bank)
                      }}
                      disabled={isBeingDisconnected}
                      aria-label={`Desconectar ${name}`}
                      className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-50 active:scale-95"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={disconnectTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDisconnectTarget(null)
        }}
        title={`Desconectar ${disconnectTarget ? bankName(disconnectTarget) : 'banco'}?`}
        description="O acesso será revogado e o extrato, os saldos, as faturas e os investimentos deste banco serão apagados daqui."
        confirmLabel="Desconectar"
        destructive
        loading={disconnecting}
        error={disconnectError}
        onConfirm={handleDisconnect}
      />
    </main>
  )
}
