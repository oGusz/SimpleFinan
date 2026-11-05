import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { BackButton } from '@/components/back-button'
import { LEGAL, legalValue } from '@/lib/legal'
import { TRIAL_DAYS } from '@/lib/plans'

export const metadata: Metadata = {
  title: 'Termos de Uso — SimpleFinan',
  description: 'Condições de uso do SimpleFinan: serviço, planos, dados de terceiros e sua conta.',
}

const H2 = 'pt-2 text-base font-semibold text-white'
const INLINE_LINK = 'text-emerald-400 underline underline-offset-2'

// RASCUNHO: revise com um advogado e preencha NEXT_PUBLIC_LEGAL_* antes de publicar.
export default function TermosPage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+2.5rem)] text-sm leading-relaxed text-slate-300">
      <header className="flex items-center gap-2">
        <BackButton fallbackHref="/" />
        <Image src="/icon.svg" alt="" width={28} height={28} />
        <span className="font-semibold text-white">SimpleFinan</span>
      </header>

      <h1 className="text-2xl font-bold text-white">Termos de Uso</h1>
      <p className="text-xs text-slate-400">Última atualização: {legalValue('effectiveDate')}</p>

      <h2 className={H2}>O serviço</h2>
      <p>
        O SimpleFinan, operado por {legalValue('companyName')}, {legalValue('documentId')}, é uma ferramenta de organização
        financeira pessoal. Não somos banco nem corretora e não movimentamos seu dinheiro.
      </p>

      <h2 className={H2}>Sem recomendação de investimento</h2>
      <p>
        Não fazemos análise, consultoria nem recomendação de investimentos. A calculadora de aporte, as simulações e as
        projeções fazem contas informativas com os dados e as metas informados por você. Rentabilidade passada e estimativas
        não garantem resultado futuro, e a decisão de investir é sempre sua.
      </p>

      <h2 className={H2}>Planos</h2>
      <p>
        O plano Gratuito funciona com dados inseridos por você. O plano Premium é uma assinatura que adiciona a conexão com
        instituições financeiras via Open Finance. Os preços são exibidos antes da compra.
      </p>
      <p>
        A cobrança, a renovação automática, o cancelamento e os reembolsos são feitos pela loja em que a assinatura foi
        contratada (App Store ou Google Play). Ao término da assinatura, sua conta volta ao plano Gratuito: paramos de
        atualizar os dados dos bancos, e a conexão e o que já foi importado continuam até você desconectar o banco ou excluir
        a conta.
      </p>
      <p>
        Quando disponível, cada conta pode usar uma vez um teste grátis de {TRIAL_DAYS} dias, que não gera cobrança nem renova
        automaticamente.
      </p>

      <h2 className={H2}>Dados de terceiros</h2>
      <p>
        Saldos, investimentos e cotações vêm de terceiros e podem ter atrasos, falhas ou divergências. Confira sempre as
        informações oficiais na sua instituição antes de tomar decisões.
      </p>

      <h2 className={H2}>Sua conta</h2>
      <p>
        Você é responsável por manter suas credenciais em segurança e pela veracidade dos dados inseridos. Você pode{' '}
        <Link href="/excluir-conta" className={INLINE_LINK}>
          excluir sua conta
        </Link>{' '}
        a qualquer momento em Perfil → Excluir minha conta. A exclusão da conta não cancela automaticamente a assinatura na
        loja.
      </p>
      <p>
        O tratamento dos seus dados está descrito na{' '}
        <Link href="/privacidade" className={INLINE_LINK}>
          Política de Privacidade
        </Link>
        .
      </p>

      <h2 className={H2}>Contato</h2>
      <p>
        {LEGAL.supportEmail ? (
          <a href={`mailto:${LEGAL.supportEmail}`} className={`${INLINE_LINK} break-words`}>
            {LEGAL.supportEmail}
          </a>
        ) : (
          legalValue('supportEmail')
        )}
        . Foro: {legalValue('city')}.
      </p>
    </main>
  )
}
