'use client'

import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Aparência padrão dos campos de formulário. */
export const fieldControlClass =
  'h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white placeholder:text-slate-400 aria-invalid:border-rose-500 disabled:opacity-60'

export interface FieldRenderProps {
  id: string
  describedBy: string | undefined
  invalid: boolean
}

export interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  className?: string
  children: (props: FieldRenderProps) => ReactNode
}

/** Liga rótulo, dica e erro ao campo: passe id e aria-describedby={describedBy} para o controle. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-slate-300">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && (
        <p id={hintId} className="text-xs text-slate-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}
