// Cada variável é lida pelo nome completo porque o Next só embute NEXT_PUBLIC_ escrito por extenso.
export const LEGAL = {
  companyName: process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME?.trim() ?? '',
  documentId: process.env.NEXT_PUBLIC_LEGAL_DOCUMENT_ID?.trim() ?? '',
  privacyEmail: process.env.NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL?.trim() ?? '',
  supportEmail: process.env.NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL?.trim() ?? '',
  city: process.env.NEXT_PUBLIC_LEGAL_CITY?.trim() ?? '',
  effectiveDate: process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE?.trim() ?? '',
}

export type LegalField = keyof typeof LEGAL

/** Nomes dos campos de LEGAL ainda vazios. */
export function missingLegalFields(source: Record<LegalField, string> = LEGAL): string[] {
  return (Object.keys(LEGAL) as LegalField[]).filter((field) => !source[field])
}

export function legalValue(field: LegalField) {
  return LEGAL[field] || '(a preencher antes da publicação)'
}
