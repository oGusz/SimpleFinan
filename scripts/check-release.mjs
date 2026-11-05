// Confere o que precisa estar pronto antes de enviar às lojas. Fica fora do CI: falha de propósito
// até o dono preencher os dados da empresa e a revisão jurídica terminar.
// Lê só o ambiente, para conferir os valores de produção e não os de desenvolvimento:
//   node --env-file=.env.production.local scripts/check-release.mjs

import { readFileSync } from 'node:fs'

const LEGAL_VARS = [
  'NEXT_PUBLIC_LEGAL_COMPANY_NAME',
  'NEXT_PUBLIC_LEGAL_DOCUMENT_ID',
  'NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL',
  'NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL',
  'NEXT_PUBLIC_LEGAL_CITY',
  'NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE',
]

const LEGAL_PAGES = ['termos', 'privacidade', 'sobre', 'suporte', 'excluir-conta'].map((route) => `app/${route}/page.tsx`)

const PENDING_MARKS = [
  { pattern: /RASCUNHO/, label: 'comentário RASCUNHO (falta a revisão jurídica)' },
  { pattern: /pendente de revisão/i, label: 'prazo marcado como "pendente de revisão"' },
  { pattern: /\[[A-ZÀ-Ú][A-ZÀ-Ú \/]+\]/, label: 'campo entre colchetes' },
]

const readProjectFile = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

// O app é gerado pelo EAS, então a URL pode estar no perfil de produção em vez do ambiente.
function easProductionWebUrl() {
  try {
    return JSON.parse(readProjectFile('mobile/eas.json')).build?.production?.env?.EXPO_PUBLIC_WEB_URL?.trim()
  } catch {
    return undefined
  }
}

const problems = []

for (const name of LEGAL_VARS) {
  if (!process.env[name]?.trim()) problems.push(`Variável ausente: ${name}`)
}

if (!process.env.EXPO_PUBLIC_WEB_URL?.trim() && !easProductionWebUrl()) {
  problems.push('Variável ausente: EXPO_PUBLIC_WEB_URL (no ambiente ou no perfil production de mobile/eas.json)')
}

for (const page of LEGAL_PAGES) {
  let source
  try {
    source = readProjectFile(page)
  } catch {
    problems.push(`Página não encontrada: ${page}`)
    continue
  }
  for (const { pattern, label } of PENDING_MARKS) {
    if (pattern.test(source)) problems.push(`${page}: ${label}`)
  }
}

if (problems.length > 0) {
  console.error(`Publicação bloqueada. ${problems.length} pendência(s):`)
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}

console.log('Dados legais preenchidos e sem marcadores de rascunho.')
