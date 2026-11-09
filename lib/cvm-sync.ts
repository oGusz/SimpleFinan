import 'server-only'

import { unzipSync } from 'fflate'
import type { SupabaseClient } from '@supabase/supabase-js'

import { cvmFiles, decodeLatin1, parseAnnouncements, parseTickers } from '@/lib/cvm'

const TIMEOUT_MS = 30_000
/** Janela de comunicados guardada: a aba mostra o recente, e o banco não cresce sem limite. */
const KEEP_DAYS = 180
const UPSERT_CHUNK = 500

const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01'])

async function downloadCsv(url: string, match: RegExp): Promise<string | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
  // 404 é esperado no início de um ano novo, antes de a CVM publicar o arquivo.
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`CVM respondeu HTTP ${response.status} para ${url}`)
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()))
  const name = Object.keys(files).find((file) => match.test(file))
  return name ? decodeLatin1(files[name]) : null
}

function isoDaysAgo(today: string, days: number) {
  const date = new Date(`${today}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

async function upsertInChunks(admin: SupabaseClient, table: string, rows: object[], onConflict: string) {
  for (let start = 0; start < rows.length; start += UPSERT_CHUNK) {
    const { error } = await admin.from(table).upsert(rows.slice(start, start + UPSERT_CHUNK), { onConflict })
    if (error) throw error
  }
}

export interface CvmSyncResult {
  status: 'ok' | 'sem_tabela'
  tickers: number
  announcements: number
}

/**
 * Atualiza códigos de negociação e comunicados a partir dos arquivos do ano corrente (e do anterior
 * nas primeiras semanas do ano, para a janela não ficar vazia em janeiro).
 */
export async function syncCvmAnnouncements(admin: SupabaseClient, today: string): Promise<CvmSyncResult> {
  const year = Number(today.slice(0, 4))
  const since = isoDaysAgo(today, KEEP_DAYS)
  const years = Number(since.slice(0, 4)) < year ? [year - 1, year] : [year]

  const tickers = new Map<string, ReturnType<typeof parseTickers>[number]>()
  const announcements = []
  for (const fileYear of years) {
    const fca = await downloadCsv(cvmFiles.FCA_URL(fileYear), /valor_mobiliario/i)
    // O ano mais recente sobrescreve: o código pode ter mudado de companhia.
    if (fca) for (const row of parseTickers(fca)) tickers.set(row.ticker, row)

    const ipe = await downloadCsv(cvmFiles.IPE_URL(fileYear), /^ipe_cia_aberta_\d{4}\.csv$/i)
    if (ipe) announcements.push(...parseAnnouncements(ipe, since))
  }

  const now = new Date().toISOString()
  try {
    await upsertInChunks(admin, 'market_tickers', [...tickers.values()].map((row) => ({ ...row, updated_at: now })), 'ticker')
    await upsertInChunks(admin, 'market_announcements', announcements, 'protocol')
  } catch (error) {
    // Migração ainda não aplicada: não é falha da rotina, só um recurso indisponível.
    if (MISSING_TABLE_CODES.has((error as { code?: string }).code ?? '')) {
      return { status: 'sem_tabela', tickers: 0, announcements: 0 }
    }
    throw error
  }

  const { error: pruneError } = await admin.from('market_announcements').delete().lt('delivered_on', since)
  if (pruneError) console.error('[CVM] Falha ao apagar comunicados antigos:', pruneError.code)

  return { status: 'ok', tickers: tickers.size, announcements: announcements.length }
}
