'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Dialog } from '@base-ui/react/dialog'
import { Loader2, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Acima da barra inferior (z-50) e abaixo do bloqueio do app (z-[100]).
const BACKDROP_CLASS =
  'fixed inset-0 z-[70] min-h-dvh bg-black/70 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute'
const VIEWPORT_CLASS = 'fixed inset-0 z-[70] flex justify-center'
const POPUP_CLASS =
  // O Tailwind 4 anima por translate e scale, propriedades próprias que transform não cobre.
  'relative max-h-[85dvh] w-full max-w-md overflow-y-auto overscroll-contain border border-slate-800 bg-slate-900 text-slate-100 shadow-2xl outline-none transition-[opacity,translate,scale] duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0'
const CENTER_POPUP_CLASS = 'rounded-2xl data-ending-style:scale-95 data-starting-style:scale-95'
const FOOTER_CLASS =
  'sticky bottom-0 z-10 flex gap-2 border-t border-slate-800 bg-slate-900 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]'

// O botão Voltar do Android fecha só o modal de cima.
const nativeBackStack: { current: () => void }[] = []

function handleNativeBack(event: Event) {
  const top = nativeBackStack[nativeBackStack.length - 1]
  if (!top) return
  event.preventDefault()
  top.current()
}

function useNativeBackClose(open: boolean, close: () => void) {
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })
  useEffect(() => {
    if (!open) return
    if (nativeBackStack.length === 0) window.addEventListener('simplefinan:back', handleNativeBack)
    nativeBackStack.push(closeRef)
    return () => {
      nativeBackStack.splice(nativeBackStack.indexOf(closeRef), 1)
      if (nativeBackStack.length === 0) window.removeEventListener('simplefinan:back', handleNativeBack)
    }
  }, [open])
}

/**
 * No iOS o teclado não encolhe o layout, e dvh continua contando a área atrás dele.
 * Só o visualViewport informa o espaço que sobrou para manter o botão de salvar à vista.
 */
function useVisibleArea(open: boolean) {
  const [area, setArea] = useState<{ top: number; height: number } | null>(null)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!open || !viewport) return
    const update = () => {
      const keyboardOpen = viewport.scale <= 1.01 && window.innerHeight - viewport.height > 80
      setArea(keyboardOpen ? { top: viewport.offsetTop, height: viewport.height } : null)
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      setArea(null)
    }
  }, [open])

  return area
}

export interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  variant?: 'center' | 'sheet'
  /** Fica sempre visível. Botão de envio aqui fora do form precisa de form='id-do-form'. */
  footer?: ReactNode
  closeLabel?: string
  /** Chamado ao fim da animação de saída. */
  onClosed?: () => void
  children?: ReactNode
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  variant = 'center',
  footer,
  closeLabel = 'Fechar',
  onClosed,
  children,
}: ModalProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const area = useVisibleArea(open)
  useNativeBackClose(open, () => onOpenChange(false))

  const isSheet = variant === 'sheet'

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClosed?.()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={BACKDROP_CLASS} />
        <Dialog.Viewport
          className={cn(VIEWPORT_CLASS, isSheet ? 'items-end sm:items-center sm:p-4' : 'items-center p-4')}
          style={area ? { top: area.top, height: area.height, bottom: 'auto' } : undefined}
          // Em React, eventos atravessam o portal: um clique aqui, mesmo fora do painel, ativaria a linha que abriu o modal.
          onClick={(event) => event.stopPropagation()}
        >
          <Dialog.Popup
            ref={popupRef}
            // No toque, o padrão foca o painel para não abrir o teclado sem a pessoa pedir.
            initialFocus={(openType) =>
              openType === 'touch' ? true : (popupRef.current?.querySelector<HTMLElement>('input, select, textarea') ?? true)
            }
            style={area ? { maxHeight: `min(85dvh, ${area.height - 16}px)` } : undefined}
            className={cn(
              POPUP_CLASS,
              isSheet
                ? 'rounded-t-2xl border-b-0 data-ending-style:translate-y-full data-starting-style:translate-y-full sm:rounded-2xl sm:border-b'
                : CENTER_POPUP_CLASS,
            )}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 bg-slate-900 py-3 pr-2 pl-5">
              <div className="min-w-0 py-2">
                <Dialog.Title className="text-base font-semibold text-white">{title}</Dialog.Title>
                {description && (
                  <Dialog.Description className="mt-1 text-sm text-slate-400">{description}</Dialog.Description>
                )}
              </div>
              <Dialog.Close
                aria-label={closeLabel}
                className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="size-5" aria-hidden="true" />
              </Dialog.Close>
            </div>
            <div className={cn('px-5', footer ? 'pb-4' : 'pb-[max(1.25rem,env(safe-area-inset-bottom))]')}>
              {children}
            </div>
            {footer && <div className={FOOTER_CLASS}>{footer}</div>}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  error?: string | null
  /** Não fecha sozinho: quem chama fecha ao concluir, ou passa error se falhar. */
  onConfirm: () => void
  /** Segunda opção, menos drástica que a confirmação, como 'Só este mês'. */
  secondaryAction?: { label: string; onClick: () => void; busy?: boolean }
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  destructive = false,
  loading = false,
  error,
  onConfirm,
  secondaryAction,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  const requestChange = (next: boolean) => {
    // Fechar no meio da operação esconderia o resultado dela.
    if (loading && !next) return
    onOpenChange(next)
  }
  useNativeBackClose(open, () => requestChange(false))

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => requestChange(next)}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={BACKDROP_CLASS} />
        <AlertDialog.Viewport
          className={cn(VIEWPORT_CLASS, 'items-center p-4')}
          onClick={(event) => event.stopPropagation()}
        >
          <AlertDialog.Popup
            initialFocus={cancelRef}
            className={cn(POPUP_CLASS, CENTER_POPUP_CLASS, 'p-5')}
          >
            <AlertDialog.Title className="text-base font-semibold text-white">{title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-slate-400">{description}</AlertDialog.Description>
            {error && (
              <p role="alert" className="mt-3 text-sm text-rose-400">
                {error}
              </p>
            )}
            <div className={cn('mt-5 flex gap-2', secondaryAction && 'flex-col-reverse')}>
              <AlertDialog.Close
                ref={cancelRef}
                disabled={loading}
                className={cn(buttonVariants({ variant: secondaryAction ? 'ghost' : 'secondary' }), !secondaryAction && 'flex-1')}
              >
                {cancelLabel}
              </AlertDialog.Close>
              <Button
                onClick={onConfirm}
                disabled={loading}
                aria-busy={loading && !secondaryAction?.busy}
                className={cn(!secondaryAction && 'flex-1', destructive && 'bg-rose-700 text-white hover:bg-rose-600')}
              >
                {loading && !secondaryAction?.busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                {confirmLabel}
              </Button>
              {secondaryAction && (
                <Button
                  variant="secondary"
                  onClick={secondaryAction.onClick}
                  disabled={loading}
                  aria-busy={Boolean(secondaryAction.busy)}
                >
                  {secondaryAction.busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                  {secondaryAction.label}
                </Button>
              )}
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
