'use client'

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { getAssetQuote } from '@/app/actions/quotes'
import { Button } from '@/components/ui/button'
import { Field, fieldControlClass } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { MoneyInput } from '@/components/ui/money-input'
import { useToast } from '@/components/ui/toast'
import { usePortfolio, type Asset } from '@/context/PortfolioContext'
import { ASSET_CATEGORIES, type AssetCategory } from '@/lib/asset-classification'
import { formatBRL, plural } from '@/lib/format'
import { parseDecimalInput } from '@/lib/parse-number'
import { isExchangeTicker, MANUAL_VALUE_PREFIX } from '@/lib/tickers'
import { cn } from '@/lib/utils'

const UNCLASSIFIED: AssetCategory = 'Não classificado'
const QUOTE_UNAVAILABLE = 'Cotação indisponível agora'
const SAVE_ERROR = 'Não foi possível salvar. Tente de novo.'

const OTHER_TYPES: { label: string; category: AssetCategory }[] = [
  { label: 'Tesouro', category: 'Renda fixa' },
  { label: 'CDB', category: 'Renda fixa' },
  { label: 'Poupança', category: 'Renda fixa' },
  { label: 'Previdência', category: 'Previdência' },
  { label: 'Cripto', category: 'Cripto' },
  { label: 'Outro', category: 'Outros' },
]

type InvestmentKind = 'exchange' | 'other'
type SaveAsset = (asset: Asset, successMessage: string) => Promise<string | null>

interface SearchResult {
  ticker: string
  name: string
  category: AssetCategory
}

interface QuoteResult {
  price: number
  name: string
  category: AssetCategory
}

type QuoteState = { status: 'idle' | 'loading' | 'failed' } | ({ status: 'ok' } & QuoteResult)

interface FormProps {
  formId: string
  busy: boolean
  setBusy: (busy: boolean) => void
  onSave: SaveAsset
}

const isKnownCategory = (category: AssetCategory | null | undefined): category is AssetCategory =>
  Boolean(category) && category !== UNCLASSIFIED

function randomManualTicker() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const suffix = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
  return `${MANUAL_VALUE_PREFIX}${suffix}`
}

function ExchangeForm({ formId, busy, setBusy, onSave }: FormProps) {
  const { assets } = usePortfolio()
  const listId = useId()
  const quantityRef = useRef<HTMLInputElement>(null)

  const [ticker, setTicker] = useState('')
  const [suggestions, setSuggestions] = useState<SearchResult[]>([])
  const [listOpen, setListOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [quote, setQuote] = useState<QuoteState>({ status: 'idle' })
  const [sourceName, setSourceName] = useState('')
  const [sourceCategory, setSourceCategory] = useState<AssetCategory | null>(null)
  const [manualCategory, setManualCategory] = useState<AssetCategory>(UNCLASSIFIED)
  const [quantityText, setQuantityText] = useState('')
  const [avgPrice, setAvgPrice] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // O blur do campo acontece no meio da escolha de uma sugestão, antes de o estado atualizar.
  const tickerRef = useRef('')
  const avgEdited = useRef(false)
  const quoteRequest = useRef<{ ticker: string; promise: Promise<QuoteResult | null> } | null>(null)

  const code = ticker.trim()
  const showList = listOpen && code !== '' && suggestions.length > 0

  const loadQuote = useCallback((symbol: string) => {
    if (quoteRequest.current?.ticker === symbol) return quoteRequest.current.promise

    setQuote({ status: 'loading' })
    const isCurrent = () => quoteRequest.current?.ticker === symbol
    const promise: Promise<QuoteResult | null> = getAssetQuote(symbol)
      .then((response) => {
        const data = response.data
        if (!data) {
          if (isCurrent()) setQuote({ status: 'failed' })
          return null
        }
        const result: QuoteResult = { price: data.price, name: data.name, category: data.category }
        if (isCurrent()) {
          setQuote({ status: 'ok', ...result })
          if (!avgEdited.current) setAvgPrice(data.price)
        }
        return result
      })
      .catch(() => {
        if (isCurrent()) setQuote({ status: 'failed' })
        return null
      })
    quoteRequest.current = { ticker: symbol, promise }
    return promise
  }, [])

  useEffect(() => {
    if (!listOpen || !code) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/assets/search?q=${encodeURIComponent(code)}`, {
          signal: controller.signal,
        })
        if (!response.ok) return
        const data = await response.json()
        setSuggestions(Array.isArray(data?.results) ? data.results : [])
        setActiveIndex(-1)
      } catch {
        // A busca só sugere: sem ela, a pessoa ainda pode digitar o código inteiro.
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [code, listOpen])

  useEffect(() => {
    if (!isExchangeTicker(code)) return
    const timer = setTimeout(() => void loadQuote(code), 500)
    return () => clearTimeout(timer)
  }, [code, loadQuote])

  const clearAssetData = () => {
    quoteRequest.current = null
    avgEdited.current = false
    setQuote({ status: 'idle' })
    setSourceName('')
    setSourceCategory(null)
    setManualCategory(UNCLASSIFIED)
    setAvgPrice(null)
    setError(null)
  }

  const handleTickerChange = (raw: string) => {
    const next = raw.toUpperCase()
    tickerRef.current = next.trim()
    setTicker(next)
    setListOpen(true)
    setActiveIndex(-1)
    clearAssetData()
  }

  const pickSuggestion = (item: SearchResult) => {
    tickerRef.current = item.ticker
    setTicker(item.ticker)
    setListOpen(false)
    clearAssetData()
    setSourceName(item.name)
    setSourceCategory(item.category)
    void loadQuote(item.ticker)
    quantityRef.current?.focus()
  }

  const handleTickerBlur = () => {
    setListOpen(false)
    if (isExchangeTicker(tickerRef.current)) void loadQuote(tickerRef.current)
  }

  const handleTickerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((index) => (index + step + suggestions.length) % suggestions.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (activeIndex >= 0) pickSuggestion(suggestions[activeIndex])
      else setListOpen(false)
    } else if (event.key === 'Escape') {
      // Esc fecha só a lista: sem isto, fecharia o formulário junto.
      event.preventDefault()
      event.stopPropagation()
      setListOpen(false)
    }
  }

  const handleRetryQuote = () => {
    quoteRequest.current = null
    if (isExchangeTicker(tickerRef.current)) void loadQuote(tickerRef.current)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setListOpen(false)

    const symbol = tickerRef.current
    if (!isExchangeTicker(symbol)) {
      setError('Informe um código da B3, como MXRF11 ou PETR4.')
      return
    }
    const quantity = parseDecimalInput(quantityText)
    if (quantity === null || quantity <= 0) {
      setError('Informe a quantidade de cotas.')
      return
    }

    setBusy(true)
    setError(null)

    // Quem salva antes do debounce também precisa do preço e do nome corretos.
    const result = await loadQuote(symbol)
    // Sem cotação e sem vir da lista, nada confirma que o código existe: salvar criaria um ativo inventado.
    // Quem escolheu da lista continua podendo salvar quando a fonte de cotações está fora do ar.
    if (!result && !sourceName) {
      setBusy(false)
      setError(`Não encontramos ${symbol} na B3. Confira o código ou escolha um ativo da lista.`)
      return
    }
    // O estado pode ainda não trazer a cotação recém-chegada; campo apagado de propósito fica sem custo.
    const paid = avgEdited.current ? avgPrice : (avgPrice ?? result?.price ?? null)
    const price = result?.price ?? paid
    if (price === null) {
      setBusy(false)
      setError(`${QUOTE_UNAVAILABLE}. Informe o preço médio pago por cota para salvar.`)
      return
    }

    const quotedName = result && result.name !== symbol ? result.name : null
    const category = isKnownCategory(sourceCategory)
      ? sourceCategory
      : isKnownCategory(result?.category)
        ? result.category
        : manualCategory
    const alreadyOwned = assets.some((asset) => asset.ticker === symbol)

    const saveError = await onSave(
      {
        ticker: symbol,
        name: quotedName ?? (sourceName || symbol),
        quantity,
        price,
        avgPrice: paid,
        category,
        targetPercent: null,
      },
      alreadyOwned ? `Somamos ${plural(quantity, 'cota', 'cotas')} a ${symbol}` : 'Ativo adicionado',
    )
    setBusy(false)
    if (saveError) setError(saveError)
  }

  const quantity = parseDecimalInput(quantityText)
  const referencePrice = quote.status === 'ok' ? quote.price : avgPrice
  const estimatedValue = quantity !== null && quantity > 0 && referencePrice !== null ? quantity * referencePrice : null
  const shownName = quote.status === 'ok' && quote.name !== code ? quote.name : sourceName
  const knownCategory = isKnownCategory(sourceCategory)
    ? sourceCategory
    : quote.status === 'ok' && isKnownCategory(quote.category)
      ? quote.category
      : null
  const needsCategory =
    isExchangeTicker(code) && (quote.status === 'ok' || quote.status === 'failed') && knownCategory === null

  return (
    <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Field label="Código ou nome do ativo" hint="Não achou na lista? Digite o código completo.">
          {({ id, describedBy }) => (
            <input
              id={id}
              role="combobox"
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
              aria-describedby={describedBy}
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={40}
              placeholder="Ex.: MXRF11 ou PETR4"
              value={ticker}
              disabled={busy}
              onChange={(event) => handleTickerChange(event.target.value)}
              onFocus={() => setListOpen(true)}
              onBlur={handleTickerBlur}
              onKeyDown={handleTickerKeyDown}
              className={fieldControlClass}
            />
          )}
        </Field>

        {/* Na página, e não sobreposta: dentro do painel com rolagem, uma lista absoluta seria cortada. */}
        <div
          id={listId}
          role="listbox"
          aria-label="Sugestões de ativos"
          hidden={!showList}
          // Mantém o foco no campo até o clique: o blur fecharia a lista antes da escolha.
          onPointerDown={(event) => event.preventDefault()}
          className="max-h-48 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-1"
        >
          {suggestions.map((item, index) => (
            <button
              key={item.ticker}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              tabIndex={-1}
              onClick={() => pickSuggestion(item)}
              className={cn(
                'flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left hover:bg-slate-800',
                index === activeIndex && 'bg-slate-800',
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-emerald-400">{item.ticker}</span>
                <span className="block truncate text-xs text-slate-400">{item.name}</span>
              </span>
              <span className="shrink-0 text-xs text-slate-400">{item.category}</span>
            </button>
          ))}
        </div>
      </div>

      <div role="status" className="empty:hidden">
        {quote.status === 'loading' && (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Buscando cotação...
          </p>
        )}
        {quote.status === 'ok' && (
          <div className="text-sm">
            {shownName && <p className="text-slate-300">{shownName}</p>}
            <p className="font-semibold text-white">Cotação: {formatBRL(quote.price)}</p>
            {knownCategory && <p className="text-xs text-slate-400">{knownCategory}</p>}
          </div>
        )}
        {quote.status === 'failed' && (
          <div className="flex flex-wrap items-center justify-between gap-x-2 text-sm text-amber-300">
            <p className="min-w-0 flex-1 basis-48">
              {QUOTE_UNAVAILABLE}. Confira o código ou informe o preço médio para salvar.
            </p>
            <button
              type="button"
              onClick={handleRetryQuote}
              className="h-11 shrink-0 cursor-pointer rounded-lg px-2 font-semibold text-emerald-400 hover:bg-slate-800"
            >
              Tentar de novo
            </button>
          </div>
        )}
      </div>

      {needsCategory && (
        <Field label="Categoria">
          {({ id, describedBy }) => (
            <select
              id={id}
              aria-describedby={describedBy}
              value={manualCategory}
              onChange={(event) => setManualCategory(event.target.value as AssetCategory)}
              className={fieldControlClass}
            >
              {ASSET_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}

      <Field label="Quantidade de cotas">
        {({ id, describedBy }) => (
          <input
            id={id}
            ref={quantityRef}
            aria-describedby={describedBy}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ex.: 10"
            value={quantityText}
            disabled={busy}
            onChange={(event) => {
              if (/^[0-9.,]*$/.test(event.target.value)) setQuantityText(event.target.value)
            }}
            className={fieldControlClass}
          />
        )}
      </Field>

      <Field
        label="Preço médio pago por cota"
        hint={quote.status === 'ok' ? 'Preenchido com a cotação. Troque pelo valor que você pagou.' : undefined}
      >
        {({ id, describedBy }) => (
          <MoneyInput
            id={id}
            aria-describedby={describedBy}
            value={avgPrice}
            disabled={busy}
            onValueChange={(value) => {
              avgEdited.current = true
              setAvgPrice(value)
            }}
          />
        )}
      </Field>

      {estimatedValue !== null && (
        <p className="flex items-baseline justify-between gap-2 text-sm text-slate-400">
          Valor estimado da posição
          <span className="font-semibold text-white">{formatBRL(estimatedValue)}</span>
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-rose-400">
          {error}
        </p>
      )}
    </form>
  )
}

function OtherForm({ formId, busy, setBusy, onSave }: FormProps) {
  const [name, setName] = useState('')
  const [typeLabel, setTypeLabel] = useState('')
  const [value, setValue] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return

    const cleanName = name.trim()
    const type = OTHER_TYPES.find((item) => item.label === typeLabel)
    if (!cleanName) {
      setError('Informe o nome do investimento.')
      return
    }
    if (!type) {
      setError('Escolha o tipo do investimento.')
      return
    }
    if (value === null || value <= 0) {
      setError('Informe o valor atual.')
      return
    }

    setBusy(true)
    setError(null)
    const saveError = await onSave(
      {
        ticker: randomManualTicker(),
        name: cleanName,
        quantity: 1,
        price: value,
        avgPrice: null,
        category: type.category,
        targetPercent: null,
      },
      'Ativo adicionado',
    )
    setBusy(false)
    if (saveError) setError(saveError)
  }

  return (
    <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Field label="Nome">
        {({ id, describedBy }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            type="text"
            maxLength={80}
            autoComplete="off"
            placeholder="Ex.: Tesouro Selic 2029"
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            className={fieldControlClass}
          />
        )}
      </Field>

      <Field label="Tipo">
        {({ id, describedBy }) => (
          <select
            id={id}
            aria-describedby={describedBy}
            value={typeLabel}
            disabled={busy}
            onChange={(event) => setTypeLabel(event.target.value)}
            className={fieldControlClass}
          >
            <option value="" disabled>
              Selecione
            </option>
            {OTHER_TYPES.map((item) => (
              <option key={item.label} value={item.label}>
                {item.label}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label="Valor atual" hint="Você atualiza este valor à mão na carteira.">
        {({ id, describedBy }) => (
          <MoneyInput id={id} aria-describedby={describedBy} value={value} disabled={busy} onValueChange={setValue} />
        )}
      </Field>

      {error && (
        <p role="alert" className="text-sm text-rose-400">
          {error}
        </p>
      )}
    </form>
  )
}

export interface AddInvestmentModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
  /** Com onSaved, quem chama avisa o sucesso: o modal só entrega a mensagem. */
  onSaved?: (message: string) => void
  triggerClassName?: string
}

export function AddInvestmentModal({ open, onOpenChange, hideTrigger, onSaved, triggerClassName }: AddInvestmentModalProps) {
  const { addAsset } = usePortfolio()
  const { toast } = useToast()
  const formId = useId()

  const [internalOpen, setInternalOpen] = useState(false)
  const [kind, setKind] = useState<InvestmentKind>('exchange')
  const [busy, setBusy] = useState(false)
  const [formKey, setFormKey] = useState(0)

  const isOpen = open ?? internalOpen

  const setOpen = (next: boolean) => {
    if (open === undefined) setInternalOpen(next)
    onOpenChange?.(next)
  }

  // Fechar no meio da gravação esconderia uma falha.
  const handleOpenChange = (next: boolean) => {
    if (busy && !next) return
    setOpen(next)
  }

  const save: SaveAsset = async (asset, successMessage) => {
    const result = await addAsset(asset)
    if (!result.ok) return result.error ?? SAVE_ERROR
    if (onSaved) onSaved(successMessage)
    else toast({ message: successMessage, kind: 'success' })
    setOpen(false)
    return null
  }

  const resetForm = () => {
    setKind('exchange')
    setFormKey((key) => key + 1)
  }

  const Form = kind === 'exchange' ? ExchangeForm : OtherForm

  return (
    <>
      {!hideTrigger && (
        <Button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
          <Plus aria-hidden="true" />
          Adicionar investimento
        </Button>
      )}

      <Modal
        open={isOpen}
        onOpenChange={handleOpenChange}
        onClosed={resetForm}
        title="Adicionar investimento"
        footer={
          <>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => handleOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" form={formId} disabled={busy} aria-busy={busy} className="flex-1">
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
              Salvar
            </Button>
          </>
        }
      >
        <div role="group" aria-label="Tipo de investimento" className="mb-4 grid grid-cols-2 gap-2">
          {(
            [
              ['exchange', 'Bolsa (ações e FIIs)'],
              ['other', 'Outro investimento'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              disabled={busy}
              onClick={() => setKind(value)}
              className={cn(
                'min-h-11 cursor-pointer rounded-lg border px-2 py-1.5 text-sm font-medium disabled:opacity-60',
                kind === value
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <Form key={`${kind}-${formKey}`} formId={formId} busy={busy} setBusy={setBusy} onSave={save} />
      </Modal>
    </>
  )
}
