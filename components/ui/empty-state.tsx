import Link from 'next/link'
import type { ComponentType, ReactNode } from 'react'
import { buttonVariants } from '@/components/ui/button'

export interface EmptyStateProps {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  title: ReactNode
  description?: ReactNode
  actionLabel?: string
  onAction?: () => void
  href?: string
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, href }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-800 px-6 py-8 text-center">
      <Icon className="size-8 text-slate-400" aria-hidden="true" />
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      {description && <p className="max-w-xs text-sm text-slate-400">{description}</p>}
      {actionLabel && href && (
        <Link href={href} className={buttonVariants({ className: 'mt-2' })}>
          {actionLabel}
        </Link>
      )}
      {actionLabel && !href && onAction && (
        <button type="button" onClick={onAction} className={buttonVariants({ className: 'mt-2' })}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}
