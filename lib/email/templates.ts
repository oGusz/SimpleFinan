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

export function monthlySummaryEmail(
  summary: { monthLabel: string; total: number; paid: number; pending: number; count: number },
  appUrl: string,
) {
  return {
    subject: `Seu resumo de ${summary.monthLabel}`,
    html: layout(
      `Resumo de ${summary.monthLabel}`,
      `<p>Total em contas: <strong>${money(summary.total)}</strong> (${summary.count} no mês)</p>
<p>Pago: ${money(summary.paid)}<br>Em aberto: ${money(summary.pending)}</p>`,
      appUrl,
    ),
  }
}
