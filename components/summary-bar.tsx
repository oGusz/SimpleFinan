interface SummaryBarProps {
  bills: any[]
}

export function SummaryBar({ bills }: SummaryBarProps) {
  const total = bills.reduce((acc, b) => acc + Number(b.amount), 0)
  const paid = bills.filter((b) => b.status === 'paid').reduce((acc, b) => acc + Number(b.amount), 0)
  const pending = bills.filter((b) => b.status === 'pending').reduce((acc, b) => acc + Number(b.amount), 0)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs text-slate-400">Total de Contas (Mês)</p>
        <p className="mt-1 text-xl font-semibold font-mono text-slate-100">
          R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs text-slate-400">Total Pago</p>
        <p className="mt-1 text-xl font-semibold font-mono text-emerald-400">
          R$ {paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs text-slate-400">Pendente de Pagamento</p>
        <p className="mt-1 text-xl font-semibold font-mono text-amber-400">
          R$ {pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </p>
      </div>
    </div>
  )
}