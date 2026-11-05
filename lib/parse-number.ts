/**
 * Lê números digitados em pt-BR ou com ponto decimal.
 * '1,5' e '1.5' são 1.5; '1.000' é 1000; '1.000,50' é 1000.5; vazio ou inválido é null.
 */
export function parseDecimalInput(text: string | null | undefined): number | null {
  if (text == null) return null
  const cleaned = text.replace(/R\$/gi, '').replace(/[\s ]/g, '')
  if (!cleaned) return null

  const negative = cleaned.startsWith('-')
  const body = negative ? cleaned.slice(1) : cleaned
  if (!/^[\d.,]*\d[\d.,]*$/.test(body)) return null

  const lastComma = body.lastIndexOf(',')
  const lastDot = body.lastIndexOf('.')
  let normalized: string

  if (lastComma >= 0 && lastDot >= 0) {
    // Com os dois separadores, o último é o decimal e o outro só pode separar milhares.
    const [decimal, thousands] = lastComma > lastDot ? [',', '.'] : ['.', ',']
    const [integer, fraction, ...rest] = body.split(decimal)
    if (rest.length || !isGroupedInteger(integer, thousands)) return null
    normalized = `${integer.split(thousands).join('')}.${fraction}`
  } else if (lastComma >= 0) {
    const groups = body.split(',')
    if (groups.length === 2) normalized = groups.join('.')
    else if (isGroupedInteger(body, ',')) normalized = groups.join('')
    else return null
  } else if (lastDot >= 0) {
    // '0.125' não pode ser milhar: uma quantidade fracionada (cripto, cotas) começa com zero.
    if (isGroupedInteger(body, '.')) normalized = body.split('.').join('')
    else if (body.split('.').length === 2) normalized = body
    else return null
  } else {
    normalized = body
  }

  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return negative ? -value : value
}

function isGroupedInteger(text: string, separator: string) {
  return text.split(separator).every((group, index) =>
    index === 0 ? /^[1-9]\d{0,2}$/.test(group) : /^\d{3}$/.test(group),
  )
}
