'use client'

import { useEffect, useRef, type ComponentType } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Plus, Target, User, Wallet, Zap } from 'lucide-react'
import { INTERNAL_NAV_KEY } from '@/components/back-button'
import { useQuickAdd } from '@/components/quick-add-provider'
import { useAppMode } from '@/context/AppModeContext'
import { safeSessionSet } from '@/lib/safe-storage'
import { cn } from '@/lib/utils'

export const ROUTES_WITHOUT_NAV = [
  '/login',
  '/auth',
  '/privacidade',
  '/termos',
  '/redefinir-senha',
  '/sobre',
  '/suporte',
  '/excluir-conta',
]

export const isRouteWithoutNav = (pathname: string) => ROUTES_WITHOUT_NAV.some((route) => pathname.startsWith(route))

// Subtelas acendem o item de onde se chega a elas.
const LEFT_ITEMS = [
  { href: '/', label: 'Início', icon: Home, also: ['/analises', '/noticias'] },
  { href: '/carteira', label: 'Carteira', icon: Wallet, also: ['/fundos', '/proventos'] },
]
const RIGHT_ITEMS = [
  { href: '/metas', label: 'Metas', icon: Target, also: [] },
  { href: '/perfil', label: 'Perfil', icon: User, also: ['/planos'] },
]
const BANKS_ROUTES = ['/open-finance', '/extrato']

const matches = (pathname: string, route: string) =>
  route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(`${route}/`)

const ITEM_CLASS =
  'flex h-14 min-w-12 flex-1 cursor-pointer flex-col items-center justify-end gap-0.5 rounded-2xl pb-1 text-[11px] leading-[14px] transition-transform active:scale-95'

function NavItem({ href, label, icon: Icon, active }: {
  href: string
  label: string
  icon: ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: 'true' }>
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(ITEM_CLASS, active ? 'font-semibold text-emerald-400' : 'text-slate-400 hover:text-slate-200')}
    >
      <Icon className="size-5" strokeWidth={active ? 2.4 : 1.8} aria-hidden="true" />
      {label}
    </Link>
  )
}

export function BottomNav() {
  const pathname = usePathname()
  const { isOpenFinance, loading } = useAppMode()
  const { openSheet } = useQuickAdd()

  // Fica antes do retorno abaixo porque as rotas sem barra também contam como navegação.
  const firstPath = useRef(pathname)
  useEffect(() => {
    if (pathname !== firstPath.current) safeSessionSet(INTERNAL_NAV_KEY, '1')
  }, [pathname])

  if (isRouteWithoutNav(pathname)) return null

  const banksActive = BANKS_ROUTES.some((route) => matches(pathname, route))

  const renderItems = (items: typeof LEFT_ITEMS) =>
    items.map(({ href, label, icon, also }) => (
      <NavItem
        key={href}
        href={href}
        label={label}
        icon={icon}
        active={[href, ...also].some((route) => matches(pathname, route))}
      />
    ))

  return (
    <div className="pointer-events-none fixed right-0 bottom-0 left-0 z-50 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <nav
        aria-label="Navegação principal"
        className="pointer-events-auto flex h-16 w-full max-w-md items-center justify-between gap-0.5 rounded-3xl border border-slate-800/90 bg-slate-900/90 px-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl"
      >
        {renderItems(LEFT_ITEMS)}

        {/* O plano ainda carregando decide o item central: evita mostrar Adicionar e trocar por Bancos. */}
        {loading ? (
          <span aria-hidden="true" className={cn(ITEM_CLASS, 'cursor-default active:scale-100')} />
        ) : isOpenFinance ? (
          <Link
            href="/open-finance"
            aria-current={banksActive ? 'page' : undefined}
            className={cn(ITEM_CLASS, 'font-semibold', banksActive ? 'text-emerald-400' : 'text-slate-200')}
          >
            <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-500 text-slate-950">
              <Zap className="size-5" strokeWidth={2.4} aria-hidden="true" />
            </span>
            Bancos
          </Link>
        ) : (
          <button type="button" onClick={openSheet} className={cn(ITEM_CLASS, 'font-semibold text-slate-200')}>
            <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-500 text-slate-950">
              <Plus className="size-5" strokeWidth={2.4} aria-hidden="true" />
            </span>
            Adicionar
          </button>
        )}

        {renderItems(RIGHT_ITEMS)}
      </nav>
    </div>
  )
}
