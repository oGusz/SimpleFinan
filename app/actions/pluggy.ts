'use server'

import { PluggyClient } from 'pluggy-sdk'

const pluggy = new PluggyClient({
  clientId: process.env.PLUGGY_CLIENT_ID!,
  clientSecret: process.env.PLUGGY_CLIENT_SECRET!,
})

export async function getPluggyConnectToken() {
  try {
    // Passamos as opções de personalização diretamente no SDK oficial
    const data = await pluggy.createConnectToken(undefined, {
      
    })
    return { accessToken: data.accessToken }
  } catch (error) {
    console.error('Erro ao gerar Connect Token Pluggy:', error)
    return { error: 'Falha ao autenticar com Pluggy' }
  }
}

// Retorna os dados de investimentos diretamente do SDK da Pluggy
export async function fetchPluggyInvestmentsDirectly(itemId: string) {
  try {
    // Busca os investimentos vinculados ao itemId que o widget devolveu
    const response = await pluggy.fetchInvestments(itemId)
    const investments = response.results || []

    const formattedInvestments = investments.map((inv) => ({
      pluggy_investment_id: inv.id,
      name: inv.name,
      code: inv.code || inv.number || null,
      type: mapInvestmentType(inv.type),
      value: inv.balance || inv.amount || 0,
      quantity: inv.quantity || 1,
      institution: inv.owner || 'Open Finance',
      updated_at: new Date().toISOString(),
    }))

    return { success: true, investments: formattedInvestments }
  } catch (error) {
    console.error('Erro ao buscar ativos na Pluggy:', error)
    return { error: 'Falha na comunicação com a Pluggy' }
  }
}

function mapInvestmentType(pluggyType: string): string {
  switch (pluggyType) {
    case 'MUTUAL_FUND':
    case 'INVESTMENT_FUND':
      return 'Fundo de Investimento'
    case 'EQUITY':
      return 'Ações'
    case 'FIXED_INCOME':
      return 'Renda Fixa'
    case 'ETF':
      return 'ETF'
    case 'REAL_ESTATE_FUND':
      return 'FII'
    default:
      return pluggyType || 'Outros'
  }
}