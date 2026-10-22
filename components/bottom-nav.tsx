'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Wallet, Plus, LayoutGrid, User } from 'lucide-react'

interface BottomNavProps {
  onQuickAction?: () => void
}

export function BottomNav({ onQuickAction }: BottomNavProps) {
  const pathname = usePathname()

  const navItems = [
    { label: 'Início', href: '/', icon: Home },
    { label: 'Carteira', href: '/carteira', icon: Wallet },
    // O botão central de ação entra aqui
    { label: 'Metas', href: '/metas', icon: LayoutGrid },
    { label: 'Perfil', href: '/perfil', icon: User },
  ]

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

        {/* BOTÃO CENTRAL AZUL DESTACADO (Estilo da imagem) */}
        <button
          type="button"
          onClick={onQuickAction}
          aria-label="Ação rápida"
          className="relative -top-2 flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/40 border-2 border-slate-900 active:scale-90 transition-all hover:bg-blue-500"
        >
          <Plus className="h-6 w-6 stroke-[2.5]" />
        </button>

        {/* Item 3: Metas / Painel */}
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