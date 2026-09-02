'use client'

import { motion } from 'framer-motion'
import { EditBillModal } from '@/components/bills/EditBillModal'
import { toggleBillStatus } from '@/app/actions/finance'

interface UpcomingPaymentsProps {
  bills: any[]
  onStatusChange?: () => void
}

export function UpcomingPayments({ bills, onStatusChange }: UpcomingPaymentsProps) {
  const handleToggle = async (id: string, isCurrentlyPaid: boolean) => {
    try {
      await toggleBillStatus(id, !isCurrentlyPaid)
      if (onStatusChange) onStatusChange()
    } catch (error) {
      console.error('Erro ao alterar status:', error)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {bills.map((bill) => {
        const isPaid = bill.status === 'paid'

        return (
          <motion.div
            key={bill.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={`group flex items-center justify-between rounded-lg border p-3.5 transition-all duration-200 ${
              isPaid
                ? 'border-border/40 bg-secondary/20 opacity-50'
                : 'border-border bg-card hover:border-primary/40 shadow-sm'
            }`}
          >
            {/* Clicar no corpo tem micro-feedback de pressão (active:scale-[0.99]) */}
            <button
              type="button"
              onClick={() => handleToggle(bill.id, isPaid)}
              className="flex flex-1 items-center justify-between text-left cursor-pointer pr-4 active:scale-[0.99] transition-transform duration-100"
              title={isPaid ? 'Clique para marcar como pendente' : 'Clique para marcar como pago'}
            >
              <div>
                <p
                  className={`text-sm font-medium transition-all duration-200 ${
                    isPaid ? 'line-through text-muted-foreground' : 'text-foreground'
                  }`}
                >
                  {bill.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  Vence dia {new Date(bill.due_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                </p>
              </div>

              <span
                className={`font-mono text-sm font-medium transition-all duration-200 ${
                  isPaid ? 'line-through text-muted-foreground' : 'text-foreground'
                }`}
              >
                R$ {Number(bill.amount).toFixed(2)}
              </span>
            </button>

            {/* Isolado da ação de alterar status */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-center border-l border-border/40 pl-3"
            >
              <EditBillModal bill={bill} onSuccess={onStatusChange} />
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}