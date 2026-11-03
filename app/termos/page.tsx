import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Termos de Uso — SimpleFinan' }

// RASCUNHO: revise com um advogado e preencha os dados entre colchetes antes de publicar.
export default function TermosPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 space-y-5 text-sm leading-relaxed text-slate-300">
      <Link href="/" className="text-xs text-emerald-400 underline">Voltar ao app</Link>
      <h1 className="text-2xl font-bold text-white">Termos de Uso</h1>
      <p className="text-xs text-slate-500">Última atualização: [DATA]</p>

      <h2 className="text-base font-semibold text-white">O serviço</h2>
      <p>O SimpleFinan, operado por [RAZÃO SOCIAL OU NOME], [CNPJ OU CPF], é uma ferramenta de organização financeira pessoal. Não somos banco nem corretora, não movimentamos seu dinheiro e não fazemos recomendação de investimentos. Simulações e projeções são estimativas, sem garantia de resultado.</p>

      <h2 className="text-base font-semibold text-white">Planos</h2>
      <p>O plano Gratuito funciona com dados inseridos por você. O plano Premium é uma assinatura que adiciona a conexão com instituições financeiras via Open Finance. A cobrança, a renovação automática, o cancelamento e os reembolsos são feitos pela loja em que a assinatura foi contratada (App Store ou Google Play). Ao término da assinatura, sua conta volta ao plano Gratuito.</p>

      <h2 className="text-base font-semibold text-white">Dados de terceiros</h2>
      <p>Saldos, investimentos e cotações vêm de terceiros e podem ter atrasos, falhas ou divergências. Confira sempre as informações oficiais na sua instituição antes de tomar decisões.</p>

      <h2 className="text-base font-semibold text-white">Sua conta</h2>
      <p>Você é responsável por manter suas credenciais em segurança e pela veracidade dos dados inseridos. Você pode excluir sua conta a qualquer momento em Perfil → Excluir minha conta. A exclusão da conta não cancela automaticamente a assinatura na loja.</p>

      <h2 className="text-base font-semibold text-white">Contato</h2>
      <p>[E-MAIL]. Foro: [CIDADE/UF].</p>
    </main>
  )
}
