'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Building2, Loader2 } from 'lucide-react'
import { getPluggyConnectToken, savePluggyBank, syncPluggyBankData } from '@/app/actions/pluggy'
import { Button, buttonVariants } from '@/components/ui/button'
import { ConfirmDialog, Modal } from '@/components/ui/modal'
import { useAppMode } from '@/context/AppModeContext'
import { usePortfolio } from '@/context/PortfolioContext'
import { track } from '@/lib/analytics'
import { plural } from '@/lib/format'
import { BILLS_PARTIAL_MESSAGE } from '@/lib/pluggy/errors'
import { cn } from '@/lib/utils'

const PluggyConnect = dynamic(
  () => import('react-pluggy-connect').then((mod) => mod.PluggyConnect),
  { ssr: false }
)

const START_FAILED = 'Não foi possível iniciar a conexão. Tente novamente em instantes.'
const CONNECT_FAILED = 'Não foi possível conectar ao banco. Tente de novo; se persistir, pode ser instabilidade do banco.'
const SAVE_FAILED = 'Não foi possível salvar a conexão com o banco. Tente novamente em instantes.'
const IMPORT_RETRY = 'Banco conectado; a importação será tentada de novo.'
const MODE_FAILED = "Banco conectado, mas o painel continua com os dados manuais. Ative 'Usar dados dos bancos' no Perfil."

const listFormat = new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' })

interface ItemSuccessData {
  item: {
    id: string
    connector?: {
      name?: string
    }
  }
}

interface ConnectionSummary {
  institution: string
  accCount: number
  txCount: number
  invCount: number
  stillUpdating: boolean
  failedBills: number
}

function summaryText({ institution, accCount, txCount, invCount, stillUpdating }: ConnectionSummary) {
  const found = [
    accCount > 0 && plural(accCount, 'conta', 'contas'),
    txCount > 0 && plural(txCount, 'transação', 'transações'),
    invCount > 0 && plural(invCount, 'investimento', 'investimentos'),
  ].filter((item): item is string => Boolean(item))

  if (found.length > 0) return `Encontramos ${listFormat.format(found)} em ${institution}.`
  const empty = `Conectamos ${institution}, mas ainda não encontramos contas, transações nem investimentos.`
  return stillUpdating ? `${empty} A coleta continua, e os dados aparecem aqui quando ela terminar.` : empty
}

function hiddenAssetsText(count: number | null) {
  if (count === 1) return 'Seu 1 ativo manual fica oculto enquanto os dados do banco estiverem ativos. Ele não será apagado.'
  const subject = count === null ? 'Seus ativos manuais' : `Seus ${count.toLocaleString('pt-BR')} ativos manuais`
  return `${subject} ficam ocultos enquanto os dados do banco estiverem ativos. Eles não serão apagados.`
}

interface OpenFinanceButtonProps {
  /** Com itemId, reconecta esse banco sem criar outro e sem perder o histórico. */
  itemId?: string
  institutionName?: string
  label?: string
  className?: string
  /** Sem gatilho, nada abre, mas o resultado de uma reconexão continua visível depois que o banco volta a ficar saudável. */
  hideTrigger?: boolean
  /** O banco foi salvo: a lista precisa recarregar mesmo que a importação tenha falhado. */
  onConnected?: () => void
  onError?: (message: string) => void
}

export function OpenFinanceButton({
  itemId,
  institutionName,
  label,
  className,
  hideTrigger = false,
  onConnected,
  onError,
}: OpenFinanceButtonProps) {
  const { isPremium, isManual, setMode } = useAppMode()
  const { assets, isSynced } = usePortfolio()

  const [connectToken, setConnectToken] = useState<string | null>(null)
  const [includeSandbox, setIncludeSandbox] = useState(false)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const [summary, setSummary] = useState<ConnectionSummary | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)

  const [modeQuestion, setModeQuestion] = useState<{ count: number | null } | null>(null)
  const [modeSaving, setModeSaving] = useState(false)
  const [modeError, setModeError] = useState<string | null>(null)

  // O widget guarda os callbacks da primeira renderização e nunca os atualiza.
  const latest = useRef({ isPremium, isManual, isSynced, assetCount: assets.length, setMode, onConnected, onError })
  useEffect(() => {
    latest.current = { isPremium, isManual, isSynced, assetCount: assets.length, setMode, onConnected, onError }
  })

  // O erro espera o fechamento: o widget mostra a própria tela de erro e deixa tentar de novo.
  const pendingError = useRef<string | null>(null)

  const showSummary = (next: ConnectionSummary) => {
    setSummary(next)
    setSummaryOpen(true)
  }

  const handleOpenWidget = async () => {
    track('bank_connect_started')
    pendingError.current = null
    setLoading(true)
    try {
      const res = await getPluggyConnectToken(itemId)
      if (res.accessToken) {
        setIncludeSandbox(Boolean(res.includeSandbox))
        setConnectToken(res.accessToken)
      } else {
        latest.current.onError?.(res.error || START_FAILED)
      }
    } catch (error) {
      console.error('Falha ao iniciar a conexão:', error)
      latest.current.onError?.(START_FAILED)
    } finally {
      setLoading(false)
    }
  }

  /** Só troca sozinho sem ativos manuais: a troca os esconderia sem aviso. */
  const switchWithoutManualAssets = async () => {
    const { isPremium, isManual, isSynced, assetCount, setMode, onError } = latest.current
    if (!isPremium || !isManual || !isSynced || assetCount > 0) return
    if (!(await setMode('open_finance'))) onError?.(MODE_FAILED)
  }

  const handleSuccess = async (data: ItemSuccessData) => {
    const connectedId = data.item.id
    const institution = data.item.connector?.name || institutionName || 'seu banco'

    pendingError.current = null
    setConnectToken(null)
    setSyncing(true)

    try {
      const saved = await savePluggyBank(connectedId).catch(() => null)
      if (!saved?.success) {
        track('bank_connect_failed')
        latest.current.onError?.(saved?.error || SAVE_FAILED)
        return
      }

      const result = await syncPluggyBankData(connectedId).catch(() => null)
      latest.current.onConnected?.()

      if (!result?.success) {
        track('bank_connect_failed')
        latest.current.onError?.(IMPORT_RETRY)
        if (!itemId) await switchWithoutManualAssets()
        return
      }

      track('bank_connect_succeeded')
      const next: ConnectionSummary = {
        institution,
        accCount: Number(result.accCount || 0),
        txCount: Number(result.txCount || 0),
        invCount: Number(result.invCount || 0),
        stillUpdating: result.itemStatus === 'UPDATING',
        failedBills: Number(result.failedBills || 0),
      }

      const { isPremium, isManual, isSynced, assetCount } = latest.current
      const hasOrMayHaveManualAssets = !isSynced || assetCount > 0
      if (!itemId && isPremium && isManual && hasOrMayHaveManualAssets) {
        // A resposta decide o que os atalhos do resumo vão mostrar, então vem antes dele.
        setSummary(next)
        setModeError(null)
        setModeQuestion({ count: isSynced ? assetCount : null })
        return
      }

      if (!itemId) await switchWithoutManualAssets()
      showSummary(next)
    } finally {
      setSyncing(false)
    }
  }

  const handleUseBankData = async () => {
    setModeSaving(true)
    setModeError(null)
    try {
      if (await latest.current.setMode('open_finance')) {
        setModeQuestion(null)
        setSummaryOpen(true)
      } else {
        setModeError('Não foi possível salvar sua escolha. Tente de novo.')
      }
    } finally {
      setModeSaving(false)
    }
  }

  const handleKeepManual = () => {
    setModeQuestion(null)
    setSummaryOpen(true)
    // Registra a escolha: sem preferência salva, o modo poderia mudar sozinho mais tarde.
    void latest.current.setMode('manual')
  }

  const busy = loading || syncing
  const idleLabel = label ?? (itemId ? 'Reconectar' : 'Conectar banco')
  const nameInLabel = itemId && institutionName ? `${idleLabel} ${institutionName}` : undefined
  const foundAnything = summary ? summary.accCount + summary.txCount + summary.invCount > 0 : false

  return (
    <>
      {!hideTrigger && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={handleOpenWidget}
          disabled={busy}
          aria-busy={busy}
          aria-label={syncing ? undefined : nameInLabel}
          className={cn(
            'flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-md transition-colors hover:bg-emerald-600 disabled:opacity-50',
            className,
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          {syncing ? 'Importando seus dados; pode levar até um minuto' : idleLabel}
        </motion.button>
      )}

      {connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          includeSandbox={includeSandbox}
          updateItem={itemId}
          theme="dark"
          onSuccess={handleSuccess}
          onError={(error) => {
            console.error('Erro no widget:', error.message)
            track('bank_connect_failed')
            pendingError.current = CONNECT_FAILED
          }}
          onLoadError={(error) => {
            // Sem carregar, o widget nunca chama onClose.
            console.error('Falha ao carregar o widget:', error.message)
            track('bank_connect_failed')
            setConnectToken(null)
            latest.current.onError?.(CONNECT_FAILED)
          }}
          onClose={() => {
            setConnectToken(null)
            const message = pendingError.current
            pendingError.current = null
            if (message) latest.current.onError?.(message)
          }}
        />
      )}

      <ConfirmDialog
        open={modeQuestion !== null}
        onOpenChange={(next) => {
          if (!next) handleKeepManual()
        }}
        title="Usar os dados do banco?"
        description={hiddenAssetsText(modeQuestion?.count ?? null)}
        confirmLabel="Usar dados do banco"
        cancelLabel="Manter manual"
        loading={modeSaving}
        error={modeError}
        onConfirm={handleUseBankData}
      />

      <Modal
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        title={itemId ? 'Banco reconectado' : 'Banco conectado'}
        closeLabel="Fechar"
        footer={
          foundAnything ? (
            <>
              <Button variant="secondary" className="flex-1" onClick={() => setSummaryOpen(false)}>
                Agora não
              </Button>
              <Link
                href={summary?.txCount ? '/extrato' : '/carteira'}
                onClick={() => setSummaryOpen(false)}
                className={cn(buttonVariants(), 'flex-1')}
              >
                {summary?.txCount ? 'Ver meu extrato' : 'Ver carteira'}
              </Link>
            </>
          ) : (
            <Button className="flex-1" onClick={() => setSummaryOpen(false)}>
              Entendi
            </Button>
          )
        }
      >
        {summary && (
          <div role="status" className="space-y-2 text-sm text-slate-300">
            <p>{summaryText(summary)}</p>
            {summary.failedBills > 0 && <p className="text-amber-300">{BILLS_PARTIAL_MESSAGE}</p>}
          </div>
        )}
      </Modal>
    </>
  )
}
