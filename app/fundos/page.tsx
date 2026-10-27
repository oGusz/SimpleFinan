'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus,
  ChevronRight,
  ArrowLeft,
  TrendingUp,
  X,
  Search,
  Loader2,
  Trash2,
  Coins,
  BarChart3,
  Check,
} from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { usePortfolio } from '@/context/PortfolioContext'
import { searchAssets, getAssetQuote } from '@/app/actions/quotes'
import { BottomNav } from '@/components/bottom-nav'

// Cores dos benchmarks
const BENCHMARK_CONFIG = {
  carteira: { label: 'Minha Carteira', color: '#10b981', dotColor: '#34d399' },
  ifix: { label: 'IFIX', color: '#f97316', dotColor: '#fb923c' },
  cdi: { label: 'CDI / Selic', color: '#06b6d4', dotColor: '#22d3ee' },
  ipca: { label: 'IPCA', color: '#eab308', dotColor: '#facc15' },
  ibov: { label: 'Ibovespa', color: '#3b82f6', dotColor: '#60a5fa' },
}

// Dados históricos acumulados de rentabilidade (%) por período
const BENCHMARK_DATA: Record<
  string,
  Array<{ mes: string; carteira: number; ifix: number; cdi: number; ipca: number; ibov: number }>
> = {
  '6M': [
    { mes: 'Mai', carteira: 0.0, ifix: 0.0, cdi: 0.0, ipca: 0.0, ibov: 0.0 },
    { mes: 'Jun', carteira: 2.1, ifix: 1.4, cdi: 1.6, ipca: 0.6, ibov: 1.2 },
    { mes: 'Jul', carteira: 4.8, ifix: 3.2, cdi: 3.3, ipca: 1.2, ibov: 3.0 },
    { mes: 'Ago', carteira: 7.9, ifix: 5.6, cdi: 5.1, ipca: 1.9, ibov: 4.5 },
    { mes: 'Set', carteira: 11.2, ifix: 8.4, cdi: 7.0, ipca: 2.7, ibov: 6.8 },
    { mes: 'Out', carteira: 14.6, ifix: 11.4, cdi: 8.9, ipca: 3.5, ibov: 8.2 },
  ],
  '1A': [
    { mes: 'Nov/25', carteira: 0.0, ifix: 0.0, cdi: 0.0, ipca: 0.0, ibov: 0.0 },
    { mes: 'Jan', carteira: 3.4, ifix: 2.2, cdi: 2.0, ipca: 0.8, ibov: -1.0 },
    { mes: 'Mar', carteira: 6.9, ifix: 4.8, cdi: 4.2, ipca: 1.7, ibov: 2.4 },
    { mes: 'Mai', carteira: 10.5, ifix: 7.6, cdi: 6.5, ipca: 2.5, ibov: 5.1 },
    { mes: 'Jul', carteira: 14.8, ifix: 10.3, cdi: 8.9, ipca: 3.4, ibov: 7.8 },
    { mes: 'Out/26', carteira: 19.4, ifix: 14.2, cdi: 11.5, ipca: 4.6, ibov: 11.0 },
  ],
  YTD: [
    { mes: 'Jan', carteira: 1.2, ifix: 0.9, cdi: 0.95, ipca: 0.4, ibov: -0.8 },
    { mes: 'Mar', carteira: 4.1, ifix: 3.1, cdi: 2.9, ipca: 1.3, ibov: 1.9 },
    { mes: 'Mai', carteira: 7.3, ifix: 5.5, cdi: 4.9, ipca: 2.1, ibov: 4.2 },
    { mes: 'Jul', carteira: 10.6, ifix: 7.8, cdi: 6.9, ipca: 2.9, ibov: 6.5 },
    { mes: 'Set', carteira: 13.9, ifix: 10.2, cdi: 8.9, ipca: 3.7, ibov: 8.9 },
    { mes: 'Hoje', carteira: 16.5, ifix: 12.1, cdi: 10.2, ipca: 4.2, ibov: 9.8 },
  ],
}

// Helper para estilizar os logos de acordo com o ativo
function getAssetBadgeStyle(ticker: string) {
  const clean = ticker.toUpperCase().trim()

  if (clean.startsWith('BBAS')) {
    return {
      bg: 'bg-[#facc15]',
      text: 'text-blue-900 font-extrabold text-[12px] tracking-tight',
      label: 'BB',
    }
  }
  if (clean.startsWith('CPFE')) {
    return {
      bg: 'bg-white',
      text: 'text-sky-700 font-black text-[10px] tracking-tighter',
      label: 'CPFL',
    }
  }
  if (clean.startsWith('PETR')) {
    return {
      bg: 'bg-emerald-600',
      text: 'text-amber-300 font-extrabold text-[11px] tracking-tight',
      label: 'PETR',
    }
  }
  if (clean.startsWith('VALE')) {
    return {
      bg: 'bg-amber-600',
      text: 'text-white font-black text-[11px] tracking-tight',
      label: 'VALE',
    }
  }
  if (clean.startsWith('ITUB') || clean.startsWith('BBDC') || clean.startsWith('SANB')) {
    return {
      bg: 'bg-orange-600',
      text: 'text-white font-bold text-[11px]',
      label: clean.slice(0, 4),
    }
  }
  if (clean.endsWith('11')) {
    return {
      bg: 'bg-blue-600',
      text: 'text-white font-bold text-[11px] tracking-tight',
      label: clean.slice(0, 4),
    }
  }

  return {
    bg: 'bg-slate-800 border border-slate-700',
    text: 'text-emerald-400 font-bold text-[11px] tracking-wider',
    label: clean.slice(0, 4),
  }
}

// Tooltip Customizado Escuro
function CustomChartTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-md text-xs space-y-1.5 min-w-[150px]">
        <div className="font-semibold text-slate-300 border-b border-slate-800 pb-1 mb-1">
          Período: {label}
        </div>
        {payload.map((entry: any) => {
          const cfg = (BENCHMARK_CONFIG as any)[entry.dataKey] || {
            label: entry.name,
            color: entry.color,
          }
          return (
            <div key={entry.dataKey} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: cfg.color }}
                />
                <span className="text-slate-400 text-[11px]">{cfg.label}:</span>
              </div>
              <span
                className="font-bold text-[11px]"
                style={{ color: cfg.color }}
              >
                {entry.value >= 0 ? `+${entry.value.toFixed(1)}%` : `${entry.value.toFixed(1)}%`}
              </span>
            </div>
          )
        })}
      </div>
    )
  }
  return null
}

export default function FundosPage() {
  const router = useRouter()
  const { assets, isLoaded, addAsset, updateQuantity, removeAsset } = usePortfolio()

  const [mounted, setMounted] = useState(false)
  const [periodo, setPeriodo] = useState<'6M' | '1A' | 'YTD'>('6M')

  // Controle de benchmarks ativos no gráfico
  const [visibilidade, setVisibilidade] = useState<Record<string, boolean>>({
    carteira: true,
    ifix: true,
    cdi: true,
    ipca: true,
    ibov: true,
  })

  // Estados do Modal de Adição
  const [modalAberto, setModalAberto] = useState(false)
  const [ticker, setTicker] = useState('')
  const [nome, setNome] = useState('')
  const [quantidade, setQuantidade] = useState('100')
  const [preco, setPreco] = useState('')
  const [buscandoCotacao, setBuscandoCotacao] = useState(false)
  const [sugestoes, setSugestoes] = useState<Array<{ ticker: string; name: string; type: string }>>([])
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false)
  const [erroForm, setErroForm] = useState('')

  // Estado para menu de ação do ativo
  const [ativoSelecionado, setAtivoSelecionado] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Sugestões enquanto digita
  useEffect(() => {
    if (ticker.trim().length > 0) {
      searchAssets(ticker).then((res) => {
        setSugestoes(res || [])
        setMostrarSugestoes((res || []).length > 0)
      })
    } else {
      setSugestoes([])
      setMostrarSugestoes(false)
    }
  }, [ticker])

  const toggleBenchmark = (key: string) => {
    setVisibilidade((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const buscarCotacaoAtivo = async (symbol: string) => {
    const target = symbol || ticker
    if (!target) return

    setBuscandoCotacao(true)
    setErroForm('')
    setMostrarSugestoes(false)

    try {
      const res = await getAssetQuote(target)
      if (res.success && res.data) {
        setPreco(res.data.price.toFixed(2).replace('.', ','))
        setNome(res.data.name)
        setTicker(res.data.ticker)
      } else {
        setErroForm(res.error || 'Cotação não encontrada na B3. Você pode inserir o preço manualmente.')
      }
    } catch {
      setErroForm('Erro ao buscar cotação. Você pode preencher manualmente.')
    } finally {
      setBuscandoCotacao(false)
    }
  }

  const handleSelecionarSugestao = (item: { ticker: string; name: string }) => {
    setTicker(item.ticker)
    setNome(item.name)
    setMostrarSugestoes(false)
    buscarCotacaoAtivo(item.ticker)
  }

  const handleAdicionarAtivo = (e: React.FormEvent) => {
    e.preventDefault()
    const cleanTicker = ticker.toUpperCase().trim()
    const precoNum = Number(preco.replace(',', '.')) || 0
    const qtdNum = Number(quantidade) || 0

    if (!cleanTicker || qtdNum <= 0 || precoNum <= 0) {
      setErroForm('Preencha ticker, quantidade e preço válidos.')
      return
    }

    addAsset({
      ticker: cleanTicker,
      name: nome.trim() || cleanTicker,
      quantity: qtdNum,
      price: precoNum,
      dividendYield: 10,
    })

    setModalAberto(false)
    setTicker('')
    setNome('')
    setQuantidade('100')
    setPreco('')
    setErroForm('')
  }

  const formatarMoeda = (valor: number, casas: number = 2) => {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    })
  }

  const totalInvestido = assets.reduce(
    (acc, item) => acc + (item.quantity || 0) * (item.price || 0),
    0
  )

  const dadosGrafico = useMemo(() => {
    return BENCHMARK_DATA[periodo] || BENCHMARK_DATA['6M']
  }, [periodo])

  // Último valor acumulado do período
  const ultimoPonto = dadosGrafico[dadosGrafico.length - 1]

  return (
    <>
      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28 select-none">
        
        {/* HEADER ESTILO IOS (VOLTAR + STATUS B3 AO VIVO) */}
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-slate-300 active:scale-90 transition-all shadow-sm"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

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
              Rentabilidade & Benchmarks
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Hoje
            </h1>
          </div>
        </header>

        {/* GRÁFICO COMPARATIVO: CARTEIRA VS IFIX, CDI, IPCA E IBOVESPA */}
        <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 shadow-sm backdrop-blur-sm space-y-4">
          
          {/* Topo do Card de Rentabilidade */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                  Comparativo de Carteira
                </h2>
                <p className="text-[11px] text-slate-400">
                  Performance vs Principais Índices
                </p>
              </div>
            </div>

            {/* Seletor de Período */}
            <div className="flex items-center bg-slate-950/80 p-0.5 rounded-xl border border-slate-800 text-[11px] font-bold">
              {(['6M', '1A', 'YTD'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriodo(p)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    periodo === p
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Gráfico Recharts */}
          <div className="w-full h-56 pt-2">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={dadosGrafico}
                  margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#1e293b"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="mes"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip content={<CustomChartTooltip />} />

                  {/* Linha da Carteira (Destaque Verde) */}
                  {visibilidade.carteira && (
                    <Line
                      type="monotone"
                      dataKey="carteira"
                      name="Minha Carteira"
                      stroke={BENCHMARK_CONFIG.carteira.color}
                      strokeWidth={3}
                      dot={{ r: 3, fill: BENCHMARK_CONFIG.carteira.color }}
                      activeDot={{ r: 5, stroke: '#fff', strokeWidth: 1.5 }}
                    />
                  )}

                  {/* Linha do IFIX */}
                  {visibilidade.ifix && (
                    <Line
                      type="monotone"
                      dataKey="ifix"
                      name="IFIX"
                      stroke={BENCHMARK_CONFIG.ifix.color}
                      strokeWidth={2}
                      dot={false}
                    />
                  )}

                  {/* Linha do CDI */}
                  {visibilidade.cdi && (
                    <Line
                      type="monotone"
                      dataKey="cdi"
                      name="CDI"
                      stroke={BENCHMARK_CONFIG.cdi.color}
                      strokeWidth={2}
                      dot={false}
                    />
                  )}

                  {/* Linha do IPCA */}
                  {visibilidade.ipca && (
                    <Line
                      type="monotone"
                      dataKey="ipca"
                      name="IPCA"
                      stroke={BENCHMARK_CONFIG.ipca.color}
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  )}

                  {/* Linha do Ibovespa */}
                  {visibilidade.ibov && (
                    <Line
                      type="monotone"
                      dataKey="ibov"
                      name="Ibovespa"
                      stroke={BENCHMARK_CONFIG.ibov.color}
                      strokeWidth={2}
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                Carregando gráfico...
              </div>
            )}
          </div>

          {/* Legenda Interativa / Filtro dos Índices com Rentabilidade */}
          <div className="pt-2 border-t border-slate-800/60">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Rentabilidade acumulada no período (toque para filtrar):
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {/* Carteira */}
              <button
                type="button"
                onClick={() => toggleBenchmark('carteira')}
                className={`flex items-center justify-between p-2 rounded-xl border text-xs transition-all ${
                  visibilidade.carteira
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-sm'
                    : 'bg-slate-950/40 border-slate-800/60 text-slate-500 opacity-60'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="font-semibold truncate">Carteira</span>
                </div>
                <span className="font-bold shrink-0 ml-1">
                  +{ultimoPonto.carteira.toFixed(1)}%
                </span>
              </button>

              {/* IFIX */}
              <button
                type="button"
                onClick={() => toggleBenchmark('ifix')}
                className={`flex items-center justify-between p-2 rounded-xl border text-xs transition-all ${
                  visibilidade.ifix
                    ? 'bg-orange-500/10 border-orange-500/40 text-orange-400 shadow-sm'
                    : 'bg-slate-950/40 border-slate-800/60 text-slate-500 opacity-60'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                  <span className="font-semibold truncate">IFIX</span>
                </div>
                <span className="font-bold shrink-0 ml-1">
                  +{ultimoPonto.ifix.toFixed(1)}%
                </span>
              </button>

              {/* CDI / Selic */}
              <button
                type="button"
                onClick={() => toggleBenchmark('cdi')}
                className={`flex items-center justify-between p-2 rounded-xl border text-xs transition-all ${
                  visibilidade.cdi
                    ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400 shadow-sm'
                    : 'bg-slate-950/40 border-slate-800/60 text-slate-500 opacity-60'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                  <span className="font-semibold truncate">CDI</span>
                </div>
                <span className="font-bold shrink-0 ml-1">
                  +{ultimoPonto.cdi.toFixed(1)}%
                </span>
              </button>

              {/* IPCA */}
              <button
                type="button"
                onClick={() => toggleBenchmark('ipca')}
                className={`flex items-center justify-between p-2 rounded-xl border text-xs transition-all ${
                  visibilidade.ipca
                    ? 'bg-yellow-500/10 border-yellow-500/40 text-yellow-400 shadow-sm'
                    : 'bg-slate-950/40 border-slate-800/60 text-slate-500 opacity-60'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
                  <span className="font-semibold truncate">IPCA</span>
                </div>
                <span className="font-bold shrink-0 ml-1">
                  +{ultimoPonto.ipca.toFixed(1)}%
                </span>
              </button>

              {/* Ibovespa */}
              <button
                type="button"
                onClick={() => toggleBenchmark('ibov')}
                className={`flex items-center justify-between p-2 rounded-xl border text-xs transition-all ${
                  visibilidade.ibov
                    ? 'bg-blue-500/10 border-blue-500/40 text-blue-400 shadow-sm'
                    : 'bg-slate-950/40 border-slate-800/60 text-slate-500 opacity-60'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                  <span className="font-semibold truncate">Ibovespa</span>
                </div>
                <span className="font-bold shrink-0 ml-1">
                  +{ultimoPonto.ibov.toFixed(1)}%
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* CABEÇALHO DA LISTA DE ATIVOS + BOTÃO ADICIONAR */}
        <div className="flex items-center justify-between px-1 pt-1">
          <div>
            <h2 className="text-sm font-bold text-white">Meus Ativos</h2>
            <p className="text-[11px] text-slate-400">
              {assets.length} ativo(s) cadastrado(s) • Total:{' '}
              <span className="text-emerald-400 font-semibold">
                {formatarMoeda(totalInvestido, 2)}
              </span>
            </p>
          </div>

        </div>

        {/* LISTA DE ATIVOS FORMATADA NO ESTILO DA CARTEIRA E DA IMAGEM */}
        <section className="space-y-3">
          {!isLoaded ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/40">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span className="text-xs font-medium tracking-wide">Carregando fundos...</span>
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-2xl border border-slate-800/80 bg-slate-900/40">
              <Coins className="h-8 w-8 text-slate-600 mb-2" />
              <p className="text-xs font-medium text-slate-300">Nenhum fundo cadastrado</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Toque no botão Adicionar acima para registrar seus ativos.
              </p>
            </div>
          ) : (
            assets.map((asset) => {
              const badgeStyle = getAssetBadgeStyle(asset.ticker)
              const valorTotalItem = (asset.quantity || 0) * (asset.price || 0)
              const isSelected = ativoSelecionado === asset.ticker

              return (
                <div
                  key={asset.ticker}
                  className="rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-sm p-4 shadow-sm hover:border-slate-700/80 transition-all space-y-3"
                >
                  {/* Linha Superior: Logo Circular + Ticker/Nome + Badges C e Executada + Seta */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Logo circular estilizado */}
                      <div
                        className={`w-11 h-11 rounded-full flex items-center justify-center shadow-md shrink-0 overflow-hidden border border-white/10 ${badgeStyle.bg}`}
                      >
                        <span className={badgeStyle.text}>
                          {badgeStyle.label}
                        </span>
                      </div>

                      {/* Ticker & Nome */}
                      <div className="min-w-0">
                        <span className="font-bold text-white font-mono text-base leading-tight block truncate">
                          {asset.ticker}
                        </span>
                        <span className="text-xs text-slate-400 truncate block mt-0.5">
                          {asset.name || asset.ticker} • B3
                        </span>
                      </div>
                    </div>

                    {/* Badges do Lado Direito */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Badge circular azul C */}
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold shadow-sm">
                        C
                      </div>

                      {/* Badge verde pill Executada */}
                      <div className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-medium tracking-tight">
                        Executada
                      </div>

                      {/* Seta > de Ações */}
                      <button
                        type="button"
                        onClick={() =>
                          setAtivoSelecionado(isSelected ? null : asset.ticker)
                        }
                        className="p-1 text-slate-400 hover:text-white active:scale-90 transition-transform"
                        aria-label="Opções do ativo"
                      >
                        <ChevronRight
                          className={`w-4 h-4 transition-transform duration-200 ${
                            isSelected ? 'rotate-90 text-emerald-400' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Painel expansível rápido de ações ao tocar na seta */}
                  {isSelected && (
                    <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between gap-2 animate-in fade-in duration-150">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(asset.ticker, Math.max(0, asset.quantity - 10))}
                          className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-semibold text-slate-300 active:scale-95 transition-transform"
                        >
                          -10
                        </button>
                        <button
                          type="button"
                          onClick={() => updateQuantity(asset.ticker, asset.quantity + 10)}
                          className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-semibold text-slate-300 active:scale-95 transition-transform"
                        >
                          +10
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          removeAsset(asset.ticker)
                          setAtivoSelecionado(null)
                        }}
                        className="flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg text-xs font-semibold hover:bg-rose-500/20 active:scale-95 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Excluir</span>
                      </button>
                    </div>
                  )}

                  {/* Linha Inferior: 3 Colunas com os dados (Quantidade, Preço Médio, Valor Total) */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/60 text-left">
                    <div>
                      <span className="block text-[11px] text-slate-400 mb-0.5">
                        Quantidade
                      </span>
                      <span className="text-xs font-semibold text-slate-200">
                        {asset.quantity}
                      </span>
                    </div>

                    <div>
                      <span className="block text-[11px] text-slate-400 mb-0.5">
                        Preço médio
                      </span>
                      <span className="text-xs font-semibold text-slate-200 whitespace-nowrap">
                        {formatarMoeda(asset.price || 0, 2)}
                      </span>
                    </div>

                    <div>
                      <span className="block text-[11px] text-slate-400 mb-0.5">
                        Valor total
                      </span>
                      <span className="text-xs font-bold text-emerald-400 whitespace-nowrap">
                        {formatarMoeda(valorTotalItem, 2)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </section>

        {/* MODAL BOTTOM SHEET MOBILE */}
        {modalAberto && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
            <div
              className="absolute inset-0"
              onClick={() => setModalAberto(false)}
            />

            <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-[28px] sm:rounded-2xl p-6 shadow-2xl z-10 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 space-y-4">
              <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto sm:hidden mb-2" />

              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white">Adicionar Ativo</h3>
                    <p className="text-[11px] text-slate-400">Cadastre cotas na carteira</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800/60 active:scale-90 transition-transform"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {erroForm && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-400">
                  {erroForm}
                </div>
              )}

              <form onSubmit={handleAdicionarAtivo} className="space-y-4">
                {/* Autocomplete de Ticker */}
                <div className="relative">
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Código do Ativo (Ticker)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ex: BBAS3, CPFE3, MXRF11"
                      required
                      value={ticker}
                      onChange={(e) => setTicker(e.target.value.toUpperCase())}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white uppercase focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => buscarCotacaoAtivo(ticker)}
                      disabled={buscandoCotacao || !ticker}
                      className="px-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 disabled:opacity-50 transition-colors"
                    >
                      {buscandoCotacao ? (
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                      <span>Buscar</span>
                    </button>
                  </div>

                  {mostrarSugestoes && sugestoes.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-44 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-1.5 shadow-2xl">
                      {sugestoes.map((sug) => (
                        <button
                          key={sug.ticker}
                          type="button"
                          onClick={() => handleSelecionarSugestao(sug)}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-800/80 transition-colors"
                        >
                          <div>
                            <span className="font-bold text-emerald-400 text-sm">
                              {sug.ticker}
                            </span>
                            <span className="ml-2 text-xs text-slate-300">
                              {sug.name}
                            </span>
                          </div>
                          <span className="text-[10px] rounded bg-slate-800 px-1.5 py-0.5 text-slate-400 border border-slate-700">
                            {sug.type}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Nome da Empresa / Fundo
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Banco do Brasil"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Quantidade
                    </label>
                    <input
                      type="number"
                      placeholder="100"
                      required
                      min="1"
                      value={quantidade}
                      onChange={(e) => setQuantidade(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Preço Médio (R$)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="17,06"
                      required
                      value={preco}
                      onChange={(e) => setPreco(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Resumo Total */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                  <span className="text-xs text-slate-400">Total estimado:</span>
                  <span className="text-sm font-bold text-emerald-400">
                    {formatarMoeda(
                      (Number(quantidade) || 0) * (Number(preco.replace(',', '.')) || 0),
                      2
                    )}
                  </span>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all"
                  >
                    Salvar na Carteira
                  </button>
                </div>
              </form>
            </div>
          </div>
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