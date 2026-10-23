'use client'

import { useState, useEffect } from 'react'
import { Plus, Search, Loader2, X, TrendingUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getAssetQuote, searchAssets } from '@/app/actions/quotes'


interface AddInvestmentModalProps {
  onAddInvestment: (newAsset: {
    ticker: string
    name: string
    quantity: number
    price: number
    totalValue: number
    type: string
  }) => void
}

export function AddInvestmentModal({ onAddInvestment }: AddInvestmentModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [ticker, setTicker] = useState('')
  const [suggestions, setSuggestions] = useState<Array<{ ticker: string; name: string; type: string }>>([])
  const [showDropdown, setShowDropdown] = useState(false)

  const [quantity, setQuantity] = useState<number>(1)
  const [price, setPrice] = useState<number | null>(null)
  const [assetName, setAssetName] = useState('')

  const [searching, setSearching] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Efeito para buscar sugestões enquanto digita
  useEffect(() => {
    if (ticker.trim().length > 0) {
      searchAssets(ticker).then((results) => {
        setSuggestions(results)
        setShowDropdown(results.length > 0)
      })
    } else {
      setSuggestions([])
      setShowDropdown(false)
    }
  }, [ticker])

  const handleSelectAsset = (selectedTicker: string) => {
    setTicker(selectedTicker)
    setShowDropdown(false)
    handleSearchQuote(selectedTicker)
  }

  const handleSearchQuote = async (targetTicker?: string) => {
    const symbolToSearch = targetTicker || ticker
    if (!symbolToSearch) return

    setSearching(true)
    setErrorMsg('')
    setShowDropdown(false)

    const res = await getAssetQuote(symbolToSearch)
    setSearching(false)

    if (res.success && res.data) {
      setPrice(res.data.price)
      setAssetName(res.data.name)
      setTicker(res.data.ticker)
    } else {
      setErrorMsg(res.error || 'Erro ao carregar cotação.')
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!price || !ticker) return

    onAddInvestment({
      ticker: ticker.toUpperCase(),
      name: assetName || ticker.toUpperCase(),
      quantity: Number(quantity),
      price: price,
      totalValue: price * Number(quantity),
      type: 'FII',
    })

    setIsOpen(false)
    setTicker('')
    setPrice(null)
    setQuantity(1)
  }

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => setIsOpen(true)}
        className=" group flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-colors hover:bg-emerald-500"
      >
          <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
        <span>Adicionar FII / Ativo</span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="relative w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100 z-10"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <h3 className="text-lg font-semibold">Adicionar Fundo Imobiliário</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                {errorMsg && (
                  <div className="rounded bg-red-500/10 p-3 text-xs text-red-400 border border-red-500/20">
                    {errorMsg}
                  </div>
                )}

                {/* Input com Autocomplete */}
                <div className="relative">
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Código ou Nome do Ativo
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ex: M, MXRF11, XPML..."
                      value={ticker}
                      onChange={(e) => setTicker(e.target.value.toUpperCase())}
                      onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition-colors"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => handleSearchQuote()}
                      disabled={searching || !ticker}
                      className="flex cursor-pointer items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition-colors"
                    >
                      {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      <span>Buscar</span>
                    </button>
                  </div>

                  {/* Dropdown de Sugestões */}
                  {showDropdown && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-1 shadow-xl">
                      {suggestions.map((item) => (
                        <button
                          key={item.ticker}
                          type="button"
                          onClick={() => handleSelectAsset(item.ticker)}
                          className="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left hover:bg-slate-800 transition-colors"
                        >
                          <div>
                            <span className="font-semibold text-emerald-400 text-sm">{item.ticker}</span>
                            <span className="ml-2 text-xs text-slate-400">{item.name}</span>
                          </div>
                          <span className="text-[10px] rounded bg-slate-800 px-1.5 py-0.5 text-slate-400 border border-slate-700">
                            {item.type}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Preço Retornado */}
                {price !== null && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3"
                  >
                    <span className="block text-xs text-slate-400">{assetName}</span>
                    <div className="flex justify-between items-baseline mt-1">
                      <span className="text-xs font-medium text-emerald-400">Cotação Atual:</span>
                      <span className="text-base font-semibold text-emerald-400">
                        R$ {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </motion.div>
                )}

                {/* Quantidade e Total */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Quantidade de Cotas
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={quantity === 0 ? '' : quantity}
                      onChange={(e) => {
                        const val = e.target.value
                        setQuantity(val === '' ? 0 : Math.max(1, parseInt(val, 10) || 0))
                      }}
                      onBlur={() => {
                        if (!quantity || quantity < 1) setQuantity(1)
                      }}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none transition-colors"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Valor Total Estimado
                    </label>
                    <div className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                      R$ {((price || 0) * quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!price}
                    className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
                  >
                    Salvar na Carteira
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}