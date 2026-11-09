'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import { CircleAlert } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'

export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-[70dvh] w-full max-w-md flex-col items-center justify-center gap-3 px-6 pt-[env(safe-area-inset-top)] pb-28 text-center">
      <CircleAlert className="size-10 text-rose-400" aria-hidden="true" />
      <h1 className="text-lg font-semibold text-white">Algo deu errado nesta tela</h1>
      <p className="text-sm text-slate-400">Seus dados estão seguros. Tente abrir a tela novamente.</p>
      <div className="mt-2 flex w-full flex-col gap-2">
        <Button onClick={() => retry()}>Tentar novamente</Button>
        <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
          Ir para o início
        </Link>
      </div>
    </main>
  )
}
