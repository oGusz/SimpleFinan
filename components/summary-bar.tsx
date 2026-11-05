import { formatBRL } from '@/lib/format'

interface SummaryBill {
  amount: number | string
  status: string
  paid_amount?: number | null
}

interface SummaryBarProps {
  bills: SummaryBill[]
  /** Null quando o valor não está disponível: aparece como '—', nunca como zero. */
  patrimonio: number | null
  footnote?: string
}

// Fatura com crédito tem valor negativo, e não é dinheiro pago nem a pagar.
const amountOf = (bill: SummaryBill) => Math.max(0, Number(bill.amount) || 0)

function summarize(bills: SummaryBill[]) {
  let toPay = 0
  let paid = 0
  let unconfirmed = 0

  for (const bill of bills) {
    const amount = amountOf(bill)
    if (bill.status === 'paid') {
      paid += amount
    } else if (bill.status === 'partial') {
      const paidPart = Math.min(amount, Math.max(0, Number(bill.paid_amount) || 0))
      paid += paidPart
      toPay += amount - paidPart
    } else if (bill.status === 'unconfirmed') {
      // Sem confirmação do banco, somar em 'Pago' ou em 'A pagar' afirmaria algo que não se sabe.
      unconfirmed += amount
    } else {
      toPay += amount
    }
  }

  return { toPay, paid, unconfirmed }
}

export function SummaryBar({ bills, patrimonio, footnote }: SummaryBarProps) {
  const { toPay, paid, unconfirmed } = summarize(bills)

  const items = [
    { label: 'A pagar', value: toPay, className: 'text-amber-400' },
    { label: 'Pago', value: paid, className: 'text-emerald-400' },
    { label: 'Patrimônio', value: patrimonio, className: 'text-slate-100' },
  ]

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-3 gap-3">
        {items.map(({ label, value, className }) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-slate-400">{label}</dt>
            {/* Valor grande quebra de linha: dinheiro cortado no meio seria lido errado. */}
            <dd className={`mt-0.5 text-sm font-semibold tabular-nums [overflow-wrap:anywhere] ${className}`}>
              {formatBRL(value)}
            </dd>
          </div>
        ))}
      </dl>

      {unconfirmed > 0 && (
        <p className="text-xs text-amber-300">Vencido sem pagamento confirmado: {formatBRL(unconfirmed)}</p>
      )}
      {footnote && <p className="text-xs text-slate-400">{footnote}</p>}
    </div>
  )
}
