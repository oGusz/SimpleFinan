'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CheckSquare, Landmark, Loader2, Minus, Pencil, Plus, SlidersHorizontal, Square, Trash2, TrendingUp, X } from 'lucide-react'
import { AddInvestmentModal } from '@/components/AddInvestmentModal'
import { SkeletonList } from '@/components/page-skeleton'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { fieldControlClass } from '@/components/ui/field'
import { ConfirmDialog } from '@/components/ui/modal'
import { MoneyInput } from '@/components/ui/money-input'
import { useToast } from '@/components/ui/toast'
import { usePortfolio, type Asset } from '@/context/PortfolioContext'
import { formatBRL, formatDate, formatDateTime, formatPercent, plural } from '@/lib/format'
import { parseDecimalInput } from '@/lib/parse-number'
import { assetReturn } from '@/lib/portfolio-metrics'
import { isExchangeTicker, isManualValueTicker } from '@/lib/tickers'
import { cn } from '@/lib/utils'

export type { Asset } from '@/context/PortfolioContext'

const UNDO_DURATION_MS = 5000
const SAVE_ERROR = 'Não foi possível salvar. Tente de novo.'

const STEP_BUTTON_CLASS =
  'flex h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-800 bg-slate-950 px-1 text-sm font-semibold text-slate-200 hover:bg-slate-800'

// Soma de decimais em ponto flutuante gera 1.2000000000000002, que iria parar no banco e na tela.
const roundQuantity = (value: number) => Math.round(value * 1e8) / 1e8

const formatQuantity = (value: number) =>
  value.toLocaleString('pt-BR', { maximumFractionDigits: 8, useGrouping: false })

const assetLabel = (asset: Asset) => (isManualValueTicker(asset.ticker) ? asset.name : asset.ticker)

/** Grava só no blur ou Enter: valores intermediários não vão ao banco, e vazio não significa zero. */
function QuantityInput({
  asset,
  onCommit,
}: {
  asset: Asset
  onCommit: (value: number) => Promise<boolean>
}) {
  const [text, setText] = useState(() => formatQuantity(asset.quantity))
  const focused = useRef(false)
  const latestQuantity = useRef(asset.quantity)

  useEffect(() => {
    latestQuantity.current = asset.quantity
    if (!focused.current) setText(formatQuantity(asset.quantity))
  }, [asset.quantity])

  const restore = () => setText(formatQuantity(latestQuantity.current))

  const handleBlur = async () => {
    focused.current = false
    const parsed = parseDecimalInput(text)
    if (parsed === null || parsed === asset.quantity) {
      restore()
      return
    }
    setText(formatQuantity(parsed))
    const ok = await onCommit(parsed)
    if (!ok) restore()
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={`Quantidade de cotas de ${asset.ticker}`}
      value={text}
      onFocus={() => {
        focused.current = true
      }}
      onChange={(event) => {
        if (/^[0-9.,]*$/.test(event.target.value)) setText(event.target.value)
      }}
      onBlur={handleBlur}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      className="h-11 w-0 min-w-14 flex-1 rounded-lg border border-slate-800 bg-slate-950 text-center text-sm font-semibold text-white"
    />
  )
}

/** Valor em reais editado na própria linha. Vazio ou igual não altera nada. */
function MoneyEditor({
  value,
  ariaLabel,
  editLabel,
  emptyLabel,
  onSave,
}: {
  value: number | null
  ariaLabel: string
  editLabel: string
  emptyLabel?: string
  onSave: (value: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<number | null>(value)
  const cancelled = useRef(false)

  const start = () => {
    cancelled.current = false
    setDraft(value)
    setEditing(true)
  }

  const handleBlur = () => {
    setEditing(false)
    if (cancelled.current || draft === null || draft === value) return
    onSave(draft)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      cancelled.current = true
      event.currentTarget.blur()
    }
  }

  if (editing) {
    return (
      <div className="w-40">
        <MoneyInput
          aria-label={ariaLabel}
          value={draft}
          onValueChange={setDraft}
          autoFocus
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      </div>
    )
  }

  if (value === null) {
    return (
      <button
        type="button"
        onClick={start}
        aria-label={editLabel}
        className="min-h-11 cursor-pointer rounded-lg px-2 text-right text-sm font-medium text-amber-300 underline underline-offset-2 hover:bg-slate-800"
      >
        {emptyLabel}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={start}
      aria-label={`${editLabel}: ${formatBRL(value)}`}
      className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
    >
      {formatBRL(value)}
      <Pencil className="size-3.5 text-slate-400" aria-hidden="true" />
    </button>
  )
}

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 text-sm">
      <span className="text-slate-400">{label}</span>
      {children}
    </div>
  )
}

function GainValue({ asset }: { asset: Asset }) {
  const result = assetReturn(asset)
  if (!result) return <span className="font-semibold text-slate-400">—</span>
  const sign = result.amount >= 0.005 ? '+' : ''
  return (
    <span
      className={cn(
        'text-right font-semibold',
        result.amount >= 0.005 ? 'text-emerald-400' : result.amount <= -0.005 ? 'text-rose-400' : 'text-slate-200',
      )}
    >
      {sign}
      {formatBRL(result.amount)} ({formatPercent(result.pct, { signed: true })})
    </span>
  )
}

function RowHeader({
  asset,
  title,
  subtitle,
  isSelected,
  onToggleSelect,
  onRemove,
}: {
  asset: Asset
  title: string
  subtitle: string
  isSelected: boolean
  onToggleSelect: () => void
  onRemove: () => void
}) {
  const label = assetLabel(asset)
  return (
    <div className="flex items-center justify-between gap-1 border-b border-slate-800/60 pb-1">
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          role="checkbox"
          aria-checked={isSelected}
          aria-label={`Selecionar ${label}`}
          onClick={onToggleSelect}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800"
        >
          {isSelected ? (
            <CheckSquare className="size-5 text-emerald-400" aria-hidden="true" />
          ) : (
            <Square className="size-5" aria-hidden="true" />
          )}
        </button>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-white">{title}</p>
          <p className="truncate text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Excluir ${label}`}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

function ManualValueRow({
  asset,
  isSelected,
  onToggleSelect,
  onRemove,
  onSaveValue,
}: {
  asset: Asset
  isSelected: boolean
  onToggleSelect: () => void
  onRemove: () => void
  onSaveValue: (value: number) => void
}) {
  return (
    <li className={cn('rounded-2xl border p-3', isSelected ? 'border-emerald-500/40 bg-emerald-500/[0.08]' : 'border-slate-800 bg-slate-900/60')}>
      <RowHeader
        asset={asset}
        title={asset.name}
        subtitle={asset.category ?? 'Não classificado'}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
        onRemove={onRemove}
      />
      <div className="pt-1">
        <DataRow label="Valor atual">
          <MoneyEditor
            value={asset.price > 0 ? asset.price : null}
            ariaLabel={`Valor atual de ${asset.name}`}
            editLabel={`Editar valor de ${asset.name}`}
            emptyLabel="Informe o valor"
            onSave={onSaveValue}
          />
        </DataRow>
        {asset.updatedAt && <p className="text-xs text-slate-400">Valor informado por você em {formatDate(asset.updatedAt)}</p>}
      </div>
    </li>
  )
}

function ExchangeRow({
  asset,
  isSelected,
  onToggleSelect,
  onRemove,
  onDelta,
  onCommitQuantity,
  onSaveAvgPrice,
}: {
  asset: Asset
  isSelected: boolean
  onToggleSelect: () => void
  onRemove: () => void
  onDelta: (delta: number) => void
  onCommitQuantity: (value: number) => Promise<boolean>
  onSaveAvgPrice: (value: number) => void
}) {
  const { ticker } = asset
  return (
    <li id={`ativo-${ticker}`} className={cn('scroll-mt-4 rounded-2xl border p-3', isSelected ? 'border-emerald-500/40 bg-emerald-500/[0.08]' : 'border-slate-800 bg-slate-900/60')}>
      <RowHeader
        asset={asset}
        title={ticker}
        subtitle={asset.name}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
        onRemove={onRemove}
      />

      <div className="pt-1">
        <DataRow label="Preço médio">
          <MoneyEditor
            value={asset.avgPrice}
            ariaLabel={`Preço médio de ${ticker}`}
            editLabel={`Editar preço médio de ${ticker}`}
            emptyLabel="Informe seu preço médio"
            onSave={onSaveAvgPrice}
          />
        </DataRow>
        <DataRow label="Cotação">
          <span className="text-right font-semibold text-slate-200">
            {asset.price > 0 && !asset.quoteMissing ? formatBRL(asset.price) : '—'}
            {asset.quoteStale && <span className="block text-xs font-normal text-slate-400">Não atualizada</span>}
          </span>
        </DataRow>
        <DataRow label="Ganho">
          <GainValue asset={asset} />
        </DataRow>
      </div>

      <div className="mt-1 flex items-center gap-1" role="group" aria-label={`Quantidade de ${ticker}`}>
        <button type="button" aria-label={`Diminuir 10 cotas de ${ticker}`} onClick={() => onDelta(-10)} className={STEP_BUTTON_CLASS}>
          -10
        </button>
        <button type="button" aria-label={`Diminuir 1 cota de ${ticker}`} onClick={() => onDelta(-1)} className={STEP_BUTTON_CLASS}>
          <Minus className="size-4" aria-hidden="true" />
        </button>
        <QuantityInput asset={asset} onCommit={onCommitQuantity} />
        <button type="button" aria-label={`Aumentar 1 cota de ${ticker}`} onClick={() => onDelta(1)} className={STEP_BUTTON_CLASS}>
          <Plus className="size-4" aria-hidden="true" />
        </button>
        <button type="button" aria-label={`Aumentar 10 cotas de ${ticker}`} onClick={() => onDelta(10)} className={STEP_BUTTON_CLASS}>
          +10
        </button>
      </div>

      <div className="mt-1 flex min-h-11 items-center justify-between gap-3 text-sm">
        <span className="text-slate-400">Valor atual</span>
        <span className="font-bold text-emerald-400">{asset.price > 0 ? formatBRL(asset.quantity * asset.price) : '—'}</span>
      </div>
    </li>
  )
}

function ReadOnlyRow({ asset }: { asset: Asset }) {
  const hasShares = isExchangeTicker(asset.ticker)
  const details = [asset.category, hasShares ? plural(asset.quantity, 'cota', 'cotas') : null].filter(Boolean).join(' · ')
  return (
    <li className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{asset.name}</p>
          {details && <p className="truncate text-xs text-slate-400">{details}</p>}
        </div>
        <span className="shrink-0 text-sm font-semibold text-slate-200">{formatBRL(asset.quantity * asset.price)}</span>
      </div>
      {asset.avgPrice !== null && (
        <div className="mt-1 flex items-center justify-between gap-3 text-xs">
          <span className="text-slate-400">Ganho</span>
          <GainValue asset={asset} />
        </div>
      )}
      {asset.updatedAt && <p className="mt-1 text-xs text-slate-400">Atualizado em {formatDateTime(asset.updatedAt)}</p>}
    </li>
  )
}

function LoadNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-x-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm text-amber-200">
      <p className="min-w-0 flex-1 basis-52 py-2">
        Não foi possível carregar sua carteira agora. O que aparece aqui é a última versão salva neste aparelho.
      </p>
      <button type="button" onClick={onRetry} className="h-11 shrink-0 cursor-pointer rounded-lg px-2 font-semibold text-emerald-400 hover:bg-slate-800">
        Tentar de novo
      </button>
    </div>
  )
}

function QuotesNotice({ asOf, failed }: { asOf: string | null; failed: boolean }) {
  if (failed) {
    return (
      <p role="status" className="text-xs text-amber-300">
        {asOf ? `Não foi possível atualizar. Último valor de ${formatDate(asOf)}` : 'Não foi possível atualizar as cotações.'}
      </p>
    )
  }
  if (!asOf) return null
  return <p className="text-xs text-slate-400">Cotação de {formatDateTime(asOf)}</p>
}

interface PortfolioManagerProps {
  /** Ativos vindos dos bancos: uma alteração aqui seria sobrescrita na próxima sincronização. */
  readOnly?: boolean
}

export default function PortfolioManager({ readOnly = false }: PortfolioManagerProps) {
  const {
    assets,
    isSynced,
    loadError,
    quotesAsOf,
    quotesFailed,
    reloadAssets,
    updateQuantity,
    updateAvgPrice,
    updateManualValue,
    removeAsset,
    restoreAssets,
  } = usePortfolio()
  const { toast } = useToast()

  const [addOpen, setAddOpen] = useState(false)
  const [selectedTickers, setSelectedTickers] = useState<string[]>([])
  const [isBulkPanelOpen, setIsBulkPanelOpen] = useState(false)
  const [bulkMode, setBulkMode] = useState<'subtract' | 'add'>('add')
  const [bulkAmount, setBulkAmount] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  // O alvo fica guardado ao fechar: senão, o texto do diálogo some durante a animação de saída.
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ assets: Asset[]; reason?: string }>({ assets: [] })
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const clearingCost = useRef(new Set<string>())

  // Um ativo pode sair por releitura do banco: a seleção nunca aponta para o que não existe.
  const selectedAssets = assets.filter((asset) => selectedTickers.includes(asset.ticker))
  const adjustableAssets = selectedAssets.filter((asset) => !isManualValueTicker(asset.ticker))
  const hasQuotedAssets = assets.some((asset) => isExchangeTicker(asset.ticker))

  const showWriteError = (error: string | undefined) => toast({ message: error ?? SAVE_ERROR, kind: 'error' })

  const promptDelete = (targets: Asset[], reason?: string) => {
    setDeleteError(null)
    setDeleteTarget({ assets: targets, reason })
    setDeleteOpen(true)
  }

  const handleUndoDelete = async (removed: Asset[]) => {
    const result = await restoreAssets(removed)
    if (!result.ok) showWriteError(result.error)
  }

  const confirmDelete = async () => {
    const targets = deleteTarget.assets
    if (targets.length === 0) return

    setIsDeleting(true)
    setDeleteError(null)
    const tickers = targets.map((asset) => asset.ticker)
    const result = await removeAsset(tickers)
    setIsDeleting(false)

    if (!result.ok) {
      setDeleteError(result.error ?? 'Não foi possível excluir. Tente de novo.')
      return
    }

    setSelectedTickers((previous) => previous.filter((ticker) => !tickers.includes(ticker)))
    setDeleteOpen(false)
    toast({
      message: targets.length === 1 ? `${assetLabel(targets[0])} excluído` : `${plural(targets.length, 'ativo', 'ativos')} excluídos`,
      kind: 'success',
      duration: UNDO_DURATION_MS,
      action: { label: 'Desfazer', onClick: () => void handleUndoDelete(targets) },
    })
  }

  /**
   * Cotas novas sem preço pago deixariam o preço médio errado: o custo passa a desconhecido,
   * nunca fica com um valor suposto. Desfazer existe porque um toque em +1 custaria o dado da pessoa.
   */
  const markCostUnknown = async (asset: Asset) => {
    if (clearingCost.current.has(asset.ticker)) return
    clearingCost.current.add(asset.ticker)
    const result = await updateAvgPrice(asset.ticker, null)
    clearingCost.current.delete(asset.ticker)

    if (!result.ok) {
      showWriteError(result.error)
      return
    }
    toast({
      message: `Informe seu preço médio de ${asset.ticker}: as cotas novas não têm custo registrado.`,
      kind: 'info',
      action: {
        label: 'Desfazer',
        onClick: () => {
          void (async () => {
            const quantity = await updateQuantity(asset.ticker, asset.quantity)
            const cost = quantity.ok ? await updateAvgPrice(asset.ticker, asset.avgPrice) : quantity
            if (!cost.ok) showWriteError(cost.error)
          })()
        },
      },
    })
  }

  const changeQuantity = async (asset: Asset, next: number): Promise<boolean> => {
    const result = await updateQuantity(asset.ticker, next)
    if (!result.ok) {
      showWriteError(result.error)
      return false
    }
    if (next > asset.quantity && asset.avgPrice !== null) await markCostUnknown(asset)
    return true
  }

  const zeroReason = (label: string) => `Com esta alteração, ${label} ficaria sem cotas.`

  const handleDelta = (asset: Asset, delta: number) => {
    const next = roundQuantity(asset.quantity + delta)
    if (next <= 0) {
      promptDelete([asset], zeroReason(asset.ticker))
      return
    }
    void changeQuantity(asset, next)
  }

  const handleCommitQuantity = async (asset: Asset, value: number): Promise<boolean> => {
    if (value <= 0) {
      promptDelete([asset], zeroReason(asset.ticker))
      return false
    }
    return changeQuantity(asset, roundQuantity(value))
  }

  const handleSaveAvgPrice = async (asset: Asset, value: number) => {
    const result = await updateAvgPrice(asset.ticker, value)
    if (!result.ok) showWriteError(result.error)
  }

  const handleSaveManualValue = async (asset: Asset, value: number) => {
    const result = await updateManualValue(asset.ticker, value)
    if (!result.ok) showWriteError(result.error)
  }

  const handleApplyBulk = async () => {
    const amount = parseDecimalInput(bulkAmount)
    if (amount === null || amount <= 0) {
      setBulkError('Informe uma quantidade maior que zero.')
      return
    }

    const signed = bulkMode === 'add' ? amount : -amount
    const planned = adjustableAssets.map((asset) => ({ asset, next: roundQuantity(asset.quantity + signed) }))
    const reachingZero = planned.filter((item) => item.next <= 0).map((item) => item.asset)
    const updates = planned.filter((item) => item.next > 0)

    setBulkBusy(true)
    setBulkError(null)
    const results = await Promise.all(
      updates.map(async ({ asset, next }) => ({ asset, next, result: await updateQuantity(asset.ticker, next) })),
    )

    const failed = results.filter((item) => !item.result.ok)
    const increased = results.filter((item) => item.result.ok && item.next > item.asset.quantity && item.asset.avgPrice !== null)
    const costResults = await Promise.all(
      increased.map(async ({ asset }) => ({ asset, result: await updateAvgPrice(asset.ticker, null) })),
    )
    setBulkBusy(false)

    if (failed.length > 0) {
      const names = failed.map((item) => item.asset.ticker).join(', ')
      setBulkError(`Não foi possível ajustar ${names}. ${failed[0].result.error ?? ''}`.trim())
    } else {
      setBulkAmount('')
      setIsBulkPanelOpen(false)
    }

    const succeeded = results.length - failed.length
    if (succeeded > 0) {
      toast({ message: `Quantidade ajustada em ${plural(succeeded, 'ativo', 'ativos')}`, kind: 'success' })
    }
    const uncosted = costResults.filter((item) => item.result.ok).map((item) => item.asset.ticker)
    if (uncosted.length > 0) {
      toast({ message: `Informe seu preço médio de ${uncosted.join(', ')}: as cotas novas não têm custo registrado.`, kind: 'info' })
    }
    const costFailure = costResults.find((item) => !item.result.ok)
    if (costFailure) showWriteError(costFailure.result.error)

    if (reachingZero.length > 0) {
      promptDelete(
        reachingZero,
        reachingZero.length === 1
          ? zeroReason(reachingZero[0].ticker)
          : `Com esta alteração, ${reachingZero.map((asset) => asset.ticker).join(', ')} ficariam sem cotas.`,
      )
    }
  }

  const toggleSelect = (ticker: string) => {
    setSelectedTickers((previous) =>
      previous.includes(ticker) ? previous.filter((item) => item !== ticker) : [...previous, ticker],
    )
  }

  const handleSelectAll = () => {
    setSelectedTickers(selectedAssets.length === assets.length ? [] : assets.map((asset) => asset.ticker))
  }

  // Lista vazia só é carteira vazia depois que o banco respondeu.
  const isLoadingList = assets.length === 0 && !isSynced && !loadError
  const isEmpty = assets.length === 0 && isSynced

  if (readOnly) {
    return (
      <section aria-labelledby="carteira-ativos" className="flex flex-col gap-3">
        <div>
          <h2 id="carteira-ativos" className="flex items-center gap-2 text-lg font-bold text-white">
            <TrendingUp className="size-5 text-emerald-400" aria-hidden="true" />
            Ativos da carteira
          </h2>
          {assets.length > 0 && (
            <p className="text-sm text-slate-400">{plural(assets.length, 'ativo importado', 'ativos importados')} dos seus bancos</p>
          )}
          {hasQuotedAssets && <QuotesNotice asOf={quotesAsOf} failed={quotesFailed} />}
        </div>

        {loadError && <LoadNotice onRetry={reloadAssets} />}
        {isLoadingList && <SkeletonList />}
        {isEmpty && (
          <EmptyState
            icon={Landmark}
            title="Nenhum investimento importado"
            description="Sincronize seus bancos para ver seus investimentos aqui."
            actionLabel="Abrir Open Finance"
            href="/open-finance"
          />
        )}
        {assets.length > 0 && (
          <ul className="flex flex-col gap-2">
            {assets.map((asset) => (
              <ReadOnlyRow key={asset.ticker} asset={asset} />
            ))}
          </ul>
        )}
      </section>
    )
  }

  return (
    <section aria-labelledby="carteira-ativos" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="carteira-ativos" className="flex items-center gap-2 text-lg font-bold text-white">
          <TrendingUp className="size-5 text-emerald-400" aria-hidden="true" />
          Ativos da carteira
        </h2>
        {assets.length > 0 && <p className="text-sm text-slate-400">{plural(assets.length, 'ativo cadastrado', 'ativos cadastrados')}</p>}
        {hasQuotedAssets && <QuotesNotice asOf={quotesAsOf} failed={quotesFailed} />}
      </div>

      {loadError && <LoadNotice onRetry={reloadAssets} />}
      {isLoadingList && <SkeletonList />}
      {isEmpty && (
        <EmptyState
          icon={TrendingUp}
          title="Nenhum investimento cadastrado"
          description="Adicione ações, FIIs, Tesouro, CDB e outros para acompanhar seu patrimônio."
          actionLabel="Adicionar investimento"
          onAction={() => setAddOpen(true)}
        />
      )}

      <AddInvestmentModal
        hideTrigger
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      {assets.length > 0 && (
        <>
          <Button type="button" onClick={() => setAddOpen(true)} className="w-full">
            <Plus aria-hidden="true" />
            Adicionar investimento
          </Button>

          <div className="flex items-center justify-between gap-2 text-sm">
            <button
              type="button"
              onClick={handleSelectAll}
              className="flex h-11 cursor-pointer items-center gap-2 rounded-lg pr-2 font-medium text-slate-300 hover:bg-slate-800"
            >
              {selectedAssets.length === assets.length ? (
                <CheckSquare className="size-5 text-emerald-400" aria-hidden="true" />
              ) : (
                <Square className="size-5 text-slate-400" aria-hidden="true" />
              )}
              {selectedAssets.length === assets.length ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
            {selectedAssets.length > 0 && (
              <span className="text-xs text-slate-400">
                {selectedAssets.length} de {assets.length} selecionados
              </span>
            )}
          </div>

          {selectedAssets.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2">
              {adjustableAssets.length > 0 && (
                <Button type="button" variant="secondary" onClick={() => setIsBulkPanelOpen((open) => !open)} aria-expanded={isBulkPanelOpen} className="flex-1">
                  <SlidersHorizontal aria-hidden="true" />
                  Ajustar quantidade
                </Button>
              )}
              <Button type="button" variant="destructive" onClick={() => promptDelete(selectedAssets)} className="flex-1">
                <Trash2 aria-hidden="true" />
                Excluir selecionados
              </Button>
            </div>
          )}

          {isBulkPanelOpen && adjustableAssets.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-200">Ajustar {plural(adjustableAssets.length, 'ativo', 'ativos')}</p>
                <button
                  type="button"
                  aria-label="Fechar ajuste de quantidade"
                  onClick={() => setIsBulkPanelOpen(false)}
                  className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div role="group" aria-label="Tipo de ajuste" className="flex gap-1">
                  {(
                    [
                      ['add', 'Somar'],
                      ['subtract', 'Subtrair'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={bulkMode === value}
                      onClick={() => setBulkMode(value)}
                      className={cn(
                        'h-11 cursor-pointer rounded-lg border px-3 text-sm font-medium',
                        bulkMode === value
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                          : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label="Quantidade de cotas a ajustar"
                  placeholder="Cotas"
                  value={bulkAmount}
                  onChange={(event) => {
                    if (/^[0-9.,]*$/.test(event.target.value)) setBulkAmount(event.target.value)
                  }}
                  className={cn(fieldControlClass, 'w-24 flex-1')}
                />
                <Button type="button" onClick={handleApplyBulk} disabled={bulkBusy} aria-busy={bulkBusy}>
                  {bulkBusy && <Loader2 className="animate-spin" aria-hidden="true" />}
                  Aplicar
                </Button>
              </div>
              {bulkError && (
                <p role="alert" className="text-sm text-rose-400">
                  {bulkError}
                </p>
              )}
            </div>
          )}

          <ul className="flex flex-col gap-3">
            {assets.map((asset) => {
              const isSelected = selectedTickers.includes(asset.ticker)
              const shared = {
                asset,
                isSelected,
                onToggleSelect: () => toggleSelect(asset.ticker),
                onRemove: () => promptDelete([asset]),
              }
              return isManualValueTicker(asset.ticker) ? (
                <ManualValueRow
                  key={asset.ticker}
                  {...shared}
                  onSaveValue={(value) => void handleSaveManualValue(asset, value)}
                />
              ) : (
                <ExchangeRow
                  key={asset.ticker}
                  {...shared}
                  onDelta={(delta) => handleDelta(asset, delta)}
                  onCommitQuantity={(value) => handleCommitQuantity(asset, value)}
                  onSaveAvgPrice={(value) => void handleSaveAvgPrice(asset, value)}
                />
              )
            })}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={deleteTarget.assets.length > 1 ? `Excluir ${deleteTarget.assets.length} ativos?` : 'Excluir ativo?'}
        description={
          <>
            {deleteTarget.reason && <>{deleteTarget.reason} </>}
            {deleteTarget.assets.length === 1
              ? `${assetLabel(deleteTarget.assets[0])} sairá da sua carteira.`
              : `${deleteTarget.assets.map(assetLabel).join(', ')} sairão da sua carteira.`}{' '}
            Você terá alguns segundos para desfazer.
          </>
        }
        confirmLabel="Excluir"
        destructive
        loading={isDeleting}
        error={deleteError}
        onConfirm={confirmDelete}
      />
    </section>
  )
}
