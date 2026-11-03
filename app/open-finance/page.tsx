'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  Crown,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import { BottomNav } from '@/components/bottom-nav'
import { OpenFinanceButton } from '@/components/open-finance-button'
import { useAppMode } from '@/context/AppModeContext'
import {
  disconnectBank,
  getConnectedBanks,
  getSyncedAccounts,
  syncPluggyBankData,
} from '@/app/actions/pluggy'

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

const HEALTHY_STATUSES = ['UPDATED', 'UPDATING']

const formatMoney = (value: number, currency: string | null) =>
  Number(value).toLocaleString('pt-BR', { style: 'currency', currency: currency || 'BRL' })

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return 'Nunca sincronizado'
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function OpenFinancePage() {
  const { isPremium, loading: planLoading } = useAppMode()

  const [banks, setBanks] = useState<ConnectedBank[]>([])
  const [accounts, setAccounts] = useState<SyncedAccount[]>([])
  const [loadingBanks, setLoadingBanks] = useState(true)

  const [syncing, setSyncing] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  const loadBanks = useCallback(async () => {
    setLoadingBanks(true)
    const [banksResult, accountsResult] = await Promise.all([getConnectedBanks(), getSyncedAccounts()])
    setBanks(banksResult.banks as ConnectedBank[])
    setAccounts(accountsResult as SyncedAccount[])
    setLoadingBanks(false)
  }, [])

  useEffect(() => {
    loadBanks()
  }, [loadBanks])

  const handleSyncBank = async (bank: ConnectedBank) => {
    setSyncing(bank.item_id)
    setErrorMsg(null)

    const syncResult = await syncPluggyBankData(bank.item_id)

    setSyncing(null)

    if (syncResult.error) {
      setErrorMsg(syncResult.error)
    } else {
      setSuccessMsg(
        `${bank.institution_name} sincronizado: ${syncResult.invCount ?? 0} investimento(s), ${syncResult.accCount ?? 0} conta(s).`
      )
      setTimeout(() => setSuccessMsg(null), 5000)
    }

    loadBanks()
  }

  const handleDisconnect = async (bank: ConnectedBank) => {
    if (!confirm(`Desconectar ${bank.institution_name}? O acesso ao banco será revogado. Os investimentos já importados permanecem.`)) return

    setDisconnecting(bank.item_id)
    const res = await disconnectBank(bank.item_id)
    setDisconnecting(null)

    if (res.success) {
      setBanks((prev) => prev.filter((b) => b.item_id !== bank.item_id))
      setAccounts((prev) => prev.filter((a) => a.item_id !== bank.item_id))
      setSuccessMsg(`${bank.institution_name} desconectado.`)
      setTimeout(() => setSuccessMsg(null), 4000)
    } else {
      setErrorMsg(res.error || 'Erro ao desconectar. Tente novamente.')
    }
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28 select-none">

        {/* CABEÇALHO */}
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-slate-300 active:scale-90 transition-all shadow-sm"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex flex-col items-center">
            <h1 className="text-base font-bold text-white tracking-tight">Open Finance</h1>
            <span className="text-[10px] text-emerald-400 font-medium tracking-wide">PREMIUM</span>
          </div>
          <div className="w-10" />
        </header>

        {/* HERO CARD */}
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/60 to-slate-900/60 p-5 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <Zap className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Sincronização Automática</h2>
              <p className="text-[11px] text-slate-400">Conecte seus bancos com Open Finance</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Importe automaticamente seus investimentos e os saldos das suas contas, sem digitação manual.
          </p>

          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-emerald-500/10">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="text-[10px] text-emerald-400/80">
              Conexão via Pluggy · Somente leitura · Não guardamos a senha do seu banco
            </span>
          </div>
        </div>

        {/* MENSAGENS DE FEEDBACK */}
        <AnimatePresence>
          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{successMsg}</p>
            </motion.div>
          )}
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{errorMsg}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CONEXÃO (PREMIUM) OU CONVITE PARA OS PLANOS */}
        {planLoading ? (
          <div className="flex items-center justify-center h-13">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          </div>
        ) : isPremium ? (
          <div className="w-full [&>button]:w-full [&>button]:justify-center [&>button]:rounded-2xl [&>button]:h-13 [&>button]:text-sm [&>button]:shadow-lg">
            <OpenFinanceButton onInvestmentsLoaded={loadBanks} />
          </div>
        ) : (
          <Link
            href="/planos"
            className="flex items-center justify-center gap-2 w-full h-13 rounded-2xl bg-emerald-600 text-sm font-semibold text-white shadow-lg hover:bg-emerald-500 active:scale-[0.98] transition-all"
          >
            <Crown className="h-4 w-4" />
            Conhecer o plano Premium
          </Link>
        )}

        {/* LISTA DE BANCOS CONECTADOS */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
              Bancos Conectados
            </span>
            <button
              onClick={loadBanks}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-lg active:scale-90"
              aria-label="Atualizar lista"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          {loadingBanks ? (
            <div className="flex items-center justify-center py-10 gap-2 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-xs">Carregando bancos...</span>
            </div>
          ) : banks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 border border-slate-800">
                <WifiOff className="h-6 w-6 text-slate-600" />
              </div>
              <p className="text-sm font-medium text-slate-400">Nenhum banco conectado</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {banks.map((bank) => {
                const isHealthy = HEALTHY_STATUSES.includes(bank.item_status || 'UPDATED')
                const bankAccounts = accounts.filter((account) => account.item_id === bank.item_id)

                return (
                  <motion.div
                    key={bank.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-sm overflow-hidden"
                  >
                    <div className="flex items-center gap-3 p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 border border-slate-700 overflow-hidden shrink-0">
                        {bank.institution_logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={bank.institution_logo}
                            alt={bank.institution_name || ''}
                            className="h-8 w-8 object-contain"
                          />
                        ) : (
                          <Building2 className="h-5 w-5 text-slate-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white truncate">
                            {bank.institution_name || 'Instituição'}
                          </p>
                          {isHealthy ? (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                              <Wifi className="h-3 w-3" />
                              Ativo
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                              <AlertCircle className="h-3 w-3" />
                              Atenção
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Sync: {formatDate(bank.last_synced_at)}
                        </p>
                      </div>
                    </div>

                    {!isHealthy && bank.error_message && (
                      <p className="mx-4 mb-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                        {bank.error_message}
                      </p>
                    )}

                    {bankAccounts.length > 0 && (
                      <ul className="mx-4 mb-3 divide-y divide-slate-800/60 rounded-xl border border-slate-800/60">
                        {bankAccounts.map((account) => (
                          <li key={account.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <span className="text-xs text-slate-300 truncate">{account.name}</span>
                            <span className="text-xs font-medium text-white shrink-0">
                              {formatMoney(account.balance, account.currency_code)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="flex items-center gap-2 px-4 pb-3.5 pt-0">
                      {isPremium && (
                        <button
                          onClick={() => handleSyncBank(bank)}
                          disabled={syncing === bank.item_id || disconnecting === bank.item_id}
                          className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50 active:scale-95"
                        >
                          {syncing === bank.item_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          {syncing === bank.item_id ? 'Sincronizando...' : 'Sincronizar'}
                        </button>
                      )}

                      <button
                        onClick={() => handleDisconnect(bank)}
                        disabled={syncing === bank.item_id || disconnecting === bank.item_id}
                        aria-label={`Desconectar ${bank.institution_name || 'banco'}`}
                        className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium hover:bg-rose-500/20 transition-colors disabled:opacity-50 active:scale-95"
                      >
                        {disconnecting === bank.item_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </section>

      </main>

      <BottomNav />
    </>
  )
}
