'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useAppMode } from '@/context/AppModeContext'

export interface Asset {
  ticker: string
  name: string
  quantity: number
  price: number
  dividendYield?: number
  category?: string
  lastDividend?: number
}

interface PortfolioContextType {
  assets: Asset[]
  goalAmount: number
  isLoaded: boolean
  updateQuantity: (ticker: string, quantity: number) => void
  addAsset: (newAsset: Asset) => void
  removeAsset: (ticker: string | string[]) => void
  updateGoal: (newGoal: number) => void
  reloadAssets: () => void
}

type AppMode = 'manual' | 'open_finance'

// Cada modo tem o próprio cache: senão, ativos do banco acabariam enviados como manuais.
const assetsCacheKey = (mode: AppMode) =>
  mode === 'open_finance' ? '@portfolio:assets:open_finance' : '@portfolio:assets'

const DEFAULT_ASSETS: Asset[] = []

// Identifica a quem pertence o cache local, para que uma conta nunca herde os dados de outra.
const LOCAL_OWNER_KEY = '@portfolio:owner'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined)

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [goalAmount, setGoalAmount] = useState<number>(10000)
  const [isLoaded, setIsLoaded] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const [reloadCount, setReloadCount] = useState(0)
  // A quem pertencem os ativos em memória: ao trocar de modo, eles não podem ir para o cache do outro.
  const assetsMode = useRef<AppMode>('manual')

  const supabase = createClient()
  const { mode, loading: modeLoading } = useAppMode()
  const reloadAssets = useCallback(() => setReloadCount((count) => count + 1), [])

  // 1. Inicializa com LocalStorage primeiro (instantâneo) e sincroniza com Supabase
  useEffect(() => {
    let localAssets: Asset[] = []
    assetsMode.current = mode
    try {
      const savedAssets = localStorage.getItem(assetsCacheKey(mode))
      const savedGoal = localStorage.getItem('@portfolio:goal')

      if (savedAssets) {
        localAssets = JSON.parse(savedAssets)
        setAssets(localAssets)
      } else {
        localAssets = DEFAULT_ASSETS
        setAssets(DEFAULT_ASSETS)
      }

      if (savedGoal) {
        setGoalAmount(Number(savedGoal))
      }
    } catch {
      localAssets = DEFAULT_ASSETS
      setAssets(DEFAULT_ASSETS)
    } finally {
      setIsLoaded(true)
    }

    // Tenta carregar do Supabase se o usuário estiver autenticado
    async function syncWithSupabase() {
      if (modeLoading) return

      try {
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user
        if (!user) return

        setUserId(user.id)

        // Só envia o cache ao banco se ele for comprovadamente desta conta.
        const localOwner = localStorage.getItem(LOCAL_OWNER_KEY)
        const cacheBelongsToUser = localOwner === user.id
        if (!cacheBelongsToUser) {
          localStorage.removeItem(assetsCacheKey('manual'))
          localStorage.removeItem(assetsCacheKey('open_finance'))
          localStorage.removeItem('@portfolio:goal')
          localAssets = []
          setAssets([])
        }
        localStorage.setItem(LOCAL_OWNER_KEY, user.id)

        const { data: dbInvestments, error } = await supabase
          .from('investments')
          .select('*')
          .eq('user_id', user.id)
          .eq('source', mode === 'open_finance' ? 'open_finance' : 'manual')

        if (!error && dbInvestments && dbInvestments.length > 0) {
          const mapped: Asset[] = dbInvestments.map((inv: any) => ({
            ticker: inv.ticker || inv.code || 'ATIVO',
            name: inv.name || inv.ticker,
            quantity: Number(inv.quantity) || 0,
            price: Number(inv.price) || 0,
            dividendYield: Number(inv.dividend_yield) || 0,
            category: inv.category || 'FII',
          }))
          setAssets(mapped)
        } else if (!error && mode === 'open_finance') {
          setAssets([])
        } else if (mode === 'manual' && cacheBelongsToUser && localAssets.length > 0) {
          // Se não há ativos no banco mas há localmente, faz o seed inicial no Supabase
          const toInsert = localAssets.map((a) => ({
            user_id: user.id,
            ticker: a.ticker,
            ticker_name: a.ticker,
            name: a.name,
            quantity: a.quantity,
            price: a.price,
            dividend_yield: a.dividendYield || 0,
            category: a.category || 'FII',
            source: 'manual',
            updated_at: new Date().toISOString(),
          }))
          const { error: seedError } = await supabase
            .from('investments')
            .upsert(toInsert, { onConflict: 'user_id,source,ticker' })
          if (seedError) console.error('Erro ao enviar a carteira local ao Supabase:', seedError)
        }
      } catch (err) {
        console.warn('Sincronização com Supabase em modo offline:', err)
      }
    }

    syncWithSupabase()
  }, [mode, modeLoading, reloadCount])

  const tickersKey = assets.map((a) => a.ticker.toUpperCase()).sort().join(',')

  // Cotações em tempo real via API
  const { data: quotesData } = useSWR(
    isLoaded && assets.length > 0 ? `/api/quotes?tickers=${tickersKey}` : null,
    fetcher,
    {
      refreshInterval: 60000,
      revalidateOnFocus: true,
    }
  )

  // Atualiza cotações assim que recebidas
  useEffect(() => {
    if (!quotesData) return

    const quotesList: any[] = Array.isArray(quotesData)
      ? quotesData
      : quotesData.quotes || quotesData.data || quotesData.results || []

    if (!Array.isArray(quotesList) || quotesList.length === 0) return

    setAssets((prev) =>
      prev.map((asset) => {
        const quote = quotesList.find((q: any) => {
          const rawTicker = (q.ticker || q.symbol || q.stock || '').toString().toUpperCase()
          const cleanTicker = rawTicker.replace('.SA', '')
          return cleanTicker === asset.ticker.toUpperCase()
        })

        if (!quote) return asset

        const rawPrice =
          quote.price ??
          quote.regularMarketPrice ??
          quote.close ??
          quote.regularMarketPreviousClose

        const parsedPrice = typeof rawPrice === 'string' ? parseFloat(rawPrice) : rawPrice

        return typeof parsedPrice === 'number' && !isNaN(parsedPrice) && parsedPrice > 0
          ? { ...asset, price: parsedPrice }
          : asset
      })
    )
  }, [quotesData])

  // Persistência local contínua
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(assetsCacheKey(assetsMode.current), JSON.stringify(assets))
      localStorage.setItem('@portfolio:goal', goalAmount.toString())
    }
  }, [assets, goalAmount, isLoaded])

  const updateQuantity = useCallback(async (ticker: string, quantity: number) => {
    const validQty = Math.max(0, quantity)
    setAssets((prev) =>
      prev
        .map((item) => {
          if (item.ticker.toUpperCase() === ticker.toUpperCase()) {
            return { ...item, quantity: validQty }
          }
          return item
        })
        .filter((item) => item.quantity > 0)
    )

    if (userId) {
      try {
        if (validQty === 0) {
          await supabase.from('investments').delete().eq('ticker', ticker.toUpperCase()).eq('user_id', userId).eq('source', mode === 'open_finance' ? 'open_finance' : 'manual')
        } else {
          await supabase.from('investments').update({ quantity: validQty, updated_at: new Date().toISOString() }).eq('ticker', ticker.toUpperCase()).eq('user_id', userId).eq('source', mode === 'open_finance' ? 'open_finance' : 'manual')
        }
      } catch (e) {
        console.error('Erro ao atualizar quantidade no Supabase:', e)
      }
    }
  }, [userId, mode])

  const addAsset = useCallback(async (newAsset: Asset) => {
    const cleanAsset = {
      ...newAsset,
      ticker: newAsset.ticker.toUpperCase().trim(),
    }

    setAssets((prev) => {
      const existing = prev.find(
        (item) => item.ticker.toUpperCase() === cleanAsset.ticker
      )
      if (existing) {
        return prev.map((item) =>
          item.ticker.toUpperCase() === cleanAsset.ticker
            ? { ...item, quantity: item.quantity + cleanAsset.quantity, price: cleanAsset.price || item.price, category: cleanAsset.category || item.category }
            : item
        )
      }
      return [...prev, cleanAsset]
    })

    if (userId) {
      try {
        // A tela soma ao ativo existente; o banco precisa guardar o mesmo total.
        const existing = assets.find((item) => item.ticker.toUpperCase() === cleanAsset.ticker)
        const { error } = await supabase.from('investments').upsert({
          user_id: userId,
          ticker: cleanAsset.ticker,
          ticker_name: cleanAsset.ticker,
          name: cleanAsset.name,
          quantity: (existing?.quantity ?? 0) + cleanAsset.quantity,
          price: cleanAsset.price,
          dividend_yield: cleanAsset.dividendYield || 0,
          category: cleanAsset.category || 'FII',
          source: mode === 'open_finance' ? 'open_finance' : 'manual',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,source,ticker' })
        // O cliente do Supabase devolve o erro em vez de lançar: sem esta linha, a falha some.
        if (error) console.error('Erro ao salvar ativo no Supabase:', error)
      } catch (e) {
        console.error('Erro ao salvar ativo no Supabase:', e)
      }
    }
  }, [userId, mode, assets])

  const removeAsset = useCallback(async (ticker: string | string[]) => {
    const tickersToRemove = (Array.isArray(ticker) ? ticker : [ticker]).map((t) =>
      t.toUpperCase().trim()
    )

    setAssets((prev) =>
      prev.filter((item) => !tickersToRemove.includes(item.ticker.toUpperCase()))
    )

    if (userId) {
      try {
        await supabase.from('investments').delete().in('ticker', tickersToRemove).eq('user_id', userId).eq('source', mode === 'open_finance' ? 'open_finance' : 'manual')
      } catch (e) {
        console.error('Erro ao remover ativo no Supabase:', e)
      }
    }
  }, [userId, mode])

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
        reloadAssets,
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
