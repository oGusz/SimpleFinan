'use client'

import { useState } from 'react'
import {
  Plus,
  ListPlus,
  Search,
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
  const [isBatchOpen, setIsBatchOpen] = useState(false)
  const [batchInput, setBatchInput] = useState('')
  const [singleTicker, setSingleTicker] = useState('')
  const [singleQuantity, setSingleQuantity] = useState('')

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

  const handleSingleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!singleTicker.trim()) return

    onAddAsset({
      ticker: singleTicker.trim().toUpperCase(),
      name: singleTicker.trim().toUpperCase(),
      quantity: parseSafeNumber(singleQuantity),
      price: 0,
    })

    setSingleTicker('')
    setSingleQuantity('')
  }



  const handleBatchAdd = () => {
    const tickers = batchInput
      .split(/[\n,\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean)

    tickers.forEach((ticker) => {
      onAddAsset({
        ticker,
        name: ticker,
        quantity: 0,
        price: 0,
      })
    })

    setBatchInput('')
    setIsBatchOpen(false)
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

  // ABRE O MODAL PARA UM ÚNICO ATIVO OU VÁRIOS
  const promptDelete = (tickers: string[]) => {
    setDeleteError(null)
    setDeleteTarget(tickers)
  }

  const closeDeleteModal = () => {
    if (isDeleting) return
    setDeleteTarget(null)
    setDeleteError(null)
  }

  // EXECUTA A EXCLUSÃO
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

      // Remove da seleção de checkboxes se estivesse selecionado
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

    // EXECUTA A EXCLUSÃO (Já está correto no seu componente!)
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

        // Remove da seleção de checkboxes se estivesse selecionado
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
  }



  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl space-y-6">
      {/* CABEÇALHO */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
            Ativos da Carteira
          </h2>
          <p className="text-xs text-slate-400">
            {assets.length} ativo(s) cadastrado(s)
          </p>
        </div>

        <div className="flex items-center justify-end gap-4">
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

      {/* BARRA DE AÇÕES EM MASSA */}
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

      {/* PAINEL DE AJUSTE EXATO EM LOTE */}
      {isBulkPanelOpen && selectedTickers.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBulkMode(bulkMode === 'subtract' ? 'add' : 'subtract')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${bulkMode === 'subtract'
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





      {/* ADIÇÃO EM LOTE */}
      {isBatchOpen && (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3 animate-in fade-in duration-200">
          <label className="block text-xs font-medium text-slate-300">
            Cole os tickers separados por vírgula, espaço ou linha:
          </label>
          <textarea
            value={batchInput}
            onChange={(e) => setBatchInput(e.target.value)}
            placeholder="HGLG11, MXRF11, XPLG11..."
            rows={3}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 p-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition-colors"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsBatchOpen(false)}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleBatchAdd}
              className="rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition-colors"
            >
              Importar Todos
            </button>
          </div>
        </div>
      )}

      {/* TABELA DE ATIVOS */}
      <div className="rounded-xl border border-slate-800/80 overflow-hidden bg-slate-950/40">
        {/* CABEÇALHO DA TABELA */}
        <div className="grid grid-cols-12 items-center border-b border-slate-800 py-3 px-4 text-xs font-medium text-slate-400">
          <div className="col-span-1 flex items-center">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-slate-400 hover:text-white transition-colors"
              title="Selecionar Todos"
            >
              {assets.length > 0 && selectedTickers.length === assets.length ? (
                <CheckSquare className="h-4 w-4 text-emerald-400" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="col-span-3">Ativo</div>
          <div className="col-span-2 text-right">Preço Atual</div>
          <div className="col-span-3 text-center">Quantidade</div>
          <div className="col-span-2 text-right">Total Acumulado</div>
          <div className="col-span-1 text-right">Ação</div>
        </div>

        {/* CORPO DE LINHAS */}
        <div className="divide-y divide-slate-800/60">
          {assets.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Nenhum ativo adicionado ainda.
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

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
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

            {/* MENSAGEM DE ERRO (SE A EXCLUSÃO FALHAR) */}
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

function AssetRow({
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
      className={`grid grid-cols-12 items-center py-3 px-4 text-xs transition-colors ${isSelected ? 'bg-slate-800/90' : 'bg-slate-900'
        }`}
    >
      {/* CHECKBOX */}
      <div className="col-span-1 flex items-center">
        <button
          type="button"
          onClick={onToggleSelect}
          className="text-slate-400 hover:text-white transition-colors"
        >
          {isSelected ? (
            <CheckSquare className="h-4 w-4 text-emerald-400" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* ATIVO */}
      <div className="col-span-3">
        <div className="font-bold text-white font-mono">{asset.ticker}</div>
        <div className="text-[10px] text-slate-400 truncate">{asset.name}</div>
      </div>

      {/* PREÇO ATUAL */}
      <div className="col-span-2 text-right font-medium text-slate-200">
        R$ {(asset.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>

      {/* CONTROLE DE QUANTIDADES */}
      <div className="col-span-3 flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => handleDeltaClick(-10)}
          className="h-7 px-1.5 rounded-md border border-slate-800 bg-slate-950 text-[10px] font-bold text-slate-400 hover:border-rose-500/50 hover:text-rose-400 transition-colors"
        >
          -10
        </button>
        <button
          type="button"
          onClick={() => handleDeltaClick(-1)}
          className="h-7 w-7 rounded-md border border-slate-800 bg-slate-950 text-xs font-bold text-slate-300 hover:border-rose-500/50 hover:text-rose-400 transition-colors flex items-center justify-center"
        >
          -
        </button>

        <input
          type="text"
          value={inputValue}
          placeholder="0"
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          className="w-20 rounded-md border border-slate-800 bg-slate-950 py-1 text-center text-xs text-emerald-400 font-bold outline-none focus:border-emerald-500 transition-colors"
        />

        <button
          type="button"
          onClick={() => handleDeltaClick(1)}
          className="h-7 w-7 rounded-md border border-slate-800 bg-slate-950 text-xs font-bold text-slate-300 hover:border-emerald-500/50 hover:text-emerald-400 transition-colors flex items-center justify-center"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => handleDeltaClick(10)}
          className="h-7 px-1.5 rounded-md border border-slate-800 bg-slate-950 text-[10px] font-bold text-slate-400 hover:border-emerald-500/50 hover:text-emerald-400 transition-colors"
        >
          +10
        </button>
      </div>

      {/* TOTAL ACUMULADO */}
      <div className="col-span-2 text-right font-bold text-emerald-400">
        R$ {totalAssetValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>

      {/* BOTÃO EXCLUIR ATIVO */}
      <div className="col-span-1 text-right">
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors inline-flex items-center justify-center"
            title="Excluir Ativo"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}