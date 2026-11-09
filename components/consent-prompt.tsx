'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isRouteWithoutNav } from '@/components/bottom-nav'
import { Button } from '@/components/ui/button'
import { isAnalyticsAvailable, setAnalyticsEnabled, syncAnalyticsConsent } from '@/lib/analytics'
import { createClient } from '@/lib/supabase/client'

export function ConsentPrompt() {
  const pathname = usePathname()
  const titleId = useId()
  const [visible, setVisible] = useState(false)

  // Sem escolha, nada é medido; o pedido não bloqueia a tela, e também por isso fica sob os modais.
  useEffect(() => {
    if (isRouteWithoutNav(pathname)) {
      setVisible(false)
      return
    }
    let cancelled = false
    const check = async () => {
      const client = createClient()
      const {
        data: { session },
      } = await client.auth.getSession()
      if (cancelled || !session) return
      if (!syncAnalyticsConsent(session.user.user_metadata?.analytics_consent)) {
        setVisible(false)
        return
      }
      // A sessão guardada pode ser anterior a uma escolha feita em outro aparelho: confere na conta antes de perguntar.
      const {
        data: { user },
      } = await client.auth.getUser()
      if (cancelled || !user) return
      setVisible(syncAnalyticsConsent(user.user_metadata?.analytics_consent) && isAnalyticsAvailable())
    }
    check().catch(() => {
      // Sem sessão legível não há a quem perguntar; a próxima tela tenta de novo.
    })
    return () => {
      cancelled = true
    }
  }, [pathname])

  if (!visible) return null

  const choose = (enabled: boolean) => {
    setAnalyticsEnabled(enabled)
    setVisible(false)
  }

  return (
    <section
      aria-labelledby={titleId}
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-40 flex justify-center px-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl shadow-black/60">
        <h2 id={titleId} className="text-sm font-semibold text-white">
          Permitir métricas de uso?
        </h2>
        <p className="mt-1 text-sm text-slate-300">
          Elas mostram como o app é usado, inclusive com gravações de tela em que textos e valores ficam ocultos. Você
          pode mudar isso depois em Perfil.{' '}
          <Link href="/privacidade" className="text-emerald-400 underline underline-offset-2">
            Política de privacidade
          </Link>
        </p>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => choose(true)}>
            Permitir
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => choose(false)}>
            Agora não
          </Button>
        </div>
      </div>
    </section>
  )
}
