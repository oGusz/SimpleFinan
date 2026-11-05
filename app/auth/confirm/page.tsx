'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { confirmEmailToken } from '@/app/actions/auth'

type SearchParams = Record<string, string | string[] | undefined>

const single = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '')

// Espaços e controles também ficam de fora: o navegador os remove da URL, e "/\t/site.com" viraria outro domínio.
const safeNext = (value: string) => (/^\/(?![/\\])[^\s\\]*$/.test(value) ? value : '/redefinir-senha')

export default function ConfirmarLinkPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = use(searchParams)
  const tokenHash = single(params.token_hash)
  const type = single(params.type)
  const next = safeNext(single(params.next))
  const isValidLink = Boolean(tokenHash) && (type === 'recovery' || type === 'email')

  const router = useRouter()
  const [phase, setPhase] = useState<'idle' | 'verifying' | 'confirmed' | 'expired'>(isValidLink ? 'idle' : 'expired')
  const [message, setMessage] = useState<string | null>(null)

  const handleContinue = async () => {
    setPhase('verifying')
    setMessage(null)
    try {
      const result = await confirmEmailToken(tokenHash, type)
      if ('error' in result && result.error) {
        setMessage(result.error)
        setPhase(result.retryable ? 'idle' : 'expired')
      } else if (type === 'recovery') {
        // A fase continua em "verifying" até a tela de nova senha abrir.
        router.replace(next)
      } else {
        setPhase('confirmed')
      }
    } catch (error) {
      console.error('[Auth] Falha ao validar o link:', error)
      setMessage(
        error instanceof TypeError || navigator.onLine === false
          ? 'Sem conexão. Verifique sua internet e tente de novo.'
          : 'Não foi possível concluir agora. Tente novamente em instantes.',
      )
      setPhase('idle')
    }
  }

  return (
    <main className="min-h-dvh flex flex-col justify-center items-center px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)] bg-background text-foreground">
      <div className="w-full max-w-sm flex flex-col gap-5 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.svg" alt="" className="mx-auto h-12 w-12" />
        <p className="text-sm font-semibold text-slate-300">SimpleFinan</p>

        {(phase === 'idle' || phase === 'verifying') && (
          <>
            <h1 className="text-xl font-bold text-white">
              {type === 'recovery' ? 'Criar uma nova senha' : 'Confirmar seu e-mail'}
            </h1>
            <p className="text-sm text-slate-400">Toque em Continuar para validar este link.</p>
            {message && (
              <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-left text-sm text-rose-400">
                <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                <p>{message}</p>
              </div>
            )}
            <button
              type="button"
              onClick={handleContinue}
              disabled={phase === 'verifying'}
              aria-busy={phase === 'verifying'}
              className="flex h-12 items-center justify-center rounded-xl bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {phase === 'verifying' ? (
                <>
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  <span className="sr-only">Validando o link</span>
                </>
              ) : (
                'Continuar'
              )}
            </button>
          </>
        )}

        {phase === 'confirmed' && (
          <div role="status" className="flex flex-col items-center gap-3">
            <CheckCircle2 aria-hidden="true" className="h-8 w-8 text-emerald-400" />
            <h1 className="text-xl font-bold text-white">E-mail confirmado</h1>
            <p className="text-sm text-slate-300">E-mail confirmado. Volte ao app e entre.</p>
          </div>
        )}

        {phase === 'expired' && (
          <div role="alert" className="flex flex-col items-center gap-3">
            <AlertCircle aria-hidden="true" className="h-8 w-8 text-rose-400" />
            <h1 className="text-xl font-bold text-white">Link inválido</h1>
            <p className="text-sm text-slate-300">{message ?? 'Este link expirou. Peça outro na tela de entrada.'}</p>
            <Link
              href="/login"
              className="flex min-h-11 items-center px-3 text-sm font-medium text-emerald-400 underline"
            >
              Ir para a tela de entrada
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
