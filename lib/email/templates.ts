const money = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// O título da conta é digitado pelo usuário e entra no HTML do e-mail.
export function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function layout(title: string, body: string, appUrl: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0f172a">
<h2 style="color:#059669">${escapeHtml(title)}</h2>
${body}
<p><a href="${escapeHtml(appUrl)}" style="color:#059669">Abrir o SimpleFinan</a></p>
<p style="font-size:12px;color:#64748b">Para parar de receber, desative os lembretes em Perfil, no app.</p>
</div>`
}

export function billReminderEmail(bills: { title?: string; amount: number; due_date: string }[], appUrl: string) {
  const items = bills
    .map((bill) => {
      const [year, month, day] = bill.due_date.slice(0, 10).split('-')
      return `<li>${escapeHtml(bill.title || 'Conta')}: ${money(Number(bill.amount) || 0)}, vence em ${day}/${month}/${year}</li>`
    })
    .join('')

  return {
    subject: bills.length === 1 ? 'Você tem uma conta vencendo' : `Você tem ${bills.length} contas vencendo`,
    html: layout('Contas para os próximos dias', `<ul>${items}</ul>`, appUrl),
  }
}

export function trialEndingEmail(trial: { endDate: string; daysLeft: number }, appUrl: string) {
  const [year, month, day] = trial.endDate.slice(0, 10).split('-')
  const when = trial.daysLeft === 0 ? 'hoje' : `em ${trial.daysLeft} dias, no dia ${day}/${month}/${year}`
  const subject = trial.daysLeft === 0 ? 'Seu teste grátis termina hoje' : `Seu teste grátis termina em ${trial.daysLeft} dias`

  return {
    subject,
    html: layout(
      subject,
      `<p>Seu teste grátis do SimpleFinan Premium termina ${when}.</p>
<p>Depois disso, os recursos Premium, como a conexão com bancos, ficam indisponíveis até você assinar. As contas e as metas que você cadastrou continuam no app.</p>`,
      appUrl,
    ),
  }
}

export function monthlySummaryEmail(
  summary: { monthLabel: string; total: number; paid: number; pending: number; count: number; reportMonth?: string },
  appUrl: string,
) {
  // Só quem é Premium recebe o link: para os demais, a página mostraria apenas o convite para assinar.
  const reportLink = summary.reportMonth
    ? `<p><a href="${escapeHtml(`${appUrl}/relatorio?mes=${summary.reportMonth}`)}" style="color:#059669">Ver o relatório completo do mês</a>: carteira contra CDI e Ibovespa, proventos e metas.</p>`
    : ''
  return {
    subject: `Seu resumo de ${summary.monthLabel}`,
    html: layout(
      `Resumo de ${summary.monthLabel}`,
      `<p>Total em contas: <strong>${money(summary.total)}</strong> (${summary.count} no mês)</p>
<p>Pago: ${money(summary.paid)}<br>Em aberto: ${money(summary.pending)}</p>${reportLink}`,
      appUrl,
    ),
  }
}

export function priceAlertEmail(alert: { ticker: string; direction: 'above' | 'below'; target: number; price: number }, appUrl: string) {
  const verb = alert.direction === 'above' ? 'chegou a' : 'caiu para'
  const subject = `${alert.ticker} ${verb} ${money(alert.price)}`
  return {
    subject,
    html: layout(
      subject,
      `<p>Seu alerta de ${escapeHtml(alert.ticker)} ${alert.direction === 'above' ? 'acima' : 'abaixo'} de <strong>${money(alert.target)}</strong> foi atingido.</p>
<p>Cotação no último fechamento: <strong>${money(alert.price)}</strong>. O alerta foi desligado; crie outro em Alertas, no app.</p>
<p style="font-size:12px;color:#64748b">Aviso informativo, verificado uma vez por dia. Não é recomendação de compra ou venda.</p>`,
      appUrl,
    ),
  }
}

export function announcementsEmail(items: { tickers: string[]; category: string; subject: string; url: string }[], appUrl: string) {
  const list = items
    .map(
      (item) =>
        `<li style="margin-bottom:8px"><strong>${escapeHtml(item.tickers.join(', '))}</strong> · ${escapeHtml(item.category)}<br>${escapeHtml(item.subject)}<br><a href="${escapeHtml(item.url)}" style="color:#059669">Ler na CVM</a></li>`,
    )
    .join('')
  const subject = items.length === 1 ? `Novo comunicado de ${items[0].tickers[0]}` : `${items.length} novos comunicados das suas empresas`
  return { subject, html: layout(subject, `<ul style="padding-left:18px">${list}</ul>`, `${appUrl}/noticias`) }
}
