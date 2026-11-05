'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { safeSessionGet } from '@/lib/safe-storage'

/** Marca gravada pela BottomNav quando há navegação dentro do app nesta aba. */
export const INTERNAL_NAV_KEY = '@simplefinan:internal-nav'

export function BackButton({ fallbackHref, label = 'Voltar' }: { fallbackHref: string; label?: string }) {
  const router = useRouter()

  // history.length conta páginas de outros sites: voltar poderia tirar a pessoa do app.
  const goBack = () => {
    if (safeSessionGet(INTERNAL_NAV_KEY)) router.back()
    else router.push(fallbackHref)
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={label}
      className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white"
    >
      <ArrowLeft className="size-5" aria-hidden="true" />
    </button>
  )
}
