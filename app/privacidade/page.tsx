import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { BackButton } from '@/components/back-button'
import { LEGAL, legalValue } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Política de Privacidade — SimpleFinan',
  description: 'Quais dados o SimpleFinan trata, com qual finalidade, por quanto tempo e como exercer seus direitos.',
}

// scripts/check-release.mjs barra o envio às lojas enquanto este marcador estiver na página.
const SUPPLIER_DEADLINE = 'prazo a definir, pendente de revisão'

const TREATMENTS = [
  {
    purpose: 'Criar e manter sua conta',
    data: 'E-mail, nome, foto de perfil e o meio de entrada usado.',
    basis: 'Execução de contrato',
    retention: 'Enquanto a conta existir.',
  },
  {
    purpose: 'Organizar suas finanças',
    data: 'Contas, vencimentos, metas e investimentos inseridos por você.',
    basis: 'Execução de contrato',
    retention: 'Enquanto a conta existir, ou até você apagar o item.',
  },
  {
    purpose: 'Conectar instituições financeiras (plano Premium)',
    data: 'Instituições conectadas, contas, saldos, limites, investimentos, transações e faturas de cartão.',
    basis: 'Consentimento',
    retention:
      'Importamos até 90 dias a cada sincronização e guardamos enquanto a conexão existir. Tudo é apagado ao desconectar o banco ou excluir a conta.',
  },
  {
    purpose: 'Gerenciar assinatura e teste grátis',
    data: 'Plano, situação, loja de origem e data de término do período.',
    basis: 'Execução de contrato',
    retention: 'Enquanto a conta existir. Os registros de compra nas lojas seguem as regras de cada loja.',
  },
  {
    purpose: 'Enviar lembretes e resumos mensais',
    data: 'E-mail, nome e valor das contas nos e-mails, token de notificação do aparelho e registro dos envios. As notificações no celular não mostram nome nem valor.',
    basis: 'Execução de contrato; você pode desligar os lembretes em Perfil',
    retention: 'Enquanto a conta existir.',
  },
  {
    purpose: 'Proteger o acesso e limitar tentativas',
    data: 'Identificador em hash gerado a partir do endereço IP, do e-mail ou do código da conta. O dado original não é guardado nessa tabela.',
    basis: 'Legítimo interesse',
    retention: 'Removido pela rotina diária depois de um dia.',
  },
  {
    purpose: 'Diagnosticar erros (Sentry)',
    data: 'Mensagens de erro, tela em que ocorreram, dados técnicos do aparelho e amostras de desempenho, sem cookies, cabeçalhos, corpo de requisições ou dados do usuário.',
    basis: 'Legítimo interesse',
    retention: `No fornecedor: ${SUPPLIER_DEADLINE}.`,
  },
  {
    purpose: 'Métricas de uso (PostHog e Vercel Analytics)',
    data: 'Telas acessadas, ações no app, identificador da conta e gravações de sessão com textos, valores e campos ocultos.',
    basis: 'Consentimento',
    retention: `Coleta interrompida quando você desliga. No fornecedor: ${SUPPLIER_DEADLINE}.`,
  },
  {
    purpose: 'Cumprir obrigações legais',
    data: 'Os dados que a lei exigir, como registros de acesso.',
    basis: 'Obrigação legal',
    retention: 'Pelo prazo que a lei determinar.',
  },
]

const H2 = 'pt-2 text-base font-semibold text-white'
const INLINE_LINK = 'text-emerald-400 underline underline-offset-2'

// RASCUNHO: revise com um advogado e preencha NEXT_PUBLIC_LEGAL_* antes de publicar.
export default function PrivacidadePage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+2.5rem)] text-sm leading-relaxed text-slate-300">
      <header className="flex items-center gap-2">
        <BackButton fallbackHref="/" />
        <Image src="/icon.svg" alt="" width={28} height={28} />
        <span className="font-semibold text-white">SimpleFinan</span>
      </header>

      <h1 className="text-2xl font-bold text-white">Política de Privacidade</h1>
      <p className="text-xs text-slate-400">Última atualização: {legalValue('effectiveDate')}</p>

      <h2 className={H2}>Quem somos</h2>
      <p>
        O SimpleFinan é operado por {legalValue('companyName')}, {legalValue('documentId')}, responsável pelo tratamento
        dos dados descritos aqui.
      </p>

      <h2 className={H2}>Encarregado e canal de privacidade</h2>
      <p>
        Fale com o encarregado pelo tratamento de dados em{' '}
        {LEGAL.privacyEmail ? (
          <a href={`mailto:${LEGAL.privacyEmail}`} className={`${INLINE_LINK} break-words`}>
            {LEGAL.privacyEmail}
          </a>
        ) : (
          legalValue('privacyEmail')
        )}
        .
      </p>

      <h2 className={H2}>O que tratamos, por quê e por quanto tempo</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-800" tabIndex={0} role="region" aria-label="Quadro de tratamento de dados">
        <table className="w-full min-w-[42rem] border-collapse text-left text-xs">
          <thead className="bg-slate-900 text-slate-200">
            <tr>
              <th scope="col" className="p-3 font-semibold">Finalidade</th>
              <th scope="col" className="p-3 font-semibold">Dados</th>
              <th scope="col" className="p-3 font-semibold">Base legal</th>
              <th scope="col" className="p-3 font-semibold">Retenção</th>
            </tr>
          </thead>
          <tbody>
            {TREATMENTS.map((row) => (
              <tr key={row.purpose} className="border-t border-slate-800 align-top">
                <th scope="row" className="p-3 font-medium text-slate-200">{row.purpose}</th>
                <td className="p-3">{row.data}</td>
                <td className="p-3">{row.basis}</td>
                <td className="p-3">{row.retention}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Não vendemos seus dados.</p>

      <h2 className={H2}>Dados de instituições financeiras</h2>
      <p>
        Não recebemos nem armazenamos a senha do seu banco: a autorização é feita no ambiente da Pluggy e da sua
        instituição. Importamos até 90 dias a cada sincronização e guardamos enquanto a conexão existir, por isso o
        histórico salvo pode ser maior que 90 dias.
      </p>
      <p>
        Ao desconectar um banco, revogamos o acesso e apagamos transações, contas, saldos, faturas de cartão e
        investimentos importados dele. Sem o plano Premium, paramos de atualizar esses dados, mas a conexão e o que já foi
        importado continuam até você desconectar o banco ou excluir a conta.
      </p>

      <h2 className={H2}>Métricas e diagnóstico</h2>
      <p>
        As métricas de uso e as gravações de sessão ficam desligadas até você permitir. Você pode mudar a escolha em
        Perfil, e ela vale para a sua conta. Nas gravações, textos, valores e campos digitados ficam ocultos.
      </p>
      <p>
        O registro de erros no Sentry é separado das métricas e funciona mesmo sem essa permissão, porque é necessário
        para encontrar e corrigir falhas do serviço.
      </p>

      <h2 className={H2}>Com quem compartilhamos</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Supabase: autenticação, banco de dados e fotos de perfil.</li>
        <li>Vercel: hospedagem e, se você permitir, métricas de uso.</li>
        <li>PostHog: métricas de uso e gravações de sessão com conteúdo oculto, se você permitir.</li>
        <li>Sentry: registro de erros do aplicativo.</li>
        <li>Resend: envio de e-mails de lembrete e resumo.</li>
        <li>Expo: envio de notificações ao celular.</li>
        <li>Pluggy: conexão com instituições financeiras (plano Premium).</li>
        <li>Brapi e Yahoo Finance: consulta de cotações, apenas com o código do ativo.</li>
        <li>RevenueCat, Apple e Google: processamento de assinaturas.</li>
        <li>Serviço de entrada que você escolher, como Google ou Apple: autenticação.</li>
      </ul>

      <h2 className={H2}>Transferência internacional</h2>
      <p>
        PostHog e Sentry tratam dados nos Estados Unidos. Os demais fornecedores listados também podem tratar dados fora
        do Brasil, conforme a infraestrutura de cada um. Essas transferências ocorrem para prestar o serviço, medir o uso
        com a sua permissão e diagnosticar erros.
      </p>

      <h2 className={H2}>Armazenamento no aparelho</h2>
      <p>
        Usamos cookies para manter sua sessão e o armazenamento local do navegador ou do app para guardar uma cópia da
        carteira, cotações, preferências, a escolha sobre métricas e o bloqueio por biometria. A cópia da carteira é
        apagada ao sair da conta. A biometria é verificada pelo próprio aparelho e não chega até nós. Não usamos cookies
        de publicidade.
      </p>

      <h2 className={H2}>Menores de idade</h2>
      <p>
        O SimpleFinan não é destinado a menores de 18 anos e não verificamos a idade no cadastro. Se você souber de uma
        conta de menor, escreva para o canal de privacidade para que ela seja removida.
      </p>

      <h2 className={H2}>Seus direitos (LGPD)</h2>
      <p>
        Você pode confirmar o tratamento, acessar, corrigir, levar e eliminar seus dados, além de revogar consentimentos e
        reclamar à ANPD. Em Perfil → Baixar meus dados, você recebe uma cópia dos seus dados. Para revogar o acesso a um
        banco, desconecte-o na tela Open Finance. Para os demais pedidos, use o canal de privacidade.
      </p>

      <h2 className={H2}>Exclusão da conta</h2>
      <p>
        Em Perfil → Excluir minha conta, revogamos os bancos conectados e apagamos seus dados, exceto os que a lei nos
        obrigue a guardar. Veja o passo a passo em{' '}
        <Link href="/excluir-conta" className={INLINE_LINK}>
          Excluir conta
        </Link>
        .
      </p>
      <p>
        Pedimos também à RevenueCat e ao PostHog que apaguem seus dados, quando a integração com eles está configurada. Se
        o pedido não for concluído, os dados podem continuar lá até serem removidos pelo canal de privacidade. Registros
        de erros, de envio de e-mails, cópias de segurança e compras nas lojas seguem os prazos de cada fornecedor (
        {SUPPLIER_DEADLINE}).
      </p>
    </main>
  )
}
