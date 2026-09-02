'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { getPluggyConnectToken, fetchPluggyInvestmentsDirectly } from '@/app/actions/pluggy'
import { Building2, Loader2, CheckCircle2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const PluggyConnect = dynamic(
  () => import('react-pluggy-connect').then((mod) => mod.PluggyConnect),
  { ssr: false }
)

interface ItemSuccessData {
  item: {
    id: string
    connector?: {
      name?: string
    }
  }
}

interface Investment {
  pluggy_investment_id: string
  name: string
  code: string | null
  type: string
  value: number
  quantity: number
  institution: string
  updated_at: string
}

interface OpenFinanceButtonProps {
  onInvestmentsLoaded?: (investments: Investment[]) => void
}

export function OpenFinanceButton({ onInvestmentsLoaded }: OpenFinanceButtonProps) {
  const [connectToken, setConnectToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  
  // Estado para controlar o modal de sucesso
  const [successData, setSuccessData] = useState<{ count: number; institution: string } | null>(null)

  const handleOpenWidget = async () => {
    setLoading(true)
    const res = await getPluggyConnectToken()
    setLoading(false)

    if (res.accessToken) {
      setConnectToken(res.accessToken)
    } else {
      alert('Erro ao iniciar conexão Open Finance.')
    }
  }

  const handleSuccess = async (data: ItemSuccessData) => {
    const itemId = data.item.id
    const institutionName = data.item.connector?.name || 'Instituição'

    setConnectToken(null)
    setSyncing(true)

    const result = await fetchPluggyInvestmentsDirectly(itemId)
    setSyncing(false)

    if (result.success && result.investments) {
      if (onInvestmentsLoaded) {
        onInvestmentsLoaded(result.investments)
      }

      // Dispara o modal de sucesso customizado
      setSuccessData({
        count: result.investments.length,
        institution: institutionName,
      })
    } else {
      alert(result.error || `Erro ao carregar investimentos de ${institutionName}.`)
    }
  }

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.96 }}
        onClick={handleOpenWidget}
        disabled={loading || syncing}
        className="flex cursor-pointer items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 shadow-md"
      >
        {loading || syncing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Building2 className="h-4 w-4" />
        )}
        {syncing ? 'Buscando ativos...' : 'Conectar Banco (Open Finance)'}
      </motion.button>

      {/* Widget do Pluggy */}
      {connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          includeSandbox={true}
          theme="dark"
          onSuccess={handleSuccess}
          onError={(error) => {
            console.error('Erro no widget:', error)
            setConnectToken(null)
          }}
          onClose={() => setConnectToken(null)}
        />
      )}

      {/* Modal de Sucesso Customizado */}
      <AnimatePresence>
        {successData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSuccessData(null)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />

            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100 z-10 text-center"
            >
              <button
                onClick={() => setSuccessData(null)}
                className="absolute right-4 top-4 rounded p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-4">
                <CheckCircle2 className="h-6 w-6" />
              </div>

              <h3 className="text-lg font-semibold text-white">Conexão Realizada!</h3>
              
              <p className="mt-2 text-sm text-slate-300">
                <span className="font-semibold text-emerald-400">{successData.count}</span> investimento(s) carregado(s) com sucesso de <span className="font-medium text-white">{successData.institution}</span>.
              </p>

              <div className="mt-6">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSuccessData(null)}
                  className="w-full cursor-pointer rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 shadow-md"
                >
                  Continuar
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}