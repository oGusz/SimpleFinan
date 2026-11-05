import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Calculator, CalendarClock, Landmark, Lock, Target, Wallet } from 'lucide-react'
import { InvestmentDisclaimer } from '@/components/investment-disclaimer'
import { buttonVariants } from '@/components/ui/button'
import { MAX_CONNECTED_BANKS, TRIAL_DAYS } from '@/lib/plans'

const TITLE = 'Sobre o SimpleFinan'
const DESCRIPTION = 'Organize contas, vencimentos, metas e investimentos em um só lugar, com seus bancos conectados se quiser.'

// O openGraph da página substitui o do layout por inteiro, por isso a imagem é repetida.
export const metadata: Metadata = {
  title: `${TITLE} — SimpleFinan`,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/sobre',
    siteName: 'SimpleFinan',
    locale: 'pt_BR',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'SimpleFinan' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og-image.png'],
  },
}

const FEATURES = [
  { icon: CalendarClock, title: 'Contas e vencimentos', text: 'Cadastre contas únicas e recorrentes, veja o que vence e receba lembretes.' },
  { icon: Target, title: 'Metas', text: 'Defina objetivos e acompanhe quanto já guardou para cada um.' },
  { icon: Wallet, title: 'Carteira de investimentos', text: 'Registre seus ativos e acompanhe o patrimônio com cotações da bolsa.' },
  { icon: Calculator, title: 'Calculadora de aporte e projeções', text: 'Faça contas com os dados e as metas que você informar.' },
  { icon: Landmark, title: 'Bancos conectados (Premium)', text: `Conecte até ${MAX_CONNECTED_BANKS} bancos via Open Finance para ver saldos, extrato, faturas de cartão e investimentos.` },
  { icon: Lock, title: 'Privacidade', text: 'Não pedimos a senha do seu banco, não movimentamos seu dinheiro e você pode excluir a conta quando quiser.' },
]

const FOOTER_LINK = 'inline-flex min-h-11 items-center text-emerald-400 underline underline-offset-2'

export default function SobrePage() {
  const appStoreUrl = process.env.NEXT_PUBLIC_APP_STORE_URL?.trim()
  const playStoreUrl = process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim()

  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+2.5rem)] text-sm leading-relaxed text-slate-300">
      <header className="flex items-center gap-2">
        <Image src="/icon.svg" alt="" width={28} height={28} />
        <span className="font-semibold text-white">SimpleFinan</span>
      </header>

      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-white">Suas contas, metas e investimentos em um só lugar</h1>
        <p className="text-base">
          O SimpleFinan ajuda você a saber o que vence, quanto já guardou e como está seu patrimônio, sem planilha.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href="/login" className={buttonVariants()}>
            Entrar ou criar conta
          </Link>
          {appStoreUrl && (
            <a href={appStoreUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'secondary' })}>
              Baixar na App Store
            </a>
          )}
          {playStoreUrl && (
            <a href={playStoreUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'secondary' })}>
              Baixar no Google Play
            </a>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">O que dá para fazer</h2>
        <ul className="space-y-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <Icon className="mt-0.5 size-5 shrink-0 text-emerald-400" aria-hidden="true" />
              <div>
                <h3 className="font-medium text-white">{title}</h3>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ul>
        <InvestmentDisclaimer />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Planos</h2>
        <p>
          <span className="font-medium text-white">Gratuito:</span> funciona com os dados que você insere.
        </p>
        <p>
          <span className="font-medium text-white">Premium:</span> assinatura que adiciona a conexão com bancos via Open
          Finance. O preço aparece antes da compra, e a assinatura é feita pelo app, na App Store ou no Google Play.
        </p>
        <p>
          Cada conta pode testar o Premium uma vez por {TRIAL_DAYS} dias no site, depois de entrar, sem cartão e sem cobrança.
        </p>
      </section>

      <nav aria-label="Informações" className="flex flex-wrap gap-x-5 border-t border-slate-800 pt-3">
        <Link href="/suporte" className={FOOTER_LINK}>Suporte</Link>
        <Link href="/termos" className={FOOTER_LINK}>Termos de Uso</Link>
        <Link href="/privacidade" className={FOOTER_LINK}>Privacidade</Link>
        <Link href="/excluir-conta" className={FOOTER_LINK}>Excluir conta</Link>
      </nav>
    </main>
  )
}
