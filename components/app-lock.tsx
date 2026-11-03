'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { LockKeyhole, ScanFace } from 'lucide-react'
import { logout } from '@/app/actions/auth'
import { disableLock, isLockEnabled, verifyLock } from '@/lib/app-lock'

const RELOCK_AFTER_MS = 60_000
const PUBLIC_ROUTES = ['/login', '/auth', '/privacidade', '/termos']

export function AppLock() {
  const pathname = usePathname()
  const [locked, setLocked] = useState(false)
  const [failed, setFailed] = useState(false)
  const hiddenAt = useRef<number | null>(null)

  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route))

  useEffect(() => {
    if (!isPublic && isLockEnabled()) setLocked(true)
    // Só na abertura do app: trocar de página não deve pedir o Face ID de novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now()
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > RELOCK_AFTER_MS && isLockEnabled()) {
        setLocked(true)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // O iOS só libera o Face ID a partir de um toque, por isso o botão.
  const unlock = useCallback(async () => {
    setFailed(false)
    try {
      if (await verifyLock()) setLocked(false)
      else setFailed(true)
    } catch {
      setFailed(true)
    }
  }, [])

  const leaveAccount = () => {
    disableLock()
    logout()
  }

  if (!locked || isPublic) return null

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <LockKeyhole className="h-8 w-8 text-emerald-400" />
      <h1 className="text-lg font-bold text-white">SimpleFinan bloqueado</h1>
      {failed && <p className="text-xs text-rose-400">Não foi possível confirmar. Tente novamente.</p>}
      <button
        type="button"
        onClick={unlock}
        className="flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white"
      >
        <ScanFace className="h-4 w-4" /> Desbloquear
      </button>
      <button type="button" onClick={leaveAccount} className="text-xs text-slate-400 underline">
        Sair da conta
      </button>
    </div>
  )
}
