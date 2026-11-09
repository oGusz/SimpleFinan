import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { BackButton } from '@/components/back-button'
import { LEGAL, legalValue } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Excluir conta — SimpleFinan',
  description: 'Como excluir sua conta do SimpleFinan, pelo app ou por e-mail, o que é apagado e o que permanece nos fornecedores.',
}

const H2 = 'pt-2 text-base font-semibold text-white'
const INLINE_LINK = 'text-emerald-400 underline underline-offset-2'

export default function ExcluirContaPage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+2.5rem)] text-sm leading-relaxed text-slate-300">
      <header className="flex items-center gap-2">
        <BackButton fallbackHref="/" />
        <Image src="/icon.svg" alt="" width={28} height={28} />
        <span className="font-semibold text-white">SimpleFinan</span>
      </header>

      <h1 className="text-2xl font-bold text-white">Excluir conta</h1>
      <p>A exclusão é definitiva. Antes de continuar, você pode salvar uma cópia em Perfil → Baixar meus dados.</p>

      <h2 className={H2}>Pelo app ou pelo site</h2>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Entre na sua conta e abra Perfil.</li>
        <li>Toque em Excluir minha conta.</li>
        <li>Digite EXCLUIR para confirmar.</li>
        <li>Toque em Excluir definitivamente.</li>
      </ol>
      <p>
        A assinatura não é cancelada junto com a conta. Se você assinou, cancele antes na App Store ou no Google Play, ou a
        loja continuará cobrando. Veja como em{' '}
        <Link href="/suporte" className={INLINE_LINK}>
          Suporte
        </Link>
        .
      </p>

      <h2 className={H2}>Sem o app instalado ou sem acesso à conta</h2>
      <p>
        Escreva para{' '}
        {LEGAL.privacyEmail ? (
          <a href={`mailto:${LEGAL.privacyEmail}?subject=Excluir%20minha%20conta`} className={`${INLINE_LINK} break-words`}>
            {LEGAL.privacyEmail}
          </a>
        ) : (
          legalValue('privacyEmail')
        )}{' '}
        com o assunto “Excluir minha conta”, a partir do e-mail cadastrado. Podemos pedir uma confirmação para garantir que
        o pedido é seu.
      </p>

      <h2 className={H2}>O que é apagado</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Seu login, nome e foto de perfil.</li>
        <li>Contas, vencimentos, metas e investimentos.</li>
        <li>Bancos conectados, com o acesso revogado, e o que foi importado deles: contas, saldos, transações e faturas de cartão.</li>
        <li>Registro da assinatura no SimpleFinan, histórico de avisos enviados e tokens de notificação.</li>
      </ul>

      <h2 className={H2}>O que pode permanecer nos fornecedores</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          RevenueCat e PostHog: pedimos a exclusão dos seus dados quando a integração com eles está configurada. Se o pedido
          não for concluído, os dados podem continuar lá até serem removidos pelo canal acima.
        </li>
        <li>Apple e Google: histórico de compras, conforme as regras de cada loja.</li>
        <li>Sentry, Resend e cópias de segurança: registros de erro, de envio de e-mail e backups, até expirarem.</li>
        <li>Dados que a lei nos obrigue a guardar, pelo prazo que ela determinar.</li>
      </ul>
      <p>
        Prazo de remoção nos fornecedores: a definir, pendente de revisão. Mais detalhes na{' '}
        <Link href="/privacidade" className={INLINE_LINK}>
          Política de Privacidade
        </Link>
        .
      </p>
    </main>
  )
}
