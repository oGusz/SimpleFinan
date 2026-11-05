export const ASSET_CATEGORIES = [
  'Ações',
  'Fundos imobiliários',
  'ETFs',
  'BDRs',
  'Renda fixa',
  'Fundos',
  'Previdência',
  'Cripto',
  'COE',
  'Outros',
  'Não classificado',
] as const

export type AssetCategory = (typeof ASSET_CATEGORIES)[number]

export const CATEGORY_COLORS: Record<AssetCategory, string> = {
  Ações: '#f59e0b', // amber-500
  'Fundos imobiliários': '#10b981', // emerald-500
  ETFs: '#3b82f6', // blue-500
  BDRs: '#ec4899', // pink-500
  'Renda fixa': '#06b6d4', // cyan-500
  Fundos: '#8b5cf6', // violet-500
  Previdência: '#a3e635', // lime-400
  Cripto: '#f97316', // orange-500
  COE: '#e879f9', // fuchsia-400
  Outros: '#94a3b8', // slate-400
  'Não classificado': '#64748b', // slate-500
}

const UNCLASSIFIED: AssetCategory = 'Não classificado'

function plainText(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}

const CATEGORY_ALIASES = new Map<string, AssetCategory>([
  ...ASSET_CATEGORIES.map((category): [string, AssetCategory] => [plainText(category), category]),
  ['ACAO', 'Ações'],
  ['FIIS', 'Fundos imobiliários'],
  ['FUNDO IMOBILIARIO', 'Fundos imobiliários'],
  ['ETF', 'ETFs'],
  ['BDR', 'BDRs'],
  ['TESOURO DIRETO', 'Renda fixa'],
  ['FUNDO', 'Fundos'],
  ['CRIPTOMOEDAS', 'Cripto'],
  // Rótulo genérico que o Open Finance grava quando a instituição não informa o tipo.
  ['INVESTIMENTO', 'Outros'],
])

/** Corrige os rótulos 'FII' e 'Tijolo', que eram gravados como padrão em qualquer ativo. */
function categoryFromLegacyLabel(label: string, ticker: string): AssetCategory {
  const suffix = /^[A-Z]{4}(\d{1,2})F?$/.exec(ticker.trim().toUpperCase())?.[1]
  if (!suffix) return UNCLASSIFIED
  if (/^(31|32|33|34|35|39)$/.test(suffix)) return 'BDRs'
  if (suffix === '11') return label === 'FII' ? 'Fundos imobiliários' : UNCLASSIFIED
  return /[3456]$/.test(suffix) ? 'Ações' : UNCLASSIFIED
}

export function normalizeCategory(raw: string | null | undefined, ticker: string): AssetCategory {
  const label = plainText(raw?.trim() ?? '')
  if (label === 'FII' || label === 'TIJOLO') return categoryFromLegacyLabel(label, ticker)
  return CATEGORY_ALIASES.get(label) ?? UNCLASSIFIED
}

/** O nome é só reserva. O final 11 sozinho não diz nada: BOVA11 é ETF, e TAEE11 e SANB11 são units. */
export function classifyFromName(name: string | null | undefined): AssetCategory {
  const text = plainText(name ?? '')
  if (!text) return UNCLASSIFIED

  if (/\bFII\b|FUNDO\s+(DE\s+)?INVEST\w*\s+IMOB|FDO\s+INV\s+IMOB|FUNDO\s+IMOB/.test(text)) {
    return 'Fundos imobiliários'
  }
  if (/\bETF\b|ISHARES|CLASSE DE INDICE|FUNDO DE INDICE/.test(text)) return 'ETFs'
  if (/\bBDR\b|\bDR[NE123]\b/.test(text)) return 'BDRs'
  if (/\bS\.?\s?A\b|\b(ON|PN|PNA|PNB|UNT|UNIT)\b/.test(text)) return 'Ações'
  return UNCLASSIFIED
}

export function classifyFromBrapi(asset: {
  type?: string | null
  subType?: string | null
  name?: string | null
}): AssetCategory {
  const type = asset.type?.toLowerCase()
  const subType = asset.subType?.toLowerCase()

  if (type === 'bdr') return 'BDRs'
  if (type === 'stock') return 'Ações'
  if (type === 'fund') {
    if (subType === 'fii') return 'Fundos imobiliários'
    if (subType === 'etf') return 'ETFs'
    return 'Fundos'
  }
  return classifyFromName(asset.name)
}

export interface PopularAsset {
  ticker: string
  name: string
  category: AssetCategory
}

// Reserva local da busca, para quando a Brapi está fora do ar. Só códigos com cotação recente.
export const POPULAR_ASSETS: PopularAsset[] = [
  { ticker: 'MXRF11', name: 'Maxi Renda', category: 'Fundos imobiliários' },
  { ticker: 'XPML11', name: 'XP Malls', category: 'Fundos imobiliários' },
  { ticker: 'HGLG11', name: 'Cshg Logística', category: 'Fundos imobiliários' },
  { ticker: 'KNCR11', name: 'Kinea Rendimentos Imobiliários', category: 'Fundos imobiliários' },
  { ticker: 'KNSC11', name: 'Kinea Securities', category: 'Fundos imobiliários' },
  { ticker: 'VISC11', name: 'Vinci Shopping Centers', category: 'Fundos imobiliários' },
  { ticker: 'BTLG11', name: 'BTG Pactual Logística', category: 'Fundos imobiliários' },
  { ticker: 'TGAR11', name: 'TG Ativo Real', category: 'Fundos imobiliários' },
  { ticker: 'XPIN11', name: 'XP Industrial', category: 'Fundos imobiliários' },
  { ticker: 'MCCI11', name: 'Mauá Capital Recebíveis', category: 'Fundos imobiliários' },
  { ticker: 'CPTS11', name: 'Capitânia Securities II', category: 'Fundos imobiliários' },
  { ticker: 'RECR11', name: 'REC Recebíveis Imobiliários', category: 'Fundos imobiliários' },
  { ticker: 'VGHF11', name: 'Valora Hedge Fund', category: 'Fundos imobiliários' },
  { ticker: 'PETR4', name: 'Petrobras PN', category: 'Ações' },
  { ticker: 'VALE3', name: 'Vale ON', category: 'Ações' },
  { ticker: 'ITUB4', name: 'Itaú Unibanco PN', category: 'Ações' },
  { ticker: 'BBAS3', name: 'Banco do Brasil ON', category: 'Ações' },
  { ticker: 'BBDC4', name: 'Bradesco PN', category: 'Ações' },
  { ticker: 'MGLU3', name: 'Magazine Luiza ON', category: 'Ações' },
]

export function searchPopularAssets(query: string): PopularAsset[] {
  const term = plainText(query.trim())
  if (!term) return []
  return POPULAR_ASSETS.filter(
    (asset) => asset.ticker.startsWith(term) || plainText(asset.name).includes(term),
  )
}
