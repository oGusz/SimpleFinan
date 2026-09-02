'use client'

import { useState, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { usePortfolio } from '@/context/PortfolioContext'
import PortfolioManager, { Asset } from '@/components/PortfolioManager'
import { FutureProjectionSimulator } from '@/components/FutureProjectionSimulator'
import { RebalanceWidget } from '@/components/RebalanceWidget'

import { ArrowLeft, GripVertical, Target, Trophy } from 'lucide-react'
import Link from 'next/link'

type SectionId = 'portfolio' | 'simulator' | 'rebalance'

const DEFAULT_SECTIONS: SectionId[] = ['portfolio', 'simulator', 'rebalance']
const STORAGE_KEY = 'carteira_sections_order_v1'

// Funções de formatação de moeda em tempo real
const formatCurrencyInput = (value: number): string => {
  if (!value && value !== 0) return '0,00'
  return (value / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const parseCurrencyToNumber = (value: string): number => {
  const digitsOnly = value.replace(/\D/g, '')
  if (!digitsOnly) return 0
  return Number(digitsOnly) / 100
}

export default function CarteiraPage() {
  const { assets, goalAmount, updateQuantity, updateGoal, addAsset, removeAsset, isLoaded } = usePortfolio()
  const [sections, setSections] = useState<SectionId[]>(DEFAULT_SECTIONS)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
    const savedOrder = localStorage.getItem(STORAGE_KEY)
    if (savedOrder) {
      try {
        setSections(JSON.parse(savedOrder))
      } catch (e) {
        console.error('Erro ao ler ordem:', e)
      }
    }
  }, [])

  const handleOnDragEnd = (result: DropResult) => {
    if (!result.destination) return
    const items = Array.from(sections)
    const [reorderedItem] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, reorderedItem)

    setSections(items)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }

  // Handler para processar o cadastro feito através do AddInvestmentModal
  const handleAddInvestment = (newAsset: {
    ticker: string
    name: string
    quantity: number
    price: number
    totalValue: number
    type: string
  }) => {
    addAsset({
      ticker: newAsset.ticker.toUpperCase(),
      name: newAsset.name || newAsset.ticker,
      quantity: Number(newAsset.quantity),
      price: Number(newAsset.price),
      dividendYield: 10,
    })
  }

  const formattedAssets: Asset[] = assets.map((asset) => {
    const rawAsset = asset as Asset
    const price = rawAsset.price || 0
    const dividendYield = rawAsset.dividendYield ?? 0
    const lastDividend = rawAsset.lastDividend ?? (price * (dividendYield / 100 / 12))

    return {
      ...rawAsset,
      price,
      dividendYield,
      lastDividend,
    }
  })

  const fiiAssetsForRebalance = assets.map((item) => ({
    ticker: item.ticker,
    name: item.name,
    quantity: item.quantity,
    price: item.price,
    pvp: 0.92,
    category: 'TIJOLO_DESCONTO' as const,
    targetAllocation: Number((100 / (assets.length || 1)).toFixed(2)),
  }))

  const totalValue = assets.reduce(
    (acc, item) => acc + item.quantity * item.price,
    0
  )

  const progressPercent = goalAmount > 0
    ? Math.min(100, Number(((totalValue / goalAmount) * 100).toFixed(1)))
    : 0

  if (!isLoaded) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-slate-500 animate-pulse">
        Carregando sua carteira em tempo real...
      </div>
    )
  }

  const renderSection = (id: SectionId) => {
    switch (id) {
      case 'portfolio':
        return (
          <PortfolioManager
            assets={formattedAssets}
            onAddAsset={addAsset}
            onUpdateQuantity={(ticker, newQty) => {
              const safeQty = typeof newQty === 'number' && !isNaN(newQty) ? newQty : 0
              updateQuantity(ticker, safeQty)
            }}
            onRemoveAsset={async (ticker) => {
              if (typeof removeAsset === 'function') {
                await removeAsset(ticker)
              } else {
                await updateQuantity(ticker, 0)
              }
            }}
          />
        )
      case 'simulator':
        return <FutureProjectionSimulator assets={formattedAssets} />
      case 'rebalance':
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-200 pt-4 pl-4 pr-4 pb-0">
              Calculadora de Rebalanceamento
            </h2>
            <RebalanceWidget assets={fiiAssetsForRebalance} />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-12 sm:px-8 sm:py-16">
      {/* CABEÇALHO DA PÁGINA */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/60 pb-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Painel</span>
            </Link>
            <span className="text-slate-700">•</span>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Cotações B3 ao vivo</span>
            </div>
          </div>

          <h1 className="text-xl font-semibold text-foreground mt-1">
            Minha Carteira de Investimentos
          </h1>
          <p className="text-xs text-muted-foreground">
            Gerencie suas cotas, acompanhe suas metas e simule seu crescimento
          </p>
        </div>

     
      </header>

      {/* SEÇÃO DA META FIXA NO TOPO */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Target className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Meta de Patrimônio
                {progressPercent >= 100 && (
                  <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1">
                    <Trophy className="h-3 w-3" /> Meta Alcançada!
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">Acompanhe a evolução para atingir sua liberdade financeira</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
            <span className="text-xs text-slate-400 font-medium">Meta: R$</span>
            <input
              type="text"
              value={formatCurrencyInput(Math.round(goalAmount * 100))}
              onChange={(event) => {
                const numericValue = parseCurrencyToNumber(event.target.value)
                updateGoal(numericValue)
              }}
              className="w-36 bg-transparent text-right text-sm font-bold text-emerald-400 outline-none"
              placeholder="0,00"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-400">
              Atual: <strong className="text-white">R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            </span>
            <span className="text-emerald-400 font-bold">{progressPercent}% Concluído</span>
          </div>

          <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/80 p-0.5">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* ÁREA COM DRAG AND DROP APENAS PARA OS OUTROS BLOCOS */}
      {isClient && (
        <DragDropContext onDragEnd={handleOnDragEnd}>
          <Droppable droppableId="carteira-sections">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="space-y-8"
              >
                {sections.map((sectionId, index) => (
                  <Draggable key={sectionId} draggableId={sectionId} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`group relative rounded-2xl border transition-all ${
                          snapshot.isDragging
                            ? 'border-emerald-500/50 bg-slate-900/90 shadow-2xl z-50 ring-2 ring-emerald-500/20'
                            : 'border-transparent'
                        }`}
                      >
                        <div
                          {...provided.dragHandleProps}
                          className="absolute -top-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 border border-slate-700 hover:border-emerald-500 text-slate-400 hover:text-white px-3 py-1 rounded-full cursor-grab active:cursor-grabbing flex items-center gap-1 text-[11px] font-medium shadow-lg z-20"
                        >
                          <GripVertical className="h-3 w-3" />
                          <span>Segure para reordenar</span>
                        </div>

                        <div>{renderSection(sectionId)}</div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </main>
  )
}