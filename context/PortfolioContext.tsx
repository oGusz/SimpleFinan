'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useAppMode, type AppMode } from '@/context/AppModeContext'
import { normalizeCategory } from '@/lib/asset-classification'
import { resolveAvgPrice, weightedAvgPrice } from '@/lib/portfolio-metrics'
import { safeGet, safeRemove, safeSet } from '@/lib/safe-storage'
import { isExchangeTicker, isManualValueTicker } from '@/lib/tickers'

export interface Asset {
  ticker: string
  name: string
  quantity: number
  /** Cotação ou valor atual. O custo fica em avgPrice. */
  price: number
  /** Preço médio pago. null significa desconhecido, nunca o preço atual. */
  avgPrice: number | null
  category?: string
  /** Soma de 12 meses sobre a cotação. undefined quando não há dado, nunca 0. */
  dividendYield?: number
  /** Média mensal por cota (soma de 12 meses / 12). undefined quando não há dado, nunca 0. */
  lastDividend?: number
  dividendStatus?: 'ok' | 'none' | 'unavailable'
  dividendHistoryMonths?: number
  /** A última consulta não trouxe cotação deste ativo: o preço pode estar velho. */
  quoteStale?: boolean
  quoteMissing?: boolean
  targetPercent: number | null
  updatedAt?: string
}

export type WriteResult = { ok: boolean; error?: string }

interface PortfolioContextType {
  assets: Asset[]
  isLoaded: boolean
  /** true só depois da resposta do banco: antes disso, lista vazia não significa carteira vazia. */
  isSynced: boolean
  /** A última leitura falhou: a lista em tela é a do cache deste aparelho. */
  loadError: boolean
  quotesAsOf: string | null
  quotesFailed: boolean
  goalAmount: number | null
  reloadAssets: () => void
  updateQuantity: (ticker: string, quantity: number) => Promise<WriteResult>
  addAsset: (newAsset: Asset) => Promise<WriteResult>
  removeAsset: (ticker: string | string[]) => Promise<WriteResult>
  restoreAssets: (assets: Asset[]) => Promise<WriteResult>
  updateAvgPrice: (ticker: string, value: number | null) => Promise<WriteResult>
  updateManualValue: (ticker: string, value: number) => Promise<WriteResult>
  updateTargetPercent: (ticker: string, value: number | null) => Promise<WriteResult>
  updateGoal: (value: number | null) => Promise<WriteResult>
}

interface QuoteCache {
  asOf: string | null
  prices: Record<string, number>
}

interface DividendItem {
  ticker: string
  status: 'ok' | 'none' | 'unavailable'
  total12m: number | null
  monthlyAverage: number | null
  historyMonths?: number
}

interface DividendCache {
  tickers: string
  fetchedAt: number
  items: DividendItem[]
}

type PersistOutcome =
  | { ok: true; apply?: (list: Asset[]) => Asset[] }
  | { ok: false; error: string; resync?: boolean }

// Cada modo tem o próprio cache: senão, ativos do banco acabariam misturados aos manuais.
const assetsCacheKey = (mode: AppMode) =>
  mode === 'open_finance' ? '@portfolio:assets:open_finance' : '@portfolio:assets'

// Identifica a quem pertence o cache local, para que uma conta nunca herde os dados de outra.
const LOCAL_OWNER_KEY = '@portfolio:owner'
const QUOTES_KEY = '@portfolio:quotes'
const DIVIDENDS_KEY = '@portfolio:dividends'
const LEGACY_GOAL_KEY = '@portfolio:goal'
// Era a meta padrão, que ninguém escolheu: não pode virar meta do usuário na migração.
const LEGACY_DEFAULT_GOAL = 10000

const DAY_MS = 24 * 60 * 60 * 1000
const FOCUS_RELOAD_AFTER_MS = 60 * 1000
const UNKNOWN_CATEGORY = 'Não classificado'
const EMPTY_QUOTES: QuoteCache = { asOf: null, prices: {} }

const SIGN_IN_ERROR = 'Entre na sua conta para salvar'
const SAVE_ERROR = 'Não foi possível salvar. Verifique sua conexão e tente de novo.'
const LOADING_ERROR = 'Sua carteira ainda está carregando. Tente de novo em instantes.'
const CHANGED_ERROR = 'Este ativo mudou em outro aparelho. Confira os dados e tente de novo.'
const QUANTITY_ERROR = 'A quantidade deve ser maior que zero.'
const VALUE_ERROR = 'Informe um valor maior que zero.'
export const UNAVAILABLE_ERROR = 'Este recurso ainda não está disponível. Tente de novo mais tarde.'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  // Sem isto, um 401, 429 ou 502 chegaria ao SWR como resposta válida e a falha passaria batida.
  if (!res.ok) throw new Error(`Falha ao consultar ${url}: ${res.status}`)
  return res.json()
}

// O mesmo teto de /api/quotes e /api/dividends: sem lotes, o excedente ficaria sem dado para sempre.
const MARKET_BATCH_SIZE = 50

function tickerBatches(tickersKey: string) {
  const tickers = tickersKey.split(',')
  const batches: string[][] = []
  for (let start = 0; start < tickers.length; start += MARKET_BATCH_SIZE) {
    batches.push(tickers.slice(start, start + MARKET_BATCH_SIZE))
  }
  return batches
}

/** Pede cada lote em separado. Um lote que falha só vira falha daqueles ativos; se todos falharem, é erro. */
async function fetchMarketBatches<T>(
  path: string,
  tickersKey: string,
  merge: (results: { tickers: string[]; body: any | null }[]) => T,
): Promise<T> {
  const batches = tickerBatches(tickersKey)
  const settled = await Promise.allSettled(
    batches.map((tickers) => fetcher(`${path}?tickers=${tickers.join(',')}`)),
  )
  const firstFailure = settled.find((result) => result.status === 'rejected')
  if (firstFailure && settled.every((result) => result.status === 'rejected')) {
    throw (firstFailure as PromiseRejectedResult).reason
  }
  return merge(
    settled.map((result, index) => ({
      tickers: batches[index],
      body: result.status === 'fulfilled' ? result.value : null,
    })),
  )
}

const fetchQuotes = ([, tickersKey]: [string, string]) =>
  fetchMarketBatches('/api/quotes', tickersKey, (results) => ({
    quotes: results.flatMap(({ body }) => (Array.isArray(body?.quotes) ? body.quotes : [])),
    failed: results.flatMap(({ tickers, body }) => (body ? (Array.isArray(body.failed) ? body.failed : []) : tickers)),
    asOf: results.map(({ body }) => body?.asOf).find(Boolean) ?? null,
  }))

const fetchDividends = ([, tickersKey]: [string, string]) =>
  fetchMarketBatches('/api/dividends', tickersKey, (results) => ({
    // Lote que falhou fica 'unavailable', para valer nova tentativa antes de 24 h.
    items: results.flatMap(({ tickers, body }) =>
      body
        ? Array.isArray(body.items)
          ? body.items
          : []
        : tickers.map((ticker) => ({ ticker, status: 'unavailable' })),
    ),
  }))

const cleanTicker = (ticker: string) => ticker.trim().toUpperCase()
const isPositive = (value: number) => Number.isFinite(value) && value > 0
const hasQuote = (ticker: string) => isExchangeTicker(ticker) && !isManualValueTicker(ticker)

const isMissingColumn = (error: { code?: string } | null | undefined) =>
  error?.code === 'PGRST204' || error?.code === '42703'

function toTargetPercent(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function toGoal(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  return isPositive(value) ? value : null
}

// dividend_yield do banco é ignorado de propósito: um padrão antigo de 10% pode estar gravado.
function mapRow(row: any, source: AppMode): Asset {
  const ticker = cleanTicker(String(row.ticker || row.code || 'ATIVO'))
  return {
    ticker,
    name: row.name || ticker,
    quantity: Number(row.quantity) || 0,
    price: Number(row.price) || 0,
    avgPrice: resolveAvgPrice(row.avg_price, row.price, source),
    category: normalizeCategory(row.category, ticker),
    targetPercent: toTargetPercent(row.target_percent),
    updatedAt: row.updated_at ?? undefined,
  }
}

function readJson(key: string): any {
  const raw = safeGet(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// O cache pode vir de versões antigas, com DY zerado, categoria 'Tijolo' e sem preço médio.
function readCachedAssets(mode: AppMode): Asset[] {
  const parsed = readJson(assetsCacheKey(mode))
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((item) => item && typeof item.ticker === 'string')
    .map((item) => {
      const ticker = cleanTicker(item.ticker)
      const avgPrice = Number(item.avgPrice)
      return {
        ticker,
        name: item.name || ticker,
        quantity: Number(item.quantity) || 0,
        price: Number(item.price) || 0,
        avgPrice: isPositive(avgPrice) ? avgPrice : null,
        category: normalizeCategory(item.category, ticker),
        targetPercent: toTargetPercent(item.targetPercent),
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
      }
    })
}

function readCachedQuotes(): QuoteCache {
  const parsed = readJson(QUOTES_KEY)
  if (!parsed || typeof parsed.prices !== 'object' || parsed.prices === null) return EMPTY_QUOTES
  return { asOf: typeof parsed.asOf === 'string' ? parsed.asOf : null, prices: parsed.prices }
}

function readCachedDividends(): DividendCache | null {
  const parsed = readJson(DIVIDENDS_KEY)
  if (!parsed || typeof parsed.tickers !== 'string' || !Array.isArray(parsed.items)) return null
  return { tickers: parsed.tickers, fetchedAt: Number(parsed.fetchedAt) || 0, items: parsed.items }
}

function clearLocalData() {
  safeRemove(assetsCacheKey('manual'))
  safeRemove(assetsCacheKey('open_finance'))
  safeRemove(LEGACY_GOAL_KEY)
  safeRemove(QUOTES_KEY)
  safeRemove(DIVIDENDS_KEY)
}

function patchAsset(list: Asset[], ticker: string, patch: Partial<Asset>): Asset[] {
  return list.map((item) => (item.ticker === ticker ? { ...item, ...patch } : item))
}

// Volta só os ativos da operação que falhou, sem desfazer o que outra gravação já concluiu.
function revertTickers(list: Asset[], tickers: Set<string>, snapshot: Asset[]): Asset[] {
  const previous = new Map(snapshot.map((item) => [item.ticker, item]))
  const reverted = list.flatMap((item) => {
    if (!tickers.has(item.ticker)) return [item]
    const old = previous.get(item.ticker)
    previous.delete(item.ticker)
    return old ? [old] : []
  })
  return [...reverted, ...previous.values()]
}

function toDbRow(asset: Asset, userId: string, source: AppMode) {
  return {
    user_id: userId,
    ticker: asset.ticker,
    ticker_name: asset.ticker,
    name: asset.name,
    quantity: asset.quantity,
    price: asset.price,
    avg_price: asset.avgPrice ?? null,
    target_percent: asset.targetPercent ?? null,
    category: asset.category || UNKNOWN_CATEGORY,
    source,
    updated_at: new Date().toISOString(),
  }
}

function withoutOptionalColumns<T extends object>(row: T) {
  const { avg_price: _avg, target_percent: _target, ...rest } = row as T & {
    avg_price?: unknown
    target_percent?: unknown
  }
  return rest
}

function dividendFields(item: DividendItem | undefined, price: number) {
  const total = Number(item?.total12m)
  const monthly = Number(item?.monthlyAverage)
  const months = Number(item?.historyMonths)
  return {
    dividendStatus: item?.status,
    dividendHistoryMonths: Number.isFinite(months) && item?.historyMonths != null ? months : undefined,
    lastDividend: isPositive(monthly) ? monthly : undefined,
    dividendYield: isPositive(total) && isPositive(price) ? (total / price) * 100 : undefined,
  }
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined)

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  // Os ativos como vieram do banco. Cotações e proventos entram só na lista exposta às telas.
  const [baseAssets, setBaseAssets] = useState<Asset[]>([])
  const [quotes, setQuotes] = useState<QuoteCache>(EMPTY_QUOTES)
  const [dividends, setDividends] = useState<DividendCache | null>(null)
  const [goalAmount, setGoalAmount] = useState<number | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isSynced, setIsSynced] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [reloadCount, setReloadCount] = useState(0)

  const supabase = useMemo(() => createClient(), [])
  const { mode, loading: modeLoading } = useAppMode()
  const reloadAssets = useCallback(() => setReloadCount((count) => count + 1), [])

  const baseAssetsRef = useRef<Asset[]>([])
  const userIdRef = useRef<string | null>(null)
  // A quem e a qual modo pertencem os dados em memória: nunca podem ir para o cache de outro.
  const dataOwner = useRef<string | null>(null)
  const assetsMode = useRef<AppMode | null>(null)
  const modeRef = useRef<AppMode>(mode)
  const modeLoadingRef = useRef(modeLoading)
  const goalRef = useRef<number | null>(null)
  const goalWrites = useRef(0)

  // Contador de execução: uma resposta antiga não pode sobrescrever a de uma leitura mais nova.
  const syncRun = useRef(0)
  const lastReadAt = useRef(0)

  // Gravações em fila: a próxima parte do que a anterior deixou no banco.
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve())
  const pendingWrites = useRef(0)
  const writeEpoch = useRef(0)
  const needsResync = useRef(false)

  useEffect(() => {
    modeRef.current = mode
    modeLoadingRef.current = modeLoading
  }, [mode, modeLoading])

  const commitAssets = useCallback((next: Asset[]) => {
    baseAssetsRef.current = next
    setBaseAssets(next)
  }, [])

  const commitGoal = useCallback((next: number | null) => {
    goalRef.current = next
    setGoalAmount(next)
  }, [])

  const loadGoal = useCallback(
    (user: User, cacheBelongsToUser: boolean) => {
      // Uma gravação em andamento é mais nova do que a sessão lida agora.
      if (goalWrites.current > 0) return

      const metadata = user.user_metadata ?? {}
      if ('portfolio_goal' in metadata) {
        commitGoal(toGoal(metadata.portfolio_goal))
        safeRemove(LEGACY_GOAL_KEY)
        return
      }

      commitGoal(null)
      if (!cacheBelongsToUser) return

      const legacy = safeGet(LEGACY_GOAL_KEY)
      if (!legacy) return
      const value = toGoal(legacy)
      if (value === null || value === LEGACY_DEFAULT_GOAL) {
        safeRemove(LEGACY_GOAL_KEY)
        return
      }

      // Migração única da meta local: a chave só sai depois que o servidor confirmar.
      commitGoal(value)
      supabase.auth
        .updateUser({ data: { portfolio_goal: value } })
        .then(({ error }) => {
          if (!error) safeRemove(LEGACY_GOAL_KEY)
        })
        .catch((err) => console.warn('Não foi possível migrar a meta local:', err))
    },
    [supabase, commitGoal]
  )

  // Só lê do banco e do cache. Em nenhum caminho a leitura escreve: o banco é a única fonte.
  useEffect(() => {
    const run = ++syncRun.current

    if (modeLoading) {
      setIsSynced(false)
      return
    }

    const hydrateFromCache = (ownerId: string, accountChanged: boolean) => {
      dataOwner.current = ownerId
      assetsMode.current = mode
      commitAssets(readCachedAssets(mode))
      if (accountChanged) {
        setQuotes(readCachedQuotes())
        setDividends(readCachedDividends())
      }
    }

    async function syncWithSupabase() {
      const startedEpoch = writeEpoch.current

      let user: User | null = null
      let sessionFailed = false
      try {
        const { data, error } = await supabase.auth.getSession()
        user = data.session?.user ?? null
        sessionFailed = Boolean(error)
      } catch {
        sessionFailed = true
      }
      if (run !== syncRun.current) return

      if (!user) {
        if (sessionFailed) {
          // Sessão guardada que não pôde ser renovada: é o dono do cache, provavelmente sem rede.
          const owner = safeGet(LOCAL_OWNER_KEY)
          if (owner && (dataOwner.current !== owner || assetsMode.current !== mode)) {
            hydrateFromCache(owner, dataOwner.current !== owner)
          }
          setLoadError(true)
        } else {
          dataOwner.current = null
          assetsMode.current = mode
          userIdRef.current = null
          setUserId(null)
          commitAssets([])
          commitGoal(null)
          setQuotes(EMPTY_QUOTES)
          setDividends(null)
          setLoadError(false)
          setIsSynced(true)
        }
        setIsLoaded(true)
        return
      }

      const cacheBelongsToUser = safeGet(LOCAL_OWNER_KEY) === user.id
      if (!cacheBelongsToUser) clearLocalData()
      safeSet(LOCAL_OWNER_KEY, user.id)

      const accountChanged = dataOwner.current !== user.id
      if (accountChanged || assetsMode.current !== mode) {
        setIsSynced(false)
        hydrateFromCache(user.id, accountChanged)
      }
      userIdRef.current = user.id
      setUserId(user.id)
      setIsLoaded(true)
      loadGoal(user, cacheBelongsToUser)

      try {
        const { data, error } = await supabase
          .from('investments')
          .select('*')
          .eq('user_id', user.id)
          .eq('source', mode)
        if (run !== syncRun.current) return
        if (error) throw error

        // Esta leitura pode ser anterior a uma gravação: lê de novo em vez de desfazer a tela.
        if (writeEpoch.current !== startedEpoch || pendingWrites.current > 0) {
          if (pendingWrites.current > 0) {
            needsResync.current = true
          } else {
            reloadAssets()
          }
          return
        }

        commitAssets((data ?? []).map((row: any) => mapRow(row, mode)))
        lastReadAt.current = Date.now()
        setLoadError(false)
        setIsSynced(true)
      } catch (err) {
        console.warn('Não foi possível ler a carteira:', err)
        if (run === syncRun.current) setLoadError(true)
      }
    }

    syncWithSupabase()
  }, [mode, modeLoading, reloadCount, supabase, commitAssets, commitGoal, loadGoal, reloadAssets])

  // O app fica aberto em segundo plano: ao voltar, a posição pode ter mudado em outro aparelho.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      if (!userIdRef.current || modeLoadingRef.current) return
      if (Date.now() - lastReadAt.current >= FOCUS_RELOAD_AFTER_MS) reloadAssets()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [reloadAssets])

  // Renda fixa e valor informado à mão não têm cotação e não podem contaminar o lote.
  const tickersKey = useMemo(
    () => Array.from(new Set(baseAssets.map((a) => a.ticker).filter(hasQuote))).sort().join(','),
    [baseAssets]
  )
  const marketReady = isLoaded && Boolean(userId) && tickersKey !== ''

  const { data: quotesData, error: quotesError } = useSWR(
    marketReady ? ['market-quotes', tickersKey] : null,
    fetchQuotes,
    {
      refreshInterval: 60000,
      revalidateOnFocus: true,
    }
  )

  useEffect(() => {
    const list = quotesData?.quotes
    if (!Array.isArray(list) || list.length === 0) return

    setQuotes((prev) => {
      const prices = { ...prev.prices }
      for (const quote of list) {
        const ticker = cleanTicker(String(quote?.ticker ?? ''))
        const price = Number(quote?.price)
        if (hasQuote(ticker) && isPositive(price)) prices[ticker] = price
      }
      return { asOf: quotesData?.asOf ?? prev.asOf, prices }
    })
  }, [quotesData])

  // Falha parcial não é falha geral: o ativo sem cotação já avisa na própria linha.
  const quotesFailed = marketReady && Boolean(quotesError)

  // Um provento 'unavailable' foi falha da fonte, e não ausência: vale tentar antes de 24 h.
  const dividendsFresh =
    dividends?.tickers === tickersKey &&
    Date.now() - dividends.fetchedAt < DAY_MS &&
    !dividends.items.some((item) => item.status === 'unavailable')

  const { data: dividendsData } = useSWR(
    marketReady && !dividendsFresh ? ['market-dividends', tickersKey] : null,
    fetchDividends,
    {
      dedupingInterval: DAY_MS,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    }
  )

  useEffect(() => {
    if (!Array.isArray(dividendsData?.items)) return
    const next: DividendCache = { tickers: tickersKey, fetchedAt: Date.now(), items: dividendsData.items }
    setDividends(next)
    safeSet(DIVIDENDS_KEY, JSON.stringify(next))
    // tickersKey de propósito fora: só uma resposta nova atualiza o cache.
  }, [dividendsData])

  const assets = useMemo(() => {
    const dividendsByTicker = new Map((dividends?.items ?? []).map((item) => [item.ticker, item]))
    const failedQuotes = new Set<unknown>(Array.isArray(quotesData?.failed) ? quotesData.failed : [])
    return baseAssets.map((asset) => {
      const quotable = hasQuote(asset.ticker)
      const quoted = quotable ? Number(quotes.prices[asset.ticker]) : NaN
      const price = isPositive(quoted) ? quoted : asset.price
      const quoteStale = quotable && (Boolean(quotesError) || failedQuotes.has(asset.ticker))
      return {
        ...asset,
        price,
        quoteStale,
        // O preço guardado pode ser só o preço médio: exibi-lo como cotação daria um ganho falso de 0%.
        quoteMissing: quoteStale && !isPositive(quoted),
        ...dividendFields(dividendsByTicker.get(asset.ticker), price),
      }
    })
  }, [baseAssets, quotes, dividends, quotesData, quotesError])

  // Persistência local, só depois de saber de quem são os dados.
  useEffect(() => {
    if (!isLoaded || !dataOwner.current || !assetsMode.current) return
    safeSet(assetsCacheKey(assetsMode.current), JSON.stringify(baseAssets))
  }, [baseAssets, isLoaded])

  useEffect(() => {
    if (!isLoaded || !dataOwner.current) return
    safeSet(QUOTES_KEY, JSON.stringify(quotes))
  }, [quotes, isLoaded])

  const resolveUserId = useCallback(async () => {
    if (userIdRef.current) return userIdRef.current
    const { data } = await supabase.auth.getSession()
    return data.session?.user?.id ?? null
  }, [supabase])

  const finishWrite = useCallback(
    (failed: boolean) => {
      pendingWrites.current -= 1
      writeEpoch.current += 1
      // Outra gravação partiu do estado que acabou de ser revertido: só o banco resolve.
      if (failed && pendingWrites.current > 0) needsResync.current = true
      if (pendingWrites.current === 0 && needsResync.current) {
        needsResync.current = false
        reloadAssets()
      }
    },
    [reloadAssets]
  )

  /**
   * Muda a tela na hora e grava em fila. Em falha, volta os ativos da operação ao estado anterior,
   * e o chamador só fecha o modal ou confirma quando recebe ok.
   */
  const write = useCallback(
    (
      tickers: string[],
      optimistic: (list: Asset[]) => Asset[],
      persist: (uid: string, source: AppMode) => Promise<PersistOutcome>
    ): Promise<WriteResult> => {
      if (modeLoadingRef.current) return Promise.resolve({ ok: false, error: LOADING_ERROR })

      const source = modeRef.current
      const affected = new Set(tickers)
      const snapshot = baseAssetsRef.current.filter((item) => affected.has(item.ticker))
      const sameMode = () => assetsMode.current === source

      commitAssets(optimistic(baseAssetsRef.current))
      pendingWrites.current += 1
      writeEpoch.current += 1

      const task = writeQueue.current.then(async (): Promise<WriteResult> => {
        let outcome: PersistOutcome
        try {
          const uid = await resolveUserId()
          outcome = uid ? await persist(uid, source) : { ok: false, error: SIGN_IN_ERROR }
        } catch (err) {
          console.error('Erro ao gravar a carteira:', err)
          outcome = { ok: false, error: SAVE_ERROR }
        }

        if (outcome.ok) {
          if (outcome.apply && sameMode()) commitAssets(outcome.apply(baseAssetsRef.current))
          finishWrite(false)
          return { ok: true }
        }

        if (sameMode()) commitAssets(revertTickers(baseAssetsRef.current, affected, snapshot))
        if (outcome.resync) needsResync.current = true
        finishWrite(true)
        return { ok: false, error: outcome.error }
      })

      writeQueue.current = task
      return task
    },
    [commitAssets, finishWrite, resolveUserId]
  )

  const updateRow = useCallback(
    async (
      uid: string,
      source: AppMode,
      ticker: string,
      fields: Record<string, unknown>,
      options: { checkVersion?: boolean; optionalColumn?: boolean } = {}
    ): Promise<PersistOutcome> => {
      let query = supabase
        .from('investments')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('user_id', uid)
        .eq('source', source)
        .eq('ticker', ticker)

      // Grava valor absoluto: confere a versão lida para não apagar o que outro aparelho salvou.
      const version = options.checkVersion
        ? baseAssetsRef.current.find((item) => item.ticker === ticker)?.updatedAt
        : undefined
      if (version) query = query.eq('updated_at', version)

      const { data, error } = await query.select('updated_at')
      if (error) {
        console.error('Erro ao atualizar ativo:', error)
        return { ok: false, error: options.optionalColumn && isMissingColumn(error) ? UNAVAILABLE_ERROR : SAVE_ERROR }
      }
      // Sem linha afetada não há erro no retorno: o ativo mudou ou saiu em outro aparelho.
      if (!data || data.length === 0) return { ok: false, error: CHANGED_ERROR, resync: true }

      const updatedAt = data[0].updated_at as string
      return { ok: true, apply: (list) => patchAsset(list, ticker, { updatedAt }) }
    },
    [supabase]
  )

  const upsertRows = useCallback(
    async (rows: object[]) => {
      const send = (payload: object[]) =>
        supabase
          .from('investments')
          .upsert(payload, { onConflict: 'user_id,source,ticker' })
          .select('ticker, updated_at')

      const first = await send(rows)
      // Banco sem a migração: o ativo é salvo mesmo assim, sem os campos que ainda não existem.
      if (!isMissingColumn(first.error)) return { ...first, stripped: false }
      return { ...(await send(rows.map(withoutOptionalColumns))), stripped: true }
    },
    [supabase]
  )

  const updateQuantity = useCallback(
    async (ticker: string, quantity: number): Promise<WriteResult> => {
      if (!isPositive(quantity)) return { ok: false, error: QUANTITY_ERROR }
      const clean = cleanTicker(ticker)
      return write(
        [clean],
        (list) => patchAsset(list, clean, { quantity }),
        (uid, source) => updateRow(uid, source, clean, { quantity }, { checkVersion: true })
      )
    },
    [write, updateRow]
  )

  const addAsset = useCallback(
    async (newAsset: Asset): Promise<WriteResult> => {
      const ticker = cleanTicker(newAsset.ticker)
      if (!ticker) return { ok: false, error: 'Informe o ativo.' }
      if (!isPositive(newAsset.quantity)) return { ok: false, error: QUANTITY_ERROR }

      const addAvg = newAsset.avgPrice !== null && isPositive(Number(newAsset.avgPrice)) ? Number(newAsset.avgPrice) : null
      const addPrice = isPositive(newAsset.price) ? newAsset.price : 0
      const addTarget = toTargetPercent(newAsset.targetPercent)
      // Valor informado à mão é uma posição única: somar cotas multiplicaria o saldo.
      const isManualValue = isManualValueTicker(ticker)

      const merge = (oldQty: number, oldAvg: number | null) => ({
        quantity: isManualValue ? 1 : oldQty + newAsset.quantity,
        avgPrice: isManualValue ? addAvg ?? oldAvg : weightedAvgPrice(oldQty, oldAvg, newAsset.quantity, addAvg),
      })

      return write(
        [ticker],
        (list) => {
          const existing = list.find((item) => item.ticker === ticker)
          const category = newAsset.category || existing?.category || UNKNOWN_CATEGORY
          if (existing) {
            return patchAsset(list, ticker, {
              ...merge(existing.quantity, existing.avgPrice),
              price: addPrice || existing.price,
              category: normalizeCategory(category, ticker),
            })
          }
          return [
            ...list,
            {
              ticker,
              name: newAsset.name || ticker,
              price: addPrice,
              ...merge(0, null),
              category: normalizeCategory(category, ticker),
              targetPercent: addTarget,
            },
          ]
        },
        async (uid, source) => {
          // A memória pode estar velha: a soma e a média partem do que o banco tem agora.
          const { data: existing, error: readError } = await supabase
            .from('investments')
            .select('*')
            .eq('user_id', uid)
            .eq('source', source)
            .eq('ticker', ticker)
            .maybeSingle()
          if (readError) {
            console.error('Erro ao ler ativo antes de salvar:', readError)
            return { ok: false, error: SAVE_ERROR }
          }

          const merged = merge(
            existing ? Number(existing.quantity) || 0 : 0,
            existing ? resolveAvgPrice(existing.avg_price, existing.price, source) : null
          )
          const category = normalizeCategory(newAsset.category || existing?.category || UNKNOWN_CATEGORY, ticker)
          const price = addPrice || Number(existing?.price) || 0
          const name = newAsset.name || existing?.name || ticker

          // target_percent só entra se informado: um upsert sem a coluna preserva o valor salvo.
          const { target_percent: _ignored, ...row } = toDbRow(
            { ticker, name, price, category, targetPercent: addTarget, ...merged },
            uid,
            source
          )
          const { data, error, stripped } = await upsertRows([
            addTarget === null ? row : { ...row, target_percent: addTarget },
          ])
          if (error) {
            console.error('Erro ao salvar ativo:', error)
            return { ok: false, error: SAVE_ERROR }
          }

          return {
            ok: true,
            apply: (list) =>
              patchAsset(list, ticker, {
                name,
                price,
                category,
                quantity: merged.quantity,
                avgPrice: stripped ? null : merged.avgPrice,
                targetPercent: stripped ? null : addTarget ?? toTargetPercent(existing?.target_percent),
                updatedAt: data?.[0]?.updated_at as string | undefined,
              }),
          }
        }
      )
    },
    [supabase, write, upsertRows]
  )

  const removeAsset = useCallback(
    async (ticker: string | string[]): Promise<WriteResult> => {
      const tickers = (Array.isArray(ticker) ? ticker : [ticker]).map(cleanTicker)
      if (tickers.length === 0) return { ok: true }
      const affected = new Set(tickers)

      return write(
        tickers,
        (list) => list.filter((item) => !affected.has(item.ticker)),
        async (uid, source) => {
          const { error } = await supabase
            .from('investments')
            .delete()
            .eq('user_id', uid)
            .eq('source', source)
            .in('ticker', tickers)
          if (error) {
            console.error('Erro ao remover ativo:', error)
            return { ok: false, error: 'Não foi possível remover. Verifique sua conexão e tente de novo.' }
          }
          return { ok: true }
        }
      )
    },
    [supabase, write]
  )

  // Desfazer regrava a linha inteira, com nome, cotação, categoria, custo e alvo.
  const restoreAssets = useCallback(
    async (toRestore: Asset[]): Promise<WriteResult> => {
      if (toRestore.length === 0) return { ok: true }

      const clean: Asset[] = toRestore.map((asset) => {
        const ticker = cleanTicker(asset.ticker)
        return {
          ticker,
          name: asset.name || ticker,
          quantity: asset.quantity,
          price: asset.price,
          avgPrice: asset.avgPrice ?? null,
          category: normalizeCategory(asset.category || UNKNOWN_CATEGORY, ticker),
          targetPercent: asset.targetPercent ?? null,
        }
      })
      const tickers = clean.map((asset) => asset.ticker)
      const affected = new Set(tickers)

      return write(
        tickers,
        (list) => [...list.filter((item) => !affected.has(item.ticker)), ...clean],
        async (uid, source) => {
          const { data, error, stripped } = await upsertRows(clean.map((asset) => toDbRow(asset, uid, source)))
          if (error) {
            console.error('Erro ao restaurar ativos:', error)
            return { ok: false, error: SAVE_ERROR }
          }
          const versions = new Map<string, string>((data ?? []).map((row: any) => [row.ticker, row.updated_at]))
          return {
            ok: true,
            apply: (list) =>
              list.map((item) =>
                affected.has(item.ticker)
                  ? {
                      ...item,
                      updatedAt: versions.get(item.ticker),
                      ...(stripped ? { avgPrice: null, targetPercent: null } : {}),
                    }
                  : item
              ),
          }
        }
      )
    },
    [write, upsertRows]
  )

  const updateAvgPrice = useCallback(
    async (ticker: string, value: number | null): Promise<WriteResult> => {
      if (value !== null && !isPositive(value)) return { ok: false, error: VALUE_ERROR }
      const clean = cleanTicker(ticker)
      return write(
        [clean],
        (list) => patchAsset(list, clean, { avgPrice: value }),
        (uid, source) => updateRow(uid, source, clean, { avg_price: value }, { optionalColumn: true })
      )
    },
    [write, updateRow]
  )

  const updateManualValue = useCallback(
    async (ticker: string, value: number): Promise<WriteResult> => {
      if (!isPositive(value)) return { ok: false, error: VALUE_ERROR }
      const clean = cleanTicker(ticker)
      // Em ativo de bolsa isto trocaria as cotas por 1 e apagaria a posição real.
      if (isExchangeTicker(clean)) return { ok: false, error: 'Ativos de bolsa são atualizados pela cotação.' }
      return write(
        [clean],
        (list) => patchAsset(list, clean, { quantity: 1, price: value }),
        (uid, source) => updateRow(uid, source, clean, { quantity: 1, price: value }, { checkVersion: true })
      )
    },
    [write, updateRow]
  )

  const updateTargetPercent = useCallback(
    async (ticker: string, value: number | null): Promise<WriteResult> => {
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) {
        return { ok: false, error: 'Informe um percentual entre 0 e 100.' }
      }
      const clean = cleanTicker(ticker)
      return write(
        [clean],
        (list) => patchAsset(list, clean, { targetPercent: value }),
        (uid, source) => updateRow(uid, source, clean, { target_percent: value }, { optionalColumn: true })
      )
    },
    [write, updateRow]
  )

  const updateGoal = useCallback(
    async (value: number | null): Promise<WriteResult> => {
      if (value !== null && !isPositive(value)) return { ok: false, error: VALUE_ERROR }

      const previous = goalRef.current
      if (previous === value) return { ok: true }

      commitGoal(value)
      goalWrites.current += 1

      let result: WriteResult = { ok: true }
      try {
        const uid = await resolveUserId()
        if (!uid) {
          result = { ok: false, error: SIGN_IN_ERROR }
        } else {
          const { error } = await supabase.auth.updateUser({ data: { portfolio_goal: value } })
          if (error) {
            console.error('Erro ao salvar a meta:', error)
            result = { ok: false, error: SAVE_ERROR }
          }
        }
      } catch (err) {
        console.error('Erro ao salvar a meta:', err)
        result = { ok: false, error: SAVE_ERROR }
      } finally {
        goalWrites.current -= 1
      }

      // Só reverte se nada mais novo já tiver ocupado o lugar deste valor.
      if (!result.ok && goalRef.current === value) commitGoal(previous)
      return result
    },
    [supabase, commitGoal, resolveUserId]
  )

  return (
    <PortfolioContext.Provider
      value={{
        assets,
        isLoaded,
        isSynced,
        loadError,
        quotesAsOf: quotes.asOf,
        quotesFailed,
        goalAmount,
        reloadAssets,
        updateQuantity,
        addAsset,
        removeAsset,
        restoreAssets,
        updateAvgPrice,
        updateManualValue,
        updateTargetPercent,
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
