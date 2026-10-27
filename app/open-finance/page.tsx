'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  ShieldCheck,
  ChevronRight,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import { BottomNav } from '@/components/bottom-nav'
import {
  getPluggyConnectToken,
  fetchPluggyInvestmentsDirectly,
  fetchPluggyAccounts,
  saveConnectedBank,
  getConnectedBanks,
  disconnectBank,
} from '@/app/actions/pluggy'

const PluggyConnect = dynamic(
  () => import('react-pluggy-connect').then((mod) => mod.PluggyConnect),
  { ssr: false }
)

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConnectedBank {
  id: string
  item_id: string
  institution_name: string
  institution_logo: string | null
  status: string
  last_synced_at: string | null
  created_at: string
}

interface ItemSuccessData {
  item: {
    id: string
    connector?: {
      name?: string
      imageUrl?: string
    }
  }
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function OpenFinancePage() {
  const [banks, setBanks] = useState<ConnectedBank[]>([])
  const [loadingBanks, setLoadingBanks] = useState(true)

  // Pluggy widget
  const [connectToken, setConnectToken] = useState<string | null>(null)
  const [openingWidget, setOpeningWidget] = useState(false)

  // Feedback
  const [syncing, setSyncing] = useState<string | null>(null) // item_id em sincronização
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null) // item_id sendo removido

  // Carregar bancos conectados
  const loadBanks = useCallback(async () => {
    setLoadingBanks(true)
    const res = await getConnectedBanks()
    if (res.success && res.banks) {
      setBanks(res.banks as ConnectedBank[])
    }
    setLoadingBanks(false)
  }, [])

  useEffect(() => {
    loadBanks()
  }, [loadBanks])

  // Abrir widget do Pluggy
  const handleOpenWidget = async () => {
    setOpeningWidget(true)
    setErrorMsg(null)
    const res = await getPluggyConnectToken()
    setOpeningWidget(false)

    if (res.accessToken) {
      setConnectToken(res.accessToken)
    } else {
      setErrorMsg('Erro ao iniciar conexão. Verifique as credenciais Pluggy.')
    }
  }

  // Sucesso ao conectar banco
  const handleConnectSuccess = async (data: ItemSuccessData) => {
    const itemId = data.item.id
    const institutionName = data.item.connector?.name || 'Instituição'
    const institutionLogo = data.item.connector?.imageUrl || null

    setConnectToken(null)
    setSyncing(itemId)

    // 1. Salvar no Supabase
    await saveConnectedBank(itemId, institutionName, institutionLogo || undefined)

    // 2. Buscar investimentos automaticamente
    const invResult = await fetchPluggyInvestmentsDirectly(itemId)
    // 3. Buscar contas bancárias
    const accResult = await fetchPluggyAccounts(itemId)

    setSyncing(null)

    const invCount = invResult.investments?.length ?? 0
    const accCount = accResult.accounts?.length ?? 0

    setSuccessMsg(
      `✅ ${institutionName} conectado! ${invCount} investimento(s) e ${accCount} conta(s) importados.`
    )

    // Recarregar lista
    loadBanks()

    setTimeout(() => setSuccessMsg(null), 6000)
  }

  // Sincronizar manualmente
  const handleSyncBank = async (bank: ConnectedBank) => {
    setSyncing(bank.item_id)
    setErrorMsg(null)

    const invResult = await fetchPluggyInvestmentsDirectly(bank.item_id)
    const accResult = await fetchPluggyAccounts(bank.item_id)

    setSyncing(null)

    if (invResult.error && accResult.error) {
      setErrorMsg(`Erro ao sincronizar ${bank.institution_name}.`)
    } else {
      const invCount = invResult.investments?.length ?? 0
      const accCount = accResult.accounts?.length ?? 0
      setSuccessMsg(
        `🔄 ${bank.institution_name} sincronizado: ${invCount} investimento(s), ${accCount} conta(s).`
      )
      setTimeout(() => setSuccessMsg(null), 5000)
    }

    loadBanks()
  }

  // Desconectar banco
  const handleDisconnect = async (bank: ConnectedBank) => {
    if (!confirm(`Desconectar ${bank.institution_name}? Os dados importados permanecem.`)) return

    setDisconnecting(bank.item_id)
    const res = await disconnectBank(bank.item_id)
    setDisconnecting(null)

    if (res.success) {
      setBanks((prev) => prev.filter((b) => b.item_id !== bank.item_id))
      setSuccessMsg(`${bank.institution_name} desconectado.`)
      setTimeout(() => setSuccessMsg(null), 4000)
    } else {
      setErrorMsg('Erro ao desconectar. Tente novamente.')
    }
  }

  // Formatar data
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
            <span className="text-[10px] text-emerald-400 font-medium tracking-wide">MODO PRO</span>
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
            Importe automaticamente investimentos, contas e transações do Nubank, Itaú, Inter, BTG e muito mais — sem digitação manual.
          </p>

          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-emerald-500/10">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="text-[10px] text-emerald-400/80">
              Conexão segura via Pluggy · Dados criptografados · Somente leitura
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

        {/* BOTÃO CONECTAR NOVO BANCO */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleOpenWidget}
          disabled={openingWidget}
          className="w-full h-13 flex items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 text-white font-semibold text-sm shadow-lg shadow-emerald-950/40 active:scale-[0.98] hover:bg-emerald-500 transition-all disabled:opacity-50"
        >
          {openingWidget ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Building2 className="h-5 w-5" />
          )}
          {openingWidget ? 'Iniciando conexão...' : 'Conectar Novo Banco'}
        </motion.button>

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
              <div className="text-center">
                <p className="text-sm font-medium text-slate-400">Nenhum banco conectado</p>
                <p className="text-xs text-slate-600 mt-1">
                  Toque em &quot;Conectar Novo Banco&quot; para começar
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {banks.map((bank) => (
                <motion.div
                  key={bank.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-sm overflow-hidden"
                >
                  {/* Cabeçalho do banco */}
                  <div className="flex items-center gap-3 p-4">
                    {/* Logo/Ícone */}
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

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white truncate">
                          {bank.institution_name || 'Instituição'}
                        </p>
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                          <Wifi className="h-3 w-3" />
                          Ativo
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Sync: {formatDate(bank.last_synced_at)}
                      </p>
                    </div>

                    <ChevronRight className="h-4 w-4 text-slate-600 shrink-0" />
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 px-4 pb-3.5 pt-0">
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

                    <button
                      onClick={() => handleDisconnect(bank)}
                      disabled={syncing === bank.item_id || disconnecting === bank.item_id}
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
              ))}
            </div>
          )}
        </section>

        {/* INFO SOBRE OPEN FINANCE */}
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4 space-y-2">
          <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
            Como funciona
          </span>
          <div className="space-y-2 pt-1">
            {[
              { step: '1', label: 'Conecte seus bancos', desc: 'Nubank, Itaú, Inter, BTG, XP e mais' },
              { step: '2', label: 'Importe automaticamente', desc: 'Investimentos e contas são importados em segundos' },
              { step: '3', label: 'Acompanhe tudo', desc: 'Visualize no dashboard e na carteira' },
            ].map(({ step, label, desc }) => (
              <div key={step} className="flex items-start gap-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 shrink-0 mt-0.5">
                  {step}
                </span>
                <div>
                  <p className="text-xs font-medium text-slate-300">{label}</p>
                  <p className="text-[11px] text-slate-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>

      {/* WIDGET PLUGGY */}
      {connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          includeSandbox={true}
          theme="dark"
          onSuccess={handleConnectSuccess}
          onError={(error) => {
            console.error('Erro no widget:', error)
            setConnectToken(null)
            setErrorMsg('Erro ao conectar banco. Tente novamente.')
          }}
          onClose={() => setConnectToken(null)}
        />
      )}

      <BottomNav />
    </>
  )
}

