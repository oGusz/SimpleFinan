'use client'

import type { ComponentProps } from 'react'
import { fieldControlClass } from '@/components/ui/field'
import { cn } from '@/lib/utils'

const amount = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Até 9.999.999.999,99: acima disso, a conversão para number começaria a perder centavos.
const MAX_DIGITS = 12

export interface MoneyInputProps
  extends Omit<ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange' | 'type' | 'inputMode'> {
  value: number | null
  onValueChange: (value: number | null) => void
}

/** Máscara de centavos: digitar 1, 2 e 3 mostra 1,23. Com name, um campo oculto envia '1.23'. */
export function MoneyInput({ value, onValueChange, name, placeholder = '0,00', className, ...props }: MoneyInputProps) {
  const handleChange = (text: string) => {
    // Passou do limite, ignora a tecla: cortar pelo início trocaria o valor sem a pessoa notar.
    const digits = text.replace(/\D/g, '').replace(/^0+/, '')
    if (digits.length > MAX_DIGITS) return
    const cents = Number(digits)
    // Zero volta a vazio: senão, apagar tudo deixaria '0,00' preso no campo.
    onValueChange(cents === 0 ? null : cents / 100)
  }

  return (
    <div className="relative w-full">
      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-400">
        R$
      </span>
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={value == null ? '' : amount.format(value)}
        onChange={(event) => handleChange(event.target.value)}
        className={cn(fieldControlClass, 'pl-10 tabular-nums', className)}
      />
      {name && <input type="hidden" name={name} value={value == null ? '' : String(value)} />}
    </div>
  )
}
