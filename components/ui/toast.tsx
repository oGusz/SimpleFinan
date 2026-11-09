'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastOptions {
  message: string
  kind: ToastKind
  action?: { label: string; onClick: () => void }
  /** Em milissegundos. */
  duration?: number
}

type ToastItem = ToastOptions & { id: number }

const ToastContext = createContext<{ toast: (options: ToastOptions) => void } | null>(null)

const MAX_VISIBLE = 3

const KIND_ICON = {
  success: { icon: CircleCheck, className: 'text-emerald-400' },
  error: { icon: CircleAlert, className: 'text-rose-400' },
  info: { icon: Info, className: 'text-sky-400' },
}

// Quem oferece ação, como Desfazer, precisa de mais tempo para ler e decidir.
function defaultDuration({ action, kind }: ToastOptions) {
  if (action) return 8000
  return kind === 'error' ? 7000 : 4000
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const { icon: Icon, className } = KIND_ICON[item.kind]
  return (
    <div className="pointer-events-auto mb-2 flex min-h-11 w-full max-w-md items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-1 pr-1 pl-3 text-sm text-slate-100 shadow-xl shadow-black/40">
      <Icon className={cn('size-4 shrink-0', className)} aria-hidden="true" />
      <p className="min-w-0 flex-1 py-2">{item.message}</p>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick()
            onDismiss(item.id)
          }}
          className="h-11 shrink-0 cursor-pointer rounded-lg px-3 font-semibold text-emerald-400 hover:bg-slate-700"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Fechar aviso"
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const [mounted, setMounted] = useState(false)
  const nextId = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    setMounted(true)
    const activeTimers = timers.current
    return () => activeTimers.forEach((timer) => clearTimeout(timer))
  }, [])

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++
      setItems((current) => [...current, { ...options, id }].slice(-MAX_VISIBLE))
      timers.current.set(id, setTimeout(() => dismiss(id), options.duration ?? defaultDuration(options)))
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          // As duas regiões já existem antes do aviso: leitores de tela só anunciam mudanças em região viva.
          <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[80] flex flex-col items-center px-4">
            <div role="alert" className="flex w-full flex-col items-center">
              {items
                .filter((item) => item.kind === 'error')
                .map((item) => (
                  <ToastCard key={item.id} item={item} onDismiss={dismiss} />
                ))}
            </div>
            <div role="status" className="flex w-full flex-col items-center">
              {items
                .filter((item) => item.kind !== 'error')
                .map((item) => (
                  <ToastCard key={item.id} item={item} onDismiss={dismiss} />
                ))}
            </div>
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast precisa estar dentro de ToastProvider')
  return context
}
