import type { Metadata } from 'next'
import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Página não encontrada | SimpleFinan',
}

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70dvh] w-full max-w-md flex-col items-center justify-center gap-3 px-6 pt-[env(safe-area-inset-top)] pb-28 text-center">
      <SearchX className="size-10 text-slate-400" aria-hidden="true" />
      <h1 className="text-lg font-semibold text-white">Página não encontrada</h1>
      <p className="text-sm text-slate-400">O endereço pode ter mudado ou o link estar incompleto.</p>
      <Link href="/" className={buttonVariants({ className: 'mt-2 w-full' })}>
        Ir para o início
      </Link>
    </main>
  )
}
