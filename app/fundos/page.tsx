'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import useSWR from 'swr'
import { CalendarClock, ChartLine, CloudOff, Coins, Plus } from 'lucide-react'
import { BackButton } from '@/components/back-button'
import { InvestmentDisclaimer } from '@/components/investment-disclaimer'
import { useQuickAdd } from '@/components/quick-add-provider'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useAppMode } from '@/context/AppModeContext'
import { usePortfolio, type Asset } from '@/context/PortfolioContext'
import {
  buildCompositionSeries,
  shiftMonth,
  type BenchmarkId,
  type BenchmarkRange,
  type BenchmarksResponse,
} from '@/lib/benchmarks'
import { formatBRL, formatDateTime, formatMonthYear, formatPercent, plural } from '@/lib/format'
import { assetReturn, portfolioReturn, totalValue, type AssetReturn } from '@/lib/portfolio-metrics'
import { isExchangeTicker, isManualValueTicker } from '@/lib/tickers'

type LineId = BenchmarkId | 'composition'
type ChartRow = { month: string; label: string } & Partial<Record<LineId, number | null>>
type ChartLineInfo = { id: LineId; short: string; color: string; dash?: string; width: number }

const RANGES: { value: BenchmarkRange; label: string }[] = [
  { value: '6m', label: '6M' },
  { value: '12m', label: '12M' },
  { value: 'ytd', label: 'No ano' },
]

const COMPOSITION_LABEL = 'Composição atual (simulação)'

// A cor segue a série, nunca a posição. O traço repete a identidade para quem não distingue as cores.
const LINE_STYLE: Record<LineId, Omit<ChartLineInfo, 'id'>> = {
  composition: { short: 'Composição', color: '#199e70', width: 3 },
  cdi: { short: 'CDI', color: '#3987e5', width: 2 },
  ibov: { short: 'Ibovespa', color: '#d55181', dash: '8 3', width: 2 },
  ipca: { short: 'IPCA', color: '#c98500', dash: '2 3', width: 2 },
  ifix: { short: 'IFIX aprox.', color: '#9085e9', dash: '6 2 2 2', width: 2 },
}

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function shortMonth(month: string) {
  return `${MONTHS_SHORT[Number(month.slice(5)) - 1]}/${month.slice(2, 4)}`
}

function longMonth(month: string) {
  return formatMonthYear(Number(month.slice(0, 4)), Number(month.slice(5)))
}

function signedPercent(value: number | null | undefined) {
  return formatPercent(value, { signed: true })
}

function signedBRL(value: number) {
  return `${value >= 0.005 ? '+' : ''}${formatBRL(value)}`
}

function returnTone(amount: number) {
  if (amount >= 0.005) return 'text-emerald-400'
  if (amount <= -0.005) return 'text-rose-400'
  return 'text-slate-200'
}

async function fetchBenchmarks(url: string): Promise<BenchmarksResponse> {
  const res = await fetch(url)
  // Sem isto, um 401, 429 ou 502 chegaria à tela como resposta válida.
  if (!res.ok) throw new Error(`Falha ao consultar índices: ${res.status}`)
  return res.json()
}

type ChartTooltipProps = {
  active?: boolean
  label?: unknown
  payload?: readonly { dataKey?: unknown; value?: unknown }[]
  lines: ChartLineInfo[]
}

function ChartTooltip({ active, label, payload, lines }: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="min-w-36 space-y-1 rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs shadow-xl">
      <p className="font-semibold text-slate-200">{String(label)}</p>
      {lines.map((line) => {
        const entry = payload.find((item) => item.dataKey === line.id)
        if (typeof entry?.value !== 'number') return null
        return (
          <div key={line.id} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="size-2 rounded-full" style={{ backgroundColor: line.color }} aria-hidden="true" />
              {line.short}
            </span>
            <span className="font-semibold tabular-nums text-slate-100">{signedPercent(entry.value)}</span>
          </div>
        )
      })}
    </div>
  )
}

function ChartSkeleton() {
  return <div role="status" aria-label="Carregando índices" className="h-56 w-full animate-pulse rounded-xl bg-slate-800/50" />
}

// O Recharts pesa: o gráfico fica em um pedaço separado, baixado só quando há dados para desenhar.
const ComparisonChart = dynamic(
  () =>
    import('recharts').then(
      ({ CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis }) =>
        function ComparisonChart({ rows, lines }: { rows: ChartRow[]; lines: ChartLineInfo[] }) {
          return (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#94a3b8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={12}
                  width={52}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => formatPercent(value)}
                />
                <ReferenceLine y={0} stroke="#475569" />
                <Tooltip content={<ChartTooltip lines={lines} />} />
                {lines.map((line) => (
                  <Line
                    key={line.id}
                    type="linear"
                    dataKey={line.id}
                    name={line.short}
                    stroke={line.color}
                    strokeWidth={line.width}
                    strokeDasharray={line.dash}
                    // O ponto mantém visível um mês isolado, como fevereiro em 'No ano'.
                    dot={{ r: line.id === 'composition' ? 3 : 2, fill: line.color, strokeWidth: 0 }}
                    activeDot={{ r: 5, stroke: '#0f172a', strokeWidth: 2 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )
        },
    ),
  { ssr: false, loading: () => <ChartSkeleton /> },
)

function LineSwatch({ line, muted }: { line: ChartLineInfo; muted?: boolean }) {
  return (
    <svg width="24" height="8" viewBox="0 0 24 8" className="shrink-0" aria-hidden="true">
      <line
        x1="0"
        y1="4"
        x2="24"
        y2="4"
        stroke={muted ? '#475569' : line.color}
        strokeWidth={line.width}
        strokeDasharray={line.dash}
      />
    </svg>
  )
}

function LegendRow({
  line,
  label,
  lastMonth,
  value,
  visible,
  onToggle,
}: {
  line: ChartLineInfo
  label: string
  lastMonth: string | null
  value: number | undefined
  visible: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={visible}
      className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-slate-800/60"
    >
      <LineSwatch line={line} muted={!visible} />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${visible ? 'text-slate-100' : 'text-slate-400'}`}>{label}</span>
        {lastMonth && <span className="block text-xs text-slate-400">até {longMonth(lastMonth)}</span>}
      </span>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${visible ? 'text-slate-100' : 'text-slate-400'}`}>
        {signedPercent(value)}
      </span>
    </button>
  )
}

function MonthlyTable({ rows, lines }: { rows: ChartRow[]; lines: ChartLineInfo[] }) {
  return (
    <details className="border-t border-slate-800/60 pt-1">
      <summary className="flex min-h-11 cursor-pointer items-center px-2 text-sm font-medium text-slate-300">
        Ver mês a mês
      </summary>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-slate-400">
              <th scope="col" className="px-2 py-1.5 font-medium">Mês</th>
              {lines.map((line) => (
                <th key={line.id} scope="col" className="whitespace-nowrap px-2 py-1.5 text-right font-medium">
                  {line.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month} className="border-t border-slate-800/60 text-slate-200">
                <th scope="row" className="whitespace-nowrap px-2 py-1.5 font-medium">{row.label}</th>
                {lines.map((line) => (
                  <td key={line.id} className="px-2 py-1.5 text-right tabular-nums">
                    {signedPercent(row[line.id])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function Datum({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-sm font-medium text-slate-100">{children}</dd>
    </div>
  )
}

function ReturnDatum({ result }: { result: AssetReturn | null }) {
  return (
    <Datum label={`${result && result.amount <= -0.005 ? 'Perda' : 'Ganho'} desde o preço médio`}>
      {result ? (
        <span className={returnTone(result.amount)}>
          {signedBRL(result.amount)} ({signedPercent(result.pct)})
          <span className="font-normal text-slate-400"> sem proventos</span>
        </span>
      ) : (
        '—'
      )}
    </Datum>
  )
}

function AssetItem({ asset, readOnly }: { asset: Asset; readOnly: boolean }) {
  const manualValue = isManualValueTicker(asset.ticker)
  const onExchange = isExchangeTicker(asset.ticker)
  const value = asset.quantity * asset.price

  return (
    <li className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
      <div className="min-w-0">
        <p className="truncate text-base font-semibold text-white">{onExchange ? asset.ticker : asset.name || asset.ticker}</p>
        {onExchange && asset.name && asset.name !== asset.ticker && (
          <p className="truncate text-sm text-slate-400">{asset.name}</p>
        )}
      </div>

      {/* Valor informado à mão não tem cota, cotação nem custo: mostrar esses campos seria inventar. */}
      {manualValue ? (
        <dl>
          <Datum label="Valor informado">{formatBRL(value)}</Datum>
        </dl>
      ) : (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
          <Datum label="Quantidade">{asset.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 8 })}</Datum>
          <Datum label="Valor">{formatBRL(value)}</Datum>
          <Datum label="Preço médio">
            {asset.avgPrice != null ? (
              formatBRL(asset.avgPrice)
            ) : readOnly ? (
              <span className="font-normal text-slate-400">Não informado pelo banco</span>
            ) : (
              <Link href={`/carteira#ativo-${asset.ticker}`} className="inline-flex min-h-11 items-center text-emerald-400 underline underline-offset-2">
                Informe seu preço médio
              </Link>
            )}
          </Datum>
          <Datum label="Cotação">
            {onExchange && !asset.quoteMissing ? formatBRL(asset.price) : '—'}
            {onExchange && asset.quoteStale && (
              <span className="block text-xs font-normal text-slate-400">Não atualizada</span>
            )}
          </Datum>
          <div className="col-span-2">
            <ReturnDatum result={assetReturn(asset)} />
          </div>
        </dl>
      )}
    </li>
  )
}

export default function FundosPage() {
  const { assets, isLoaded, isSynced, loadError, quotesAsOf, quotesFailed, reloadAssets } = usePortfolio()
  const { isOpenFinance } = useAppMode()
  const { open: openQuickAdd } = useQuickAdd()

  const [range, setRange] = useState<BenchmarkRange>('6m')
  const [hiddenLines, setHiddenLines] = useState<ReadonlySet<LineId>>(new Set())

  const holdings = useMemo(
    () =>
      assets
        .filter((asset) => isExchangeTicker(asset.ticker))
        .map((asset) => ({ ticker: asset.ticker, quantity: asset.quantity })),
    [assets],
  )
  const tickersParam = useMemo(
    () => [...new Set(holdings.map((holding) => holding.ticker))].sort().join(','),
    [holdings],
  )

  // Espera a resposta do banco: pedir antes com a lista do cache gastaria duas consultas do limite por hora.
  const portfolioSettled = isLoaded && (isSynced || loadError)
  const { data, error, isLoading, mutate } = useSWR(
    portfolioSettled ? `/api/benchmarks?range=${range}&tickers=${tickersParam}` : null,
    fetchBenchmarks,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )

  const composition = useMemo(
    () => (data ? buildCompositionSeries(data.tickerCloses, holdings, data.months) : null),
    [data, holdings],
  )

  const lines = useMemo<ChartLineInfo[]>(() => {
    if (!data) return []
    const available = data.series.filter((series) => series.status === 'ok').map((series) => series.id as LineId)
    if (composition?.points.length) available.push('composition')
    return available.map((id) => ({ id, ...LINE_STYLE[id] }))
  }, [data, composition])

  const rows = useMemo<ChartRow[]>(() => {
    if (!data) return []
    return data.months.map((month) => {
      const row: ChartRow = { month, label: shortMonth(month) }
      for (const series of data.series) {
        if (series.status !== 'ok') continue
        row[series.id] = series.points.find((point) => point.month === month)?.accumulatedPct ?? null
      }
      if (composition) {
        row.composition = composition.points.find((point) => point.month === month)?.accumulatedPct ?? null
      }
      return row
    })
  }, [data, composition])

  const toggleLine = (id: LineId) => {
    setHiddenLines((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  const hasMonths = Boolean(data && data.months.length > 0)
  const chartFailed = Boolean(!data && error) || Boolean(hasMonths && data?.series.every((s) => s.status === 'unavailable'))
  const compositionLast = composition?.points.at(-1)
  const excluded = hasMonths ? (composition?.excludedTickers ?? []) : []

  const assetsLoading = !isLoaded || (!isSynced && !loadError && assets.length === 0)
  const assetsUnavailable = !isSynced && loadError && assets.length === 0
  const hasExchangeAssets = holdings.length > 0
  const overallReturn = useMemo(() => portfolioReturn(assets), [assets])

  const addAsset = () => openQuickAdd('asset')

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28">
      <header className="flex items-start gap-2">
        <BackButton fallbackHref="/carteira" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-400">Comparar com índices</p>
          <h1 className="text-2xl font-bold tracking-tight text-white">Rentabilidade</h1>
          {hasExchangeAssets && quotesFailed && (
            <p className="mt-0.5 text-xs text-amber-400">
              Não atualizado{quotesAsOf ? `. Última cotação de ${formatDateTime(quotesAsOf)}` : ''}
            </p>
          )}
          {hasExchangeAssets && !quotesFailed && quotesAsOf && (
            <p className="mt-0.5 text-xs text-slate-400">Cotações de {formatDateTime(quotesAsOf)}</p>
          )}
        </div>
      </header>

      {loadError && !assetsUnavailable && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-sm text-amber-200">
            Não foi possível atualizar sua carteira. Você está vendo a última versão salva neste aparelho.
          </p>
          <button type="button" onClick={reloadAssets} className="min-h-11 cursor-pointer text-sm font-semibold text-amber-100 underline underline-offset-2">
            Tentar novamente
          </button>
        </div>
      )}

      <section aria-labelledby="comparativo-titulo" className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="comparativo-titulo" className="text-sm font-semibold text-white">Acumulado no período</h2>
            <p className="text-xs text-slate-400">Só meses já fechados</p>
          </div>
          <div role="group" aria-label="Período" className="flex rounded-xl border border-slate-800 bg-slate-950/60 p-0.5">
            {RANGES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                aria-pressed={range === option.value}
                className={`min-h-11 min-w-11 cursor-pointer rounded-lg px-3 text-sm font-semibold ${
                  range === option.value ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {!portfolioSettled || isLoading ? (
          <ChartSkeleton />
        ) : chartFailed || !data ? (
          <EmptyState
            icon={CloudOff}
            title="Índices indisponíveis agora"
            description="Não foi possível consultar os índices. Nenhum número é mostrado até a consulta funcionar."
            actionLabel="Tentar novamente"
            onAction={() => void mutate()}
          />
        ) : !hasMonths ? (
          <EmptyState
            icon={CalendarClock}
            title="Ainda não há mês fechado neste ano"
            description="O acumulado do ano começa quando janeiro terminar. Por enquanto, veja 6M ou 12M."
          />
        ) : (
          <>
            <div
              role="img"
              aria-label="Gráfico de linhas com o acumulado de cada série por mês. Os valores estão na legenda e na tabela mês a mês."
              className="h-56 w-full"
            >
              <ComparisonChart rows={rows} lines={lines.filter((line) => !hiddenLines.has(line.id))} />
            </div>

            <div className="space-y-1 border-t border-slate-800/60 pt-3">
              <p className="px-2 text-xs text-slate-400">
                Variação desde o fim de {longMonth(shiftMonth(data.months[0], -1))}. Toque para mostrar ou ocultar.
              </p>
              {compositionLast && (
                <LegendRow
                  line={{ id: 'composition', ...LINE_STYLE.composition }}
                  label={COMPOSITION_LABEL}
                  lastMonth={compositionLast.month}
                  value={compositionLast.accumulatedPct}
                  visible={!hiddenLines.has('composition')}
                  onToggle={() => toggleLine('composition')}
                />
              )}
              {data.series.map((series) => {
                const line = { id: series.id, ...LINE_STYLE[series.id] }
                if (series.status !== 'ok') {
                  return (
                    <div key={series.id} className="flex min-h-11 items-center gap-3 px-2 py-1.5">
                      <LineSwatch line={line} muted />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-300">{series.label}</span>
                        <span className="block text-xs text-slate-400">Índice indisponível agora</span>
                      </span>
                    </div>
                  )
                }
                return (
                  <LegendRow
                    key={series.id}
                    line={line}
                    label={series.label}
                    lastMonth={series.lastMonth}
                    value={series.points.at(-1)?.accumulatedPct}
                    visible={!hiddenLines.has(series.id)}
                    onToggle={() => toggleLine(series.id)}
                  />
                )
              })}
            </div>

            <MonthlyTable rows={rows} lines={lines} />
          </>
        )}

        <div className="space-y-2 border-t border-slate-800/60 pt-3 text-xs text-slate-400">
          {hasExchangeAssets ? (
            <>
              <p className="font-semibold text-slate-300">{COMPOSITION_LABEL}</p>
              <p>
                Aplica as quantidades de hoje aos preços históricos de cada mês, sem proventos. Não é o retorno que você
                obteve.
              </p>
              {excluded.length > 0 && <p>Fora da simulação: {excluded.join(', ')}, por falta de histórico.</p>}
              <p>Renda fixa e outros ativos sem código de bolsa não entram na simulação.</p>
            </>
          ) : isSynced ? (
            <p>
              {isOpenFinance
                ? 'Seus bancos conectados não informaram ativos de bolsa, então só os índices aparecem.'
                : 'Adicione ativos de bolsa para ver a simulação da sua composição atual.'}
            </p>
          ) : null}
          <InvestmentDisclaimer />
        </div>
      </section>

      <section aria-labelledby="ativos-titulo" className="space-y-3">
        <div className="flex items-start justify-between gap-3 px-1">
          <div className="min-w-0">
            <h2 id="ativos-titulo" className="text-sm font-semibold text-white">Meus Ativos</h2>
            {!assetsLoading && assets.length > 0 && (
              <p className="text-xs text-slate-400">
                {plural(assets.length, 'ativo', 'ativos')}. Total: <span className="font-semibold text-slate-200">{formatBRL(totalValue(assets))}</span>
              </p>
            )}
          </div>
          {!isOpenFinance && !assetsLoading && (
            <button type="button" onClick={addAsset} className={buttonVariants({ variant: 'outline', className: 'shrink-0' })}>
              <Plus className="size-4" aria-hidden="true" />
              Adicionar ativo
            </button>
          )}
        </div>

        {overallReturn && (
          <p className="px-1 text-sm text-slate-300">
            {overallReturn.amount <= -0.005 ? 'Perda' : 'Ganho'} desde o preço médio:{' '}
            <span className={`font-semibold ${returnTone(overallReturn.amount)}`}>
              {signedBRL(overallReturn.amount)} ({signedPercent(overallReturn.pct)})
            </span>
            , sem proventos. Considera {overallReturn.coveredAssets} de {plural(overallReturn.totalAssets, 'ativo', 'ativos')}.
          </p>
        )}

        {assetsLoading ? (
          <div role="status" aria-label="Carregando ativos" className="h-32 animate-pulse rounded-2xl border border-slate-800/80 bg-slate-900/60" />
        ) : assetsUnavailable ? (
          <EmptyState
            icon={ChartLine}
            title="Não foi possível carregar sua carteira"
            description="Confira sua conexão e tente de novo."
            actionLabel="Tentar novamente"
            onAction={reloadAssets}
          />
        ) : assets.length === 0 ? (
          isOpenFinance ? (
            <EmptyState
              icon={Coins}
              title="Nenhum ativo encontrado"
              description="Os investimentos dos bancos conectados aparecem aqui depois da sincronização."
            />
          ) : (
            <EmptyState
              icon={Coins}
              title="Nenhum ativo cadastrado"
              description="Registre seus ativos para ver quanto valem e o ganho desde o preço médio."
              actionLabel="Adicionar ativo"
              onAction={addAsset}
            />
          )
        ) : (
          <ul className="space-y-3">
            {assets.map((asset) => (
              <AssetItem key={asset.ticker} asset={asset} readOnly={isOpenFinance} />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
