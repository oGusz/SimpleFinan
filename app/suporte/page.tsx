import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { BackButton } from '@/components/back-button'
import { LEGAL, legalValue } from '@/lib/legal'
import { MAX_CONNECTED_BANKS, TRIAL_DAYS } from '@/lib/plans'

export const metadata: Metadata = {
  title: 'Suporte — SimpleFinan',
  description: 'Fale com o suporte do SimpleFinan e veja como conectar um banco, cancelar a assinatura, recuperar a senha e excluir a conta.',
}

const H2 = 'pt-2 text-base font-semibold text-white'
const INLINE_LINK = 'text-emerald-400 underline underline-offset-2'
const FOOTER_LINK = 'inline-flex min-h-11 items-center text-emerald-400 underline underline-offset-2'

export default function SuportePage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+2.5rem)] text-sm leading-relaxed text-slate-300">
      <header className="flex items-center gap-2">
        <BackButton fallbackHref="/" />
        <Image src="/icon.svg" alt="" width={28} height={28} />
        <span className="font-semibold text-white">SimpleFinan</span>
      </header>

      <h1 className="text-2xl font-bold text-white">Suporte</h1>
      <p>
        Escreva para{' '}
        {LEGAL.supportEmail ? (
          <a href={`mailto:${LEGAL.supportEmail}`} className={`${INLINE_LINK} break-words`}>
            {LEGAL.supportEmail}
          </a>
        ) : (
          legalValue('supportEmail')
        )}
        . Informe o e-mail da sua conta e descreva o que aconteceu. Nunca envie senhas nem dados completos de cartão.
      </p>

      <h2 className={H2}>Como conecto um banco?</h2>
      <p>
        A conexão faz parte do plano Premium, por assinatura ou durante o teste grátis de {TRIAL_DAYS} dias. Em Perfil, abra
        Conectar bancos, escolha a instituição e autorize no ambiente da Pluggy e do seu banco. Não pedimos a sua senha do
        banco. Cada conta pode conectar até {MAX_CONNECTED_BANKS} bancos.
      </p>

      <h2 className={H2}>Como cancelo a assinatura?</h2>
      <p>
        O cancelamento é feito na loja em que você assinou, com pelo menos 24 h de antecedência da renovação: no iPhone, em{' '}
        <a href="https://apps.apple.com/account/subscriptions" target="_blank" rel="noopener noreferrer" className={INLINE_LINK}>
          assinaturas da App Store
        </a>
        ; no Android, em{' '}
        <a href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noopener noreferrer" className={INLINE_LINK}>
          assinaturas do Google Play
        </a>
        . Excluir a conta não cancela a assinatura. O teste grátis não precisa de cancelamento, porque não gera cobrança.
      </p>

      <h2 className={H2}>Esqueci minha senha. E agora?</h2>
      <p>
        Na{' '}
        <Link href="/login" className={INLINE_LINK}>
          tela de entrada
        </Link>
        , toque em Esqueci minha senha e informe seu e-mail. Enviaremos um link para criar uma nova senha. Se você entra com
        Google ou outro serviço, use esse mesmo botão de entrada, pois a senha é gerenciada por ele.
      </p>

      <h2 className={H2}>Como excluo minha conta?</h2>
      <p>
        No app, vá a Perfil → Excluir minha conta. Veja{' '}
        <Link href="/excluir-conta" className={INLINE_LINK}>
          o passo a passo, o que é apagado e como pedir por e-mail
        </Link>
        , inclusive sem o app instalado.
      </p>

      <nav aria-label="Informações" className="flex flex-wrap gap-x-5 border-t border-slate-800 pt-3">
        <Link href="/termos" className={FOOTER_LINK}>Termos de Uso</Link>
        <Link href="/privacidade" className={FOOTER_LINK}>Privacidade</Link>
      </nav>
    </main>
  )
}
