'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import useSWR from 'swr'

export interface Asset {
  ticker: string
  name: string
  quantity: number
  price: number
  dividendYield?: number
}

interface PortfolioContextType {
  assets: Asset[]
  goalAmount: number
  isLoaded: boolean
  updateQuantity: (ticker: string, quantity: number) => void
  addAsset: (newAsset: Asset) => void
  removeAsset: (ticker: string | string[]) => void
  updateGoal: (newGoal: number) => void
}

const DEFAULT_ASSETS: Asset[] = [
  { ticker: 'MXRF11', name: 'Mauá Capital Hedge', quantity: 150, price: 9.22, dividendYield: 12.2 },
  { ticker: 'XPML11', name: 'XP Malls', quantity: 20, price: 115.40, dividendYield: 9.8 },
  { ticker: 'HGLG11', name: 'CSG HG Logística', quantity: 12, price: 162.00, dividendYield: 8.9 },
]

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined)

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [goalAmount, setGoalAmount] = useState<number>(10000)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    try {
      const savedAssets = localStorage.getItem('@portfolio:assets')
      const savedGoal = localStorage.getItem('@portfolio:goal')

      if (savedAssets) {
        setAssets(JSON.parse(savedAssets))
      } else {
        setAssets(DEFAULT_ASSETS)
      }

      if (savedGoal) {
        setGoalAmount(Number(savedGoal))
      }
    } catch (e) {
      setAssets(DEFAULT_ASSETS)
    } finally {
      setIsLoaded(true)
    }
  }, [])

  const tickersKey = assets.map((a) => a.ticker.toUpperCase()).sort().join(',')

  // ✅ BARRA INCLUÍDA ANTES DE api/quotes
  const { data: quotesData } = useSWR(
    isLoaded && assets.length > 0 ? `/api/quotes?tickers=${tickersKey}` : null,
    fetcher,
    {
      refreshInterval: 60000,
      revalidateOnFocus: true,
    }
  )

  // 3. Atualiza os preços no estado local assim que novas cotações chegam da API
  useEffect(() => {
    if (!quotesData) return

    // Tenta encontrar a lista de cotações independente do formato do JSON de retorno
    const quotesList: any[] = Array.isArray(quotesData)
      ? quotesData
      : quotesData.quotes || quotesData.data || quotesData.results || []

    if (!Array.isArray(quotesList) || quotesList.length === 0) return

    setAssets((prev) =>
      prev.map((asset) => {
        const quote = quotesList.find((q: any) => {
          const rawTicker = (q.ticker || q.symbol || q.stock || '').toString().toUpperCase()
          // Remove sufixo .SA caso a API retorne algo como MXRF11.SA
          const cleanTicker = rawTicker.replace('.SA', '')
          return cleanTicker === asset.ticker.toUpperCase()
        })

        if (!quote) return asset

        // Tenta extrair o preço de campos comuns em APIs de cotações
        const rawPrice =
          quote.price ??
          quote.regularMarketPrice ??
          quote.close ??
          quote.regularMarketPreviousClose ??
          quote.priceInCents / 100

        const parsedPrice = typeof rawPrice === 'string' ? parseFloat(rawPrice) : rawPrice

        return typeof parsedPrice === 'number' && !isNaN(parsedPrice) && parsedPrice > 0
          ? { ...asset, price: parsedPrice }
          : asset
      })
    )
  }, [quotesData])

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('@portfolio:assets', JSON.stringify(assets))
      localStorage.setItem('@portfolio:goal', goalAmount.toString())
    }
  }, [assets, goalAmount, isLoaded])

  const updateQuantity = (ticker: string, quantity: number) => {
    setAssets((prev) =>
      prev
        .map((item) => {
          if (item.ticker.toUpperCase() === ticker.toUpperCase()) {
            return { ...item, quantity: Math.max(0, quantity) }
          }
          return item
        })
        .filter((item) => item.quantity > 0)
    )
  }

  const addAsset = (newAsset: Asset) => {
    setAssets((prev) => {
      const existing = prev.find(
        (item) => item.ticker.toUpperCase() === newAsset.ticker.toUpperCase()
      )
      if (existing) {
        return prev.map((item) =>
          item.ticker.toUpperCase() === newAsset.ticker.toUpperCase()
            ? { ...item, quantity: item.quantity + newAsset.quantity, price: newAsset.price || item.price }
            : item
        )
      }
      return [...prev, newAsset]
    })
  }

  const removeAsset = (ticker: string | string[]) => {
    const tickersToRemove = (Array.isArray(ticker) ? ticker : [ticker]).map((t) =>
      t.toUpperCase()
    )

    setAssets((prev) =>
      prev.filter((item) => !tickersToRemove.includes(item.ticker.toUpperCase()))
    )
  }

  const updateGoal = (newGoal: number) => {
    setGoalAmount(newGoal)
  }

  return (
    <PortfolioContext.Provider
      value={{
        assets,
        goalAmount,
        isLoaded,
        updateQuantity,
        addAsset,
        removeAsset,
        updateGoal,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  )
}

export function usePortfolio() {
  const context = useContext(PortfolioContext)
  if (!context) {
    throw new Error('usePortfolio deve ser usado dentro de um PortfolioProvider')
  }
  return context
}