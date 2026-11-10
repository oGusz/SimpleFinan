'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { BellRing, Crown, Trash2 } from 'lucide-react'

import { createPriceAlert, deletePriceAlert, listPriceAlerts, setAnnouncementAlerts } from '@/app/actions/alerts'
import { getReminderAvailability } from '@/app/actions/preferences'
import { BackButton } from '@/components/back-button'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { MoneyInput } from '@/components/ui/money-input'
import { useToast } from '@/components/ui/toast'
import { useAppMode } from '@/context/AppModeContext'
import { usePortfolio } from '@/context/PortfolioContext'
import { MAX_ACTIVE_ALERTS, type PriceAlert } from '@/lib/alerts'
import { formatBRL, formatDate } from '@/lib/format'
import { isNativeApp } from '@/lib/native-bridge'
import { createClient } from '@/lib/supabase/client'
import { isExchangeTicker } from '@/lib/tickers'
import { cn } from '@/lib/utils'
import { refreshGamification } from '@/components/gamification-data'

const SELECT_CLASS = 'h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white'

function describe(alert: Pick<PriceAlert, 'direction' | 'target'>) {
  return `${alert.direction === 'above' ? 'Acima de' : 'Abaixo de'} ${formatBRL(alert.target)}`
}

export default function AlertasPage() {
  const { isPremium, loading: planLoading } = useAppMode()
  const { assets } = usePortfolio()
  const { toast } = useToast()

  const { data, error, mutate } = useSWR(isPremium ? 'price-alerts' : null, () => listPriceAlerts())
  const { data: channels } = useSWR('reminder-availability', () => getReminderAvailability(), { revalidateOnFocus: false })

  const tickers = useMemo(
    () => [...new Set(assets.map((asset) => asset.ticker.toUpperCase()).filter(isExchangeTicker))].sort(),
    [assets],
  )
  const prices = useMemo(() => new Map(assets.map((asset) => [asset.ticker.toUpperCase(), asset.quoteMissing ? null : asset.price])), [assets])

  const [ticker, setTicker] = useState('')
  const [direction, setDirection] = useState<'above' | 'below'>('above')
  const [target, setTarget] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [announcements, setAnnouncements] = useState<boolean | null>(null)
  const [native, setNative] = useState(false)

  useEffect(() => {
    setNative(isNativeApp())
    createClient()
      .auth.getSession()
      .then(({ data: session }) => setAnnouncements(session.session?.user.user_metadata?.alert_announcements !== false))
  }, [])

  useEffect(() => {
    if (!ticker && tickers.length > 0) setTicker(tickers[0])
  }, [ticker, tickers])

  const active = (data?.alerts ?? []).filter((alert) => !alert.triggered_at)
  const triggered = (data?.alerts ?? []).filter((alert) => alert.triggered_at).slice(0, 10)
  const currentPrice = prices.get(ticker) ?? null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    if (!ticker) return setFormError('Escolha um ativo.')
    if (!target) return setFormError('Informe o valor do alerta.')
    setSaving(true)
    setFormError(null)
    const result = await createPriceAlert({ ticker, direction, target }).catch(() => null)
    setSaving(false)
    if (!result?.success) {
      setFormError(result && !result.success ? result.error : 'Não foi possível criar o alerta. Tente de novo.')
      return
    }
    setTarget(null)
    toast({ message: `Alerta de ${ticker} criado.`, kind: 'success' })
    refreshGamification()
    void mutate()
  }

  const remove = async (alert: PriceAlert) => {
    const result = await deletePriceAlert(alert.id).catch(() => null)
    if (!result?.success) {
      toast({ message: 'Não foi possível excluir o alerta.', kind: 'error' })
      return
    }
    toast({ message: `Alerta de ${alert.ticker} excluído.`, kind: 'info' })
    void mutate()
  }

  const toggleAnnouncements = async () => {
    const next = !announcements
    setAnnouncements(next)
    const result = await setAnnouncementAlerts(next).catch(() => null)
    if (!result?.success) {
      setAnnouncements(!next)
      toast({ message: 'Não foi possível salvar a preferência.', kind: 'error' })
    }
  }

  const deliveryText = !channels
    ? null
    : native && channels.pushEnabled
      ? 'Os avisos chegam como notificação neste aparelho e, sem o app, por e-mail.'
      : channels.emailEnabled
        ? 'Os avisos chegam por e-mail. No app do celular, chegam como notificação.'
        : 'O envio de avisos ainda não está ativo. Os alertas ficam salvos e passam a ser enviados quando estiver.'

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28">
      <header className="flex items-start gap-2">
        <BackButton fallbackHref="/carteira" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-400">Avisos sobre seus investimentos</p>
          <h1 className="text-2xl font-bold tracking-tight text-white">Alertas</h1>
        </div>
      </header>

      {planLoading ? (
        <div aria-busy="true" className="h-40 animate-pulse rounded-2xl border border-slate-800/80 bg-slate-900/60" />
      ) : !isPremium ? (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4">
          <div className="flex items-center gap-2">
            <Crown className="size-5 text-emerald-300" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Alertas fazem parte do Premium</h2>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
            <li>Aviso quando um ativo passar do preço que você escolher</li>
            <li>Aviso quando uma empresa da sua carteira publicar fato relevante, comunicado ou aviso de proventos</li>
          </ul>
          <Link href="/planos" className={buttonVariants({ className: 'mt-3 w-full' })}>
            Conhecer o Premium
          </Link>
        </section>
      ) : (
        <>
          {deliveryText && <p className="text-xs text-slate-400">{deliveryText}</p>}

          <section className="flex items-start justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
            <div>
              <h2 id="comunicados-label" className="text-sm font-semibold text-white">Comunicados das suas empresas</h2>
              <p className="text-xs text-slate-400">Fatos relevantes, comunicados e avisos de proventos, no dia em que saírem.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={announcements ?? false}
              aria-labelledby="comunicados-label"
              disabled={announcements === null}
              onClick={toggleAnnouncements}
              className={cn(
                'relative mt-1 h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-50',
                announcements ? 'bg-emerald-500' : 'bg-slate-700',
              )}
            >
              <span className={cn('absolute top-1 left-0 size-5 rounded-full bg-white transition-transform', announcements ? 'translate-x-6' : 'translate-x-1')} />
            </button>
          </section>

          <section aria-labelledby="preco-titulo" className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
            <div>
              <h2 id="preco-titulo" className="text-sm font-semibold text-white">Alerta de preço</h2>
              <p className="text-xs text-slate-400">Conferido uma vez por dia, pelo preço de fechamento. Dispara uma vez e se desliga.</p>
            </div>

            {data?.status === 'unavailable' ? (
              <p className="text-sm text-slate-300">Os alertas de preço ainda não estão disponíveis. Tente mais tarde.</p>
            ) : tickers.length === 0 ? (
              <EmptyState icon={BellRing} title="Nenhum ativo da bolsa na carteira" description="Adicione ações ou FIIs para criar alertas de preço." href="/carteira" actionLabel="Ir para a carteira" />
            ) : (
              <form onSubmit={submit} noValidate className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Ativo">
                    {({ id }) => (
                      <select id={id} value={ticker} onChange={(event) => setTicker(event.target.value)} className={SELECT_CLASS}>
                        {tickers.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Field label="Quando ficar">
                    {({ id }) => (
                      <select id={id} value={direction} onChange={(event) => setDirection(event.target.value as 'above' | 'below')} className={SELECT_CLASS}>
                        <option value="above">Acima de</option>
                        <option value="below">Abaixo de</option>
                      </select>
                    )}
                  </Field>
                </div>
                <Field label="Valor" hint={currentPrice ? `Cotação atual: ${formatBRL(currentPrice)}` : undefined} error={formError ?? undefined}>
                  {({ id, describedBy }) => <MoneyInput id={id} aria-describedby={describedBy} value={target} onValueChange={setTarget} />}
                </Field>
                <Button type="submit" disabled={saving || active.length >= MAX_ACTIVE_ALERTS} className="w-full">
                  {saving ? 'Criando...' : 'Criar alerta'}
                </Button>
                {active.length >= MAX_ACTIVE_ALERTS && (
                  <p className="text-xs text-slate-400">Limite de {MAX_ACTIVE_ALERTS} alertas ativos. Exclua um para criar outro.</p>
                )}
              </form>
            )}
          </section>

          {error && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <p className="text-sm text-amber-200">Não foi possível carregar seus alertas.</p>
              <button type="button" onClick={() => mutate()} className="min-h-11 cursor-pointer text-sm font-semibold text-amber-100 underline underline-offset-2">
                Tentar de novo
              </button>
            </div>
          )}

          {active.length > 0 && (
            <section aria-labelledby="ativos-titulo" className="space-y-2">
              <h2 id="ativos-titulo" className="text-sm font-semibold text-white">Ativos ({active.length})</h2>
              <ul className="divide-y divide-slate-800 rounded-2xl border border-slate-800/80 bg-slate-900/40 px-4">
                {active.map((alert) => {
                  const price = prices.get(alert.ticker)
                  return (
                    <li key={alert.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{alert.ticker}</p>
                        <p className="text-xs text-slate-400">
                          {describe(alert)}
                          {price ? ` · agora ${formatBRL(price)}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(alert)}
                        aria-label={`Excluir alerta de ${alert.ticker} ${describe(alert).toLowerCase()}`}
                        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {triggered.length > 0 && (
            <section aria-labelledby="disparados-titulo" className="space-y-2">
              <h2 id="disparados-titulo" className="text-sm font-semibold text-white">Disparados</h2>
              <ul className="divide-y divide-slate-800 rounded-2xl border border-slate-800/80 bg-slate-900/40 px-4">
                {triggered.map((alert) => (
                  <li key={alert.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-200">{alert.ticker}</p>
                      <p className="text-xs text-slate-400">
                        {describe(alert)} · {formatBRL(alert.triggered_price)} em {formatDate(alert.triggered_at?.slice(0, 10))}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(alert)}
                      aria-label={`Apagar do histórico o alerta de ${alert.ticker}`}
                      className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs text-slate-400">Avisos informativos. Não são recomendação de compra ou venda.</p>
        </>
      )}
    </main>
  )
}
