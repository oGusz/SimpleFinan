'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, CalendarCheck, Check, CircleHelp, Clock } from 'lucide-react'
import { toggleBillStatus, type Bill } from '@/app/actions/finance'
import { EditBillModal } from '@/components/bills/EditBillModal'
import { useQuickAdd } from '@/components/quick-add-provider'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import { addDays, isOverdueCapable, isSettledBill, todayInBrazil } from '@/lib/finance-insights'
import { formatBRL, formatDate, plural } from '@/lib/format'
import { refreshGamification } from '@/components/gamification-data'

const TOGGLE_ERROR = 'Não foi possível atualizar. Tente de novo.'
const SKELETON_ROWS = [0, 1, 2]

interface UpcomingPaymentsProps {
  bills: Bill[]
  onStatusChange?: () => void
  /** Chamado antes de salvar, para o resumo mudar junto com a lista. */
  onOptimisticStatus?: (billId: string, paid: boolean) => void
  loading?: boolean
  limit?: number
  title?: string
  headerSlot?: ReactNode
}

const billName = (bill: Bill) => bill.title || 'Conta'
const dueDateOf = (bill: Bill) => (bill.due_date ? bill.due_date.slice(0, 10) : '')

function getDueBadge(bill: Bill, today: string) {
  if (isSettledBill(bill.status) || bill.status === 'unconfirmed') return null
  const dueDate = dueDateOf(bill)
  if (!dueDate) return null

  if (dueDate < today) {
    if (!isOverdueCapable(bill)) return null
    return { label: 'Atrasado', className: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: AlertCircle }
  }
  if (dueDate === today) {
    return { label: 'Vence hoje', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: Clock }
  }
  if (dueDate === addDays(today, 1)) {
    return { label: 'Vence amanhã', className: 'bg-sky-500/10 text-sky-400 border-sky-500/20', icon: Clock }
  }
  return null
}

function headerBadge(bills: Bill[]) {
  if (bills.length === 0) return null
  const unconfirmed = bills.filter((bill) => bill.status === 'unconfirmed').length
  const open = bills.filter((bill) => !isSettledBill(bill.status)).length - unconfirmed
  if (open === 0 && unconfirmed === 0) return 'Tudo pago'
  const parts = []
  if (open > 0) parts.push(plural(open, 'pendente', 'pendentes'))
  if (unconfirmed > 0) parts.push(`${unconfirmed} a confirmar`)
  return parts.join(' · ')
}

function StatusLine({ bill }: { bill: Bill }) {
  if (bill.status === 'unconfirmed') {
    return (
      <span className="block text-xs text-amber-300">Venceu, pagamento não confirmado. Confira no banco</span>
    )
  }
  if (bill.status === 'partial' && bill.paid_amount != null) {
    return <span className="block text-xs text-amber-300">Pago parcialmente: {formatBRL(bill.paid_amount)}</span>
  }
  return null
}

/** Fatura vem do banco: o status só é mostrado, nunca alternado aqui. */
function ReadOnlyMark({ bill }: { bill: Bill }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center" aria-hidden="true">
      {isSettledBill(bill.status) ? (
        <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500 text-slate-950">
          <Check className="size-3.5 stroke-[3]" />
        </span>
      ) : bill.status === 'unconfirmed' ? (
        <CircleHelp className="size-6 text-amber-300" />
      ) : (
        <span className="size-6 rounded-full border-2 border-slate-700" />
      )}
    </span>
  )
}

export function UpcomingPayments({
  bills,
  onStatusChange,
  onOptimisticStatus,
  loading = false,
  limit,
  title = 'Contas do mês',
  headerSlot,
}: UpcomingPaymentsProps) {
  const { toast } = useToast()
  const { open: openQuickAdd } = useQuickAdd()

  const [overrides, setOverrides] = useState<Record<string, Bill['status']>>({})
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState<{ bill: Bill; open: boolean; key: number } | null>(null)
  const inFlight = useRef(new Set<string>())

  // O status otimista só sai quando a lista confirma: antes disso, a linha voltaria ao valor antigo.
  useEffect(() => {
    setOverrides((current) => {
      const next: Record<string, Bill['status']> = {}
      let changed = false
      for (const [id, status] of Object.entries(current)) {
        const bill = bills.find((item) => item.id === id)
        if (bill && bill.status !== status) next[id] = status
        else changed = true
      }
      return changed ? next : current
    })
  }, [bills])

  const displayed = useMemo(() => {
    const withOverrides = bills.map((bill) => (overrides[bill.id] ? { ...bill, status: overrides[bill.id] } : bill))
    return withOverrides.sort((a, b) => {
      const settledOrder = Number(isSettledBill(a.status)) - Number(isSettledBill(b.status))
      return settledOrder || dueDateOf(a).localeCompare(dueDateOf(b))
    })
  }, [bills, overrides])

  const clearOverride = (id: string) => {
    setOverrides((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  const setPaid = async (bill: Bill, paid: boolean) => {
    if (inFlight.current.has(bill.id)) return
    inFlight.current.add(bill.id)
    setOverrides((current) => ({ ...current, [bill.id]: paid ? 'paid' : 'pending' }))
    onOptimisticStatus?.(bill.id, paid)

    let saved = false
    try {
      saved = (await toggleBillStatus(bill.id, paid)).success
    } catch {
      saved = false
    }
    inFlight.current.delete(bill.id)

    if (!saved) {
      clearOverride(bill.id)
      toast({ message: TOGGLE_ERROR, kind: 'error' })
      // O resumo já mudou de forma otimista: volta na hora, mesmo que a nova leitura também falhe.
      onOptimisticStatus?.(bill.id, !paid)
      onStatusChange?.()
      return
    }

    toast(
      paid
        ? {
            message: 'Marcada como paga',
            kind: 'success',
            action: { label: 'Desfazer', onClick: () => void setPaid(bill, false) },
          }
        : { message: 'Marcada como pendente', kind: 'info' },
    )
    if (paid) refreshGamification()
    onStatusChange?.()
  }

  const openEdit = (bill: Bill) => {
    // A chave nova recria o formulário com os dados atuais da conta.
    setEditing((current) => ({ bill, open: true, key: (current?.key ?? 0) + 1 }))
  }

  const badge = loading ? null : headerBadge(displayed)
  const visible = limit && !expanded ? displayed.slice(0, limit) : displayed
  const hasMore = Boolean(limit) && displayed.length > (limit as number)
  const today = todayInBrazil()

  return (
    <>
      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarCheck className="size-4 shrink-0 text-emerald-400" aria-hidden="true" />
            <h3 className="truncate text-sm font-bold tracking-tight text-white">{title}</h3>
          </div>
          {badge && (
            <span className="shrink-0 rounded-full border border-slate-800 bg-slate-900 px-2.5 py-0.5 text-xs font-medium text-slate-300">
              {badge}
            </span>
          )}
        </div>

        {headerSlot}

        {loading ? (
          <div role="status" aria-label="Carregando contas" className="flex flex-col gap-2">
            {SKELETON_ROWS.map((row) => (
              <div key={row} className="flex h-14 animate-pulse items-center gap-3">
                <div className="ml-2.5 size-6 shrink-0 rounded-full bg-slate-800" />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="h-3 w-2/5 rounded bg-slate-800" />
                  <div className="h-3 w-1/4 rounded bg-slate-800/70" />
                </div>
                <div className="h-3 w-16 rounded bg-slate-800" />
              </div>
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="Nenhuma conta neste mês"
            description="Cadastre suas contas para acompanhar os vencimentos."
            actionLabel="Cadastrar conta"
            onAction={() => openQuickAdd('bill')}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-slate-800/70">
            <AnimatePresence initial={false}>
              {visible.map((bill) => {
                const isPaid = isSettledBill(bill.status)
                const dueBadge = getDueBadge(bill, today)
                const name = billName(bill)

                const details = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className={`min-w-0 truncate text-sm font-semibold ${
                            isPaid ? 'text-slate-400 line-through' : 'text-white'
                          }`}
                        >
                          {name}
                        </span>
                        {dueBadge && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${dueBadge.className}`}
                          >
                            <dueBadge.icon className="size-3" aria-hidden="true" />
                            {dueBadge.label}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {bill.read_only ? 'Fatura do banco · ' : ''}Vencimento: {formatDate(dueDateOf(bill))}
                        {isPaid && <span className="sr-only"> Paga.</span>}
                      </span>
                      <StatusLine bill={bill} />
                    </span>
                    <span
                      className={`shrink-0 text-sm font-bold tabular-nums ${
                        isPaid ? 'text-slate-400 line-through' : 'text-slate-200'
                      }`}
                    >
                      {formatBRL(Number(bill.amount) || 0)}
                    </span>
                  </>
                )

                return (
                  <motion.li
                    key={bill.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-1 py-1.5"
                  >
                    {bill.read_only ? (
                      <>
                        <ReadOnlyMark bill={bill} />
                        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 pr-1">{details}</div>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void setPaid(bill, !isPaid)}
                          aria-label={isPaid ? `Marcar ${name} como pendente` : `Marcar ${name} como paga`}
                          className="group flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full"
                        >
                          <span
                            className={`flex size-6 items-center justify-center rounded-full transition-colors group-active:scale-90 ${
                              isPaid
                                ? 'bg-emerald-500 text-slate-950'
                                : 'border-2 border-slate-600 group-hover:border-emerald-500'
                            }`}
                          >
                            {isPaid && <Check className="size-3.5 stroke-[3]" aria-hidden="true" />}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(bill)}
                          className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg pr-1 text-left transition-colors hover:bg-slate-800/40"
                        >
                          <span className="sr-only">Editar </span>
                          {details}
                        </button>
                      </>
                    )}
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}

        {!loading && hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="h-11 cursor-pointer rounded-lg text-sm font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/10"
          >
            {expanded ? 'Ver menos' : `Ver todas (${displayed.length})`}
          </button>
        )}
      </div>

      {editing && (
        <EditBillModal
          key={editing.key}
          bill={editing.bill}
          open={editing.open}
          onOpenChange={(next) => setEditing((current) => (current ? { ...current, open: next } : current))}
          onSuccess={onStatusChange}
        />
      )}
    </>
  )
}
