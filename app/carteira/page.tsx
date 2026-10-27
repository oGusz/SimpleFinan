'use client'

import { useState, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { usePortfolio } from '@/context/PortfolioContext'
import PortfolioManager, { Asset } from '@/components/PortfolioManager'
import { FutureProjectionSimulator } from '@/components/FutureProjectionSimulator'
import { RebalanceWidget } from '@/components/RebalanceWidget'
import { BottomNav } from '@/components/bottom-nav'

import { ArrowLeft, GripHorizontal, Target, Trophy } from 'lucide-react'
import Link from 'next/link'

type SectionId = 'portfolio' | 'simulator' | 'rebalance'

const DEFAULT_SECTIONS: SectionId[] = ['portfolio', 'simulator', 'rebalance']
const STORAGE_KEY = 'carteira_sections_order_v1'

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
      <div className="flex h-screen items-center justify-center flex-col gap-3 text-slate-500">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        <span className="text-xs font-medium tracking-wide">Carregando carteira...</span>
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
                const list = Array.isArray(ticker) ? ticker : [ticker]; list.forEach(t => updateQuantity(t, 0));
              }
            }}
          />
        )
      case 'simulator':
        return <FutureProjectionSimulator assets={formattedAssets} />
      case 'rebalance':
        return (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-200 px-1">
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
    <>
      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28 select-none">
        
        {/* HEADER ESTILO IOS (VOLTAR + STATUS EM TEMPO REAL) */}
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-slate-300 active:scale-90 transition-all shadow-sm"
              aria-label="Voltar para o Painel"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>

            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-400 border border-emerald-500/20 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>B3 ao vivo</span>
            </div>
          </div>

          <div>
            <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Patrimônio & Alocação
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Minha Carteira
            </h1>
          </div>
        </header>

        {/* CARD META DE PATRIMÔNIO (INSET GROUPED) */}
        <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 shadow-sm backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                  Meta de Patrimônio
                  {progressPercent >= 100 && (
                    <Trophy className="h-3.5 w-3.5 text-amber-400" />
                  )}
                </h2>
                <p className="text-[11px] text-slate-400">Progresso acumulado</p>
              </div>
            </div>

            {/* Input touch-friendly */}
            <div className="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400 font-medium">R$</span>
              <input
                type="text"
                value={formatCurrencyInput(Math.round(goalAmount * 100))}
                onChange={(event) => {
                  const numericValue = parseCurrencyToNumber(event.target.value)
                  updateGoal(numericValue)
                }}
                className="w-24 bg-transparent text-right text-xs font-bold text-emerald-400 outline-none"
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-400">
                Atual: <strong className="text-white">R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
              </span>
              <span className="text-emerald-400 font-bold">{progressPercent}%</span>
            </div>

            <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/80 p-0.5">
              <div
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </section>

        {/* ÁREA DE SEÇÕES COM ALÇA DE REORDENAÇÃO MOBILE */}
        {isClient && (
          <DragDropContext onDragEnd={handleOnDragEnd}>
            <Droppable droppableId="carteira-sections">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-4"
                >
                  {sections.map((sectionId, index) => (
                    <Draggable key={sectionId} draggableId={sectionId} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`relative rounded-2xl border transition-all ${
                            snapshot.isDragging
                              ? 'border-emerald-500/60 bg-slate-900/95 shadow-2xl z-50 ring-2 ring-emerald-500/20'
                              : 'border-slate-800/80 bg-slate-900/40 backdrop-blur-sm'
                          } p-3 sm:p-4`}
                        >
                          {/* Alça de arraste nativa (Touch Handle) */}
                          <div className="flex justify-center pb-2">
                            <div
                              {...provided.dragHandleProps}
                              className="flex items-center justify-center h-5 w-16 rounded-full bg-slate-800/70 border border-slate-700/50 text-slate-500 active:text-emerald-400 active:bg-slate-800 transition-colors cursor-grab active:cursor-grabbing"
                              aria-label="Segure para reordenar"
                            >
                              <GripHorizontal className="h-3.5 w-3.5" />
                            </div>
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

      {/* NAVEGAÇÃO INFERIOR FIXA */}
      <BottomNav
        onQuickAction={() => {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />
    </>
  )
}