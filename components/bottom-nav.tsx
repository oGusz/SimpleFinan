'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Wallet, Zap, Plus, LayoutGrid, User } from 'lucide-react'
import { useAppMode } from '@/context/AppModeContext'

interface BottomNavProps {
  onQuickAction?: () => void
}

export function BottomNav({ onQuickAction }: BottomNavProps) {
  const pathname = usePathname()
  const { isOpenFinance } = useAppMode()

  // O botão central vai para /open-finance no modo Pro, /fundos no modo Manual
  const centerHref = isOpenFinance ? '/open-finance' : '/fundos'
  const centerLabel = isOpenFinance ? 'Open Finance' : 'Ver fundos e ativos'
  const isCenterActive = pathname === centerHref

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pointer-events-none">
      <nav className="pointer-events-auto flex items-center justify-between w-full max-w-md h-16 px-4 bg-slate-900/90 backdrop-blur-xl border border-slate-800/90 rounded-3xl shadow-2xl shadow-black/60">

        {/* Item 1: Início */}
        <Link
          href="/"
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-all active:scale-90 ${
            pathname === '/' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Home className="h-5 w-5" strokeWidth={pathname === '/' ? 2.4 : 1.8} />
          {pathname === '/' && <span className="w-1 h-1 mt-1 rounded-full bg-white" />}
        </Link>

        {/* Item 2: Carteira */}
        <Link
          href="/carteira"
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-all active:scale-90 ${
            pathname === '/carteira' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wallet className="h-5 w-5" strokeWidth={pathname === '/carteira' ? 2.4 : 1.8} />
          {pathname === '/carteira' && <span className="w-1 h-1 mt-1 rounded-full bg-white" />}
        </Link>

        {/* BOTÃO CENTRAL — muda conforme o modo */}
        <Link
          href={centerHref}
          aria-label={centerLabel}
          className={`relative -top-2 flex items-center justify-center w-12 h-12 rounded-2xl text-white shadow-lg border-2 border-slate-900 active:scale-90 transition-all ${
            isOpenFinance
              ? 'bg-emerald-600 shadow-emerald-600/40 hover:bg-emerald-500'
              : 'bg-blue-600 shadow-blue-600/40 hover:bg-blue-500'
          }`}
        >
          {isOpenFinance ? (
            <Zap className="h-6 w-6 stroke-[2.5]" />
          ) : (
            <Plus className="h-6 w-6 stroke-[2.5]" />
          )}

          {/* Ponto indicador quando está na página ativa */}
          {isCenterActive && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white" />
          )}
        </Link>

        {/* Item 3: Metas */}
        <Link
          href="/metas"
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-all active:scale-90 ${
            pathname === '/metas' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutGrid className="h-5 w-5" strokeWidth={pathname === '/metas' ? 2.4 : 1.8} />
          {pathname === '/metas' && <span className="w-1 h-1 mt-1 rounded-full bg-white" />}
        </Link>

        {/* Item 4: Perfil */}
        <Link
          href="/perfil"
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-all active:scale-90 ${
            pathname === '/perfil' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <User className="h-5 w-5" strokeWidth={pathname === '/perfil' ? 2.4 : 1.8} />
          {pathname === '/perfil' && <span className="w-1 h-1 mt-1 rounded-full bg-white" />}
        </Link>

      </nav>
    </div>
  )
}