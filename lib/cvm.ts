// Leitura dos dados abertos da CVM: comunicados das companhias (IPE) e códigos de negociação (FCA).
// As funções de parse são puras; quem baixa e grava é lib/cvm-sync.ts.
import { isExchangeTicker } from '@/lib/tickers'

/** Categorias que viram notícia no app. As demais (atas, editais, mapas de votação) são rotina. */
export const ANNOUNCEMENT_CATEGORIES = ['Fato Relevante', 'Comunicado ao Mercado', 'Aviso aos Acionistas'] as const
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number]

export interface Announcement {
  protocol: string
  cnpj: string
  company: string
  category: AnnouncementCategory
  subject: string
  reference_date: string | null
  delivered_on: string
  url: string
  version: number
}

export interface TickerRow {
  ticker: string
  cnpj: string
  company: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
// Só documentos do sistema oficial de entrega da CVM; outro endereço viraria link para fora.
const CVM_DOCUMENT_URL = /^https:\/\/www\.rad\.cvm\.gov\.br\//

/** Os arquivos da CVM vêm em ISO-8859-1; ler como UTF-8 estragaria os acentos. */
export function decodeLatin1(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes)
}

// Campos não trazem ';' (todas as linhas têm o mesmo número de colunas), mas alguns vêm entre aspas.
function cleanField(raw: string | undefined): string {
  const value = (raw ?? '').trim()
  const unquoted = value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value
  return unquoted.replace(/""/g, '"').replace(/\s+/g, ' ').trim()
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length === 0) return []
  const header = lines[0].replace(/^﻿/, '').split(';').map((name) => name.trim())
  return lines.slice(1).map((line) => {
    const fields = line.split(';')
    const row: Record<string, string> = {}
    header.forEach((name, index) => {
      row[name] = cleanField(fields[index])
    })
    return row
  })
}

const isCategory = (value: string): value is AnnouncementCategory =>
  (ANNOUNCEMENT_CATEGORIES as readonly string[]).includes(value)

/**
 * Comunicados relevantes entregues a partir de `since` (YYYY-MM-DD), um por protocolo,
 * sempre na versão mais recente: a companhia pode reapresentar o mesmo documento corrigido.
 */
export function parseAnnouncements(text: string, since: string): Announcement[] {
  const byProtocol = new Map<string, Announcement>()
  for (const row of parseCsv(text)) {
    const category = row.Categoria
    const protocol = row.Protocolo_Entrega
    const delivered = row.Data_Entrega
    const url = row.Link_Download
    if (!isCategory(category) || !protocol || !ISO_DATE.test(delivered) || delivered < since) continue
    if (!CVM_DOCUMENT_URL.test(url) || !row.CNPJ_Companhia) continue

    const version = Number.parseInt(row.Versao, 10) || 1
    const current = byProtocol.get(protocol)
    if (current && current.version >= version) continue

    byProtocol.set(protocol, {
      protocol,
      cnpj: row.CNPJ_Companhia,
      company: row.Nome_Companhia,
      category,
      // Sem assunto informado, a categoria ainda diz do que se trata.
      subject: row.Assunto || category,
      reference_date: ISO_DATE.test(row.Data_Referencia) ? row.Data_Referencia : null,
      delivered_on: delivered,
      url,
      version,
    })
  }
  return [...byProtocol.values()]
}

/**
 * Códigos negociados hoje na bolsa. Códigos encerrados ficam de fora, e, se o mesmo código
 * aparecer em mais de um formulário, vale o mais recente.
 */
export function parseTickers(text: string): TickerRow[] {
  const byTicker = new Map<string, TickerRow & { reference: string }>()
  for (const row of parseCsv(text)) {
    const ticker = row.Codigo_Negociacao.toUpperCase()
    if (!isExchangeTicker(ticker) || row.Mercado !== 'Bolsa' || row.Data_Fim_Negociacao) continue
    if (!row.CNPJ_Companhia) continue

    const reference = `${row.Data_Referencia}#${row.Versao.padStart(4, '0')}`
    const current = byTicker.get(ticker)
    if (current && current.reference >= reference) continue
    byTicker.set(ticker, { ticker, cnpj: row.CNPJ_Companhia, company: row.Nome_Empresarial, reference })
  }
  return [...byTicker.values()].map(({ reference: _reference, ...row }) => row)
}

const IPE_URL = (year: number) => `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_${year}.zip`
const FCA_URL = (year: number) => `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FCA/DADOS/fca_cia_aberta_${year}.zip`

export const cvmFiles = { IPE_URL, FCA_URL }
