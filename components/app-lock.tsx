'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { unstable_rethrow, usePathname } from 'next/navigation'
import { LockKeyhole, ScanFace } from 'lucide-react'
import { logout } from '@/app/actions/auth'
import { unregisterPushToken } from '@/lib/push-registration'
import { isLockEnabled, verifyLock } from '@/lib/app-lock'
import { isNativeApp } from '@/lib/native-bridge'

const RELOCK_AFTER_MS = 60_000
const PUBLIC_ROUTES = ['/login', '/auth', '/privacidade', '/termos', '/redefinir-senha', '/sobre', '/suporte', '/excluir-conta']

type LockStatus = 'checking' | 'locked' | 'open'

export function AppLock() {
  const pathname = usePathname()
  // O servidor não sabe se o bloqueio está ligado. A cobertura sai igual nos dois lados, o que
  // evita divergência de hidratação e impede que os valores apareçam antes da decisão.
  const [status, setStatus] = useState<LockStatus>('checking')
  const [problem, setProblem] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const hiddenAt = useRef<number | null>(null)
  const unlocking = useRef(false)

  const isPublic = PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))

  // Decide uma vez, na primeira rota protegida: trocar de página não pede a biometria de novo.
  // Bloqueado em rota pública volta a decidir, pois o login pode ter desligado o bloqueio.
  useLayoutEffect(() => {
    if (isPublic) {
      setStatus((current) => (current === 'locked' ? 'checking' : current))
      return
    }
    setStatus((current) => (current === 'checking' ? (isLockEnabled() ? 'locked' : 'open') : current))
  }, [isPublic])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now()
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > RELOCK_AFTER_MS && isLockEnabled()) {
        setProblem(null)
        setStatus('locked')
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const unlock = useCallback(async () => {
    if (unlocking.current) return
    unlocking.current = true
    setProblem(null)
    const result = await verifyLock()
    unlocking.current = false
    if (result === 'ok') {
      hiddenAt.current = null
      setStatus('open')
    } else if (result === 'unavailable') {
      setProblem('A biometria não está disponível neste aparelho. Saia da conta para entrar de novo.')
    } else {
      setProblem('Não foi possível confirmar. Tente novamente.')
    }
  }, [])

  // No navegador, o iOS só libera a biometria a partir de um toque, por isso o botão.
  // No app quem pede é o aparelho, então o pedido já abre sozinho.
  useEffect(() => {
    if (status === 'locked' && !isPublic && isNativeApp()) void unlock()
  }, [status, isPublic, unlock])

  const leaveAccount = async () => {
    setLeaving(true)
    setProblem(null)
    try {
      await unregisterPushToken()
      // A tela de login desliga o bloqueio ao abrir.
      await logout()
    } catch (error) {
      unstable_rethrow(error)
      setLeaving(false)
      setProblem('Não foi possível sair. Verifique a conexão e tente de novo.')
    }
  }

  if (isPublic || status === 'open') return null

  if (status === 'checking') {
    return <div aria-hidden="true" className="fixed inset-0 z-[100] bg-background" />
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <LockKeyhole className="h-8 w-8 text-emerald-400" aria-hidden="true" />
      <h1 className="text-lg font-bold text-white">SimpleFinan bloqueado</h1>
      {problem && <p role="alert" className="text-sm text-rose-400">{problem}</p>}
      <button
        type="button"
        onClick={unlock}
        disabled={leaving}
        className="flex h-12 w-full max-w-xs cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-700 text-sm font-semibold text-white disabled:opacity-50"
      >
        <ScanFace className="h-4 w-4" aria-hidden="true" /> Desbloquear
      </button>
      <button
        type="button"
        onClick={leaveAccount}
        disabled={leaving}
        className="min-h-11 cursor-pointer px-4 text-sm text-slate-400 underline disabled:opacity-50"
      >
        {leaving ? 'Saindo...' : 'Sair da conta'}
      </button>
    </div>
  )
}
