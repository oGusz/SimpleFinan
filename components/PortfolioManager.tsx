'use client'

import { useState, useEffect } from 'react'
import {
  TrendingUp,
  SlidersHorizontal,
  Check,
  X,
  CheckSquare,
  Square,
  Trash2,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { AddInvestmentModal } from '@/components/AddInvestmentModal'

export interface Asset {
  ticker: string
  name: string
  quantity: number
  price: number
  dividendYield?: number
  lastDividend?: number
}

interface PortfolioManagerProps {
  assets: Asset[]
  onAddAsset: (asset: Asset) => void
  onUpdateQuantity: (ticker: string, quantity: number) => void
  onRemoveAsset?: (ticker: string | string[]) => Promise<void> | void
}

export default function PortfolioManager({
  assets = [],
  onAddAsset,
  onUpdateQuantity,
  onRemoveAsset,
}: PortfolioManagerProps) {
  const [selectedTickers, setSelectedTickers] = useState<string[]>([])
  const [bulkAmount, setBulkAmount] = useState('')
  const [bulkMode, setBulkMode] = useState<'subtract' | 'add'>('subtract')
  const [isBulkPanelOpen, setIsBulkPanelOpen] = useState(false)

  // ESTADOS DO MODAL DE EXCLUSÃO
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const parseSafeNumber = (val: any): number => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val
    if (!val) return 0
    const str = String(val).replace(/\./g, '').replace(',', '.')
    const parsed = parseFloat(str)
    return isNaN(parsed) ? 0 : parsed
  }

  const handleDelta = (ticker: string, currentQty: any, delta: number) => {
    const validQty = parseSafeNumber(currentQty)
    const newQty = Math.max(0, validQty + delta)
    onUpdateQuantity(ticker, newQty)
  }

  const handleSelectAll = () => {
    if (selectedTickers.length === assets.length) {
      setSelectedTickers([])
    } else {
      setSelectedTickers(assets.map((a) => a.ticker))
    }
  }

  const toggleSelect = (ticker: string) => {
    setSelectedTickers((prev) =>
      prev.includes(ticker)
        ? prev.filter((t) => t !== ticker)
        : [...prev, ticker]
    )
  }

  const promptDelete = (tickers: string[]) => {
    setDeleteError(null)
    setDeleteTarget(tickers)
  }

  const closeDeleteModal = () => {
    if (isDeleting) return
    setDeleteTarget(null)
    setDeleteError(null)
  }

  const confirmDelete = async () => {
    if (!deleteTarget || deleteTarget.length === 0 || !onRemoveAsset) return

    setIsDeleting(true)
    setDeleteError(null)

    try {
      if (deleteTarget.length === 1) {
        await onRemoveAsset(deleteTarget[0])
      } else {
        await onRemoveAsset(deleteTarget)
      }

      setSelectedTickers((prev) => prev.filter((t) => !deleteTarget.includes(t)))
      setDeleteTarget(null)
    } catch (err: any) {
      console.error('Erro ao excluir ativo(s):', err)
      setDeleteError(
        err?.message || 'Ocorreu um erro ao tentar excluir. Tente novamente.'
      )
    } finally {
      setIsDeleting(false)
    }
  }

  const handleApplyBulkAmount = () => {
    const amount = parseSafeNumber(bulkAmount)
    if (amount <= 0) return

    selectedTickers.forEach((ticker) => {
      const asset = assets.find((a) => a.ticker === ticker)
      if (asset) {
        const currentQty = parseSafeNumber(asset.quantity)
        const newQty =
          bulkMode === 'subtract'
            ? Math.max(0, currentQty - amount)
            : currentQty + amount
        onUpdateQuantity(ticker, newQty)
      }
    })

    setBulkAmount('')
    setIsBulkPanelOpen(false)
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 shadow-xl space-y-5">
      
      {/* 1. CABEÇALHO VERTICAL (TÍTULO + BOTÃO DE ADICIONAR) */}
      <div className="flex flex-col gap-3 w-full pb-1 select-none">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
            Ativos da Carteira
          </h2>
          <p className="text-xs text-slate-400">
            {assets.length} ativo(s) cadastrado(s)
          </p>
        </div>

        <div className="w-full [&>button]:w-full [&>button]:h-11 [&>button]:rounded-xl [&>button]:font-semibold [&>button]:text-xs [&>button]:active:scale-[0.98] [&>button]:transition-transform">
          <AddInvestmentModal
            onAddInvestment={(newAsset) => {
              if (typeof onAddAsset === 'function') {
                onAddAsset({
                  ticker: newAsset.ticker.toUpperCase(),
                  name: newAsset.name || newAsset.ticker,
                  quantity: Number(newAsset.quantity),
                  price: Number(newAsset.price),
                  dividendYield: 10,
                })
              }
            }}
          />
        </div>
      </div>

      {/* 2. BARRA DE AÇÕES EM MASSA */}
      {selectedTickers.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl animate-in fade-in duration-200">
          <span className="text-xs font-semibold text-emerald-400">
            {selectedTickers.length} ativo(s) selecionado(s)
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsBulkPanelOpen(!isBulkPanelOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white hover:border-emerald-500 transition-colors"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-400" />
              <span>Ajustar Quantidade</span>
            </button>

            {onRemoveAsset && (
              <button
                type="button"
                onClick={() => promptDelete(selectedTickers)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Excluir Selecionados</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. PAINEL DE AJUSTE EXATO EM LOTE */}
      {isBulkPanelOpen && selectedTickers.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBulkMode(bulkMode === 'subtract' ? 'add' : 'subtract')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
                bulkMode === 'subtract'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}
            >
              {bulkMode === 'subtract' ? 'Subtrair (-)' : 'Adicionar (+)'}
            </button>

            <input
              type="text"
              placeholder="Ex: 100"
              value={bulkAmount}
              onChange={(e) => setBulkAmount(e.target.value)}
              className="w-36 rounded-md border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-white outline-none focus:border-emerald-500"
            />
            <span className="text-xs text-slate-400">cotas dos selecionados</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleApplyBulkAmount}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400"
            >
              <Check className="h-3.5 w-3.5" /> Aplicar
            </button>
            <button
              type="button"
              onClick={() => setIsBulkPanelOpen(false)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 4. LISTA DE ATIVOS VERTICAL (ÚNICA) */}
      <div className="w-full flex flex-col gap-3">
        <div className="flex items-center justify-between px-1 py-1 text-xs select-none">
          <button
            type="button"
            onClick={handleSelectAll}
            className="flex items-center gap-2 font-semibold text-slate-300 active:scale-95 transition-transform"
          >
            {assets.length > 0 && selectedTickers.length === assets.length ? (
              <CheckSquare className="h-4 w-4 text-emerald-400" />
            ) : (
              <Square className="h-4 w-4 text-slate-500" />
            )}
            <span>{selectedTickers.length > 0 ? 'Desmarcar todos' : 'Selecionar todos'}</span>
          </button>

          <span className="text-[11px] font-medium text-slate-400 bg-slate-900 px-2.5 py-0.5 rounded-full border border-slate-800">
            {selectedTickers.length > 0
              ? `${selectedTickers.length} de ${assets.length} selecionados`
              : `${assets.length} ativos`}
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-2xl border border-slate-800/80 bg-slate-950/40">
              <Square className="h-5 w-5 text-slate-600 mb-2" />
              <p className="text-xs font-medium text-slate-300">Nenhum ativo cadastrado</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Adicione cotas para acompanhar seu portfólio.</p>
            </div>
          ) : (
            assets.map((asset) => (
              <AssetRow
                key={asset.ticker}
                asset={asset}
                isSelected={selectedTickers.includes(asset.ticker)}
                onToggleSelect={() => toggleSelect(asset.ticker)}
                onDelta={(delta) => handleDelta(asset.ticker, asset.quantity, delta)}
                onUpdateQuantity={(qty) => onUpdateQuantity(asset.ticker, qty)}
                onRemove={onRemoveAsset ? () => promptDelete([asset.ticker]) : undefined}
                parseSafeNumber={parseSafeNumber}
              />
            ))
          )}
        </div>
      </div>

      {/* 5. MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Excluir {deleteTarget.length > 1 ? 'ativos' : 'ativo'}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Tem certeza de que deseja excluir{' '}
                  <span className="font-semibold text-rose-400">
                    {deleteTarget.length > 1
                      ? `${deleteTarget.length} ativos (${deleteTarget.join(', ')})`
                      : deleteTarget[0]}
                  </span>
                  ? Essa ação não pode ser desfeita.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400 animate-in fade-in duration-150">
                {deleteError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={isDeleting}
                className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-4 py-2 text-xs font-bold text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Confirmar Exclusão</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function AssetRow({
  asset,
  isSelected,
  onToggleSelect,
  onDelta,
  onUpdateQuantity,
  onRemove,
  parseSafeNumber,
}: {
  asset: Asset
  isSelected: boolean
  onToggleSelect: () => void
  onDelta: (delta: number) => void
  onUpdateQuantity: (qty: number) => void
  onRemove?: () => void
  parseSafeNumber: (val: any) => number
}) {
  const [inputValue, setInputValue] = useState<string>(
    asset.quantity ? String(asset.quantity) : ''
  )

  useEffect(() => {
    setInputValue(asset.quantity ? String(asset.quantity) : '')
  }, [asset.quantity])

  const currentQty = parseSafeNumber(asset.quantity)
  const totalAssetValue = currentQty * (asset.price || 0)

  const handleDeltaClick = (delta: number) => {
    onDelta(delta)
    const nextQty = Math.max(0, currentQty + delta)
    setInputValue(nextQty === 0 ? '' : String(nextQty))
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value
    if (/^[0-9]*[.,]?[0-9]*$/.test(rawVal)) {
      setInputValue(rawVal)
      if (rawVal === '') {
        onUpdateQuantity(0)
      } else {
        const parsed = parseSafeNumber(rawVal)
        onUpdateQuantity(parsed)
      }
    }
  }

  const handleInputBlur = () => {
    if (inputValue === '' || parseSafeNumber(inputValue) === 0) {
      setInputValue('')
    } else {
      setInputValue(String(parseSafeNumber(inputValue)))
    }
  }

  return (
    <div
      className={`flex flex-col gap-3 p-4 rounded-2xl border transition-all select-none ${
        isSelected
          ? 'bg-emerald-500/[0.08] border-emerald-500/40 shadow-sm'
          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700/80'
      }`}
    >
      {/* 1. TOPO: ATIVO + AÇÃO */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/60">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleSelect}
            className="p-1 text-slate-400 hover:text-white active:scale-90 transition-transform"
            aria-label="Selecionar ativo"
          >
            {isSelected ? (
              <CheckSquare className="h-5 w-5 text-emerald-400" />
            ) : (
              <Square className="h-5 w-5 text-slate-600" />
            )}
          </button>

          <div className="flex flex-col">
            <span className="font-bold text-white font-mono text-base leading-tight">
              {asset.ticker}
            </span>
            <span className="text-xs text-slate-400 truncate max-w-[200px]">
              {asset.name}
            </span>
          </div>
        </div>

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="p-2 text-slate-500 hover:text-rose-400 active:text-rose-400 active:bg-rose-500/10 rounded-xl transition-all"
            title="Excluir Ativo"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 2. DADOS EMPILHADOS VERTICALMENTE */}
      <div className="flex flex-col gap-2.5 text-xs">
        {/* Preço Atual */}
        <div className="flex items-center justify-between py-1 border-b border-slate-800/40">
          <span className="text-slate-400 font-medium">Preço Atual:</span>
          <span className="font-semibold text-slate-200 text-sm">
            R$ {(asset.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* Quantidade e Controles */}
        <div className="flex flex-col gap-1.5 py-1 border-b border-slate-800/40">
          <span className="text-slate-400 font-medium">Quantidade:</span>
          
          <div className="flex items-center justify-between gap-1 w-full bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => handleDeltaClick(-10)}
              className="h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-bold text-slate-400 active:scale-95 transition-transform"
            >
              -10
            </button>
            <button
              type="button"
              onClick={() => handleDeltaClick(-1)}
              className="h-8 w-8 rounded-lg bg-slate-950 border border-slate-800 text-sm font-bold text-slate-200 active:scale-95 transition-transform flex items-center justify-center"
            >
              -
            </button>

            <input
              type="text"
              inputMode="numeric"
              value={inputValue}
              placeholder="0"
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              className="h-8 flex-1 max-w-[80px] rounded-lg bg-slate-950 border border-slate-800 text-center text-xs text-emerald-400 font-bold outline-none focus:border-emerald-500 transition-colors"
            />

            <button
              type="button"
              onClick={() => handleDeltaClick(1)}
              className="h-8 w-8 rounded-lg bg-slate-950 border border-slate-800 text-sm font-bold text-slate-200 active:scale-95 transition-transform flex items-center justify-center"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => handleDeltaClick(10)}
              className="h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-bold text-slate-400 active:scale-95 transition-transform"
            >
              +10
            </button>
          </div>
        </div>

        {/* Total Acumulado */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-slate-400 font-medium">Total Acumulado:</span>
          <span className="font-bold text-sm text-emerald-400">
            R$ {totalAssetValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  )
}