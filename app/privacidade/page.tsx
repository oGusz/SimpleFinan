import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Política de Privacidade — SimpleFinan' }

// RASCUNHO: revise com um advogado e preencha os dados entre colchetes antes de publicar.
export default function PrivacidadePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 space-y-5 text-sm leading-relaxed text-slate-300">
      <Link href="/" className="text-xs text-emerald-400 underline">Voltar ao app</Link>
      <h1 className="text-2xl font-bold text-white">Política de Privacidade</h1>
      <p className="text-xs text-slate-500">Última atualização: [DATA]</p>

      <h2 className="text-base font-semibold text-white">Quem somos</h2>
      <p>O SimpleFinan é operado por [RAZÃO SOCIAL OU NOME], [CNPJ OU CPF]. Contato para assuntos de privacidade: [E-MAIL].</p>

      <h2 className="text-base font-semibold text-white">Dados que tratamos</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Cadastro: e-mail, nome e foto de perfil.</li>
        <li>Dados que você insere: contas, vencimentos, metas e investimentos.</li>
        <li>No plano Premium, com o seu consentimento: instituições conectadas, contas, saldos, limites, investimentos e transações dos últimos 90 dias.</li>
        <li>Dados técnicos e de uso, como telas acessadas, ações no app e erros, para manter e melhorar o serviço. Gravações de sessão ocultam textos, valores e campos digitados. Você pode desativar as métricas em Perfil.</li>
        <li>Endereço IP, de forma cifrada, para limitar tentativas de acesso.</li>
      </ul>
      <p>Não recebemos nem armazenamos a senha do seu banco: a autorização é feita no ambiente da Pluggy e da sua instituição.</p>

      <h2 className="text-base font-semibold text-white">Para que usamos</h2>
      <p>Para exibir sua organização financeira, sincronizar dados entre seus dispositivos, enviar lembretes de vencimento e resumos mensais, gerenciar sua assinatura e proteger sua conta. Você pode desativar os e-mails em Perfil. Não vendemos seus dados.</p>

      <h2 className="text-base font-semibold text-white">Com quem compartilhamos</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Supabase: autenticação e banco de dados.</li>
        <li>Vercel: hospedagem e métricas de uso.</li>
        <li>PostHog: métricas de uso e gravações de sessão com conteúdo oculto.</li>
        <li>Sentry: registro de erros do aplicativo.</li>
        <li>Resend: envio de e-mails de lembrete e resumo.</li>
        <li>Pluggy: conexão com instituições financeiras (plano Premium).</li>
        <li>Brapi e Yahoo Finance: consulta de cotações, apenas com o código do ativo.</li>
        <li>RevenueCat, Apple e Google: processamento de assinaturas.</li>
      </ul>

      <h2 className="text-base font-semibold text-white">Seus direitos (LGPD)</h2>
      <p>Você pode solicitar acesso, correção, portabilidade e eliminação dos seus dados, além de revogar consentimentos. Para revogar o acesso a um banco, desconecte-o na tela Open Finance. Para apagar tudo, use Perfil → Excluir minha conta.</p>

      <h2 className="text-base font-semibold text-white">Retenção</h2>
      <p>Mantemos os dados enquanto sua conta existir. Ao excluir a conta, os dados são apagados, exceto os que a lei nos obrigue a guardar.</p>
    </main>
  )
}
