/** Dados financeiros guardados no aparelho, que não podem ficar depois que a conta sai. */
export function clearAccountCache() {
  for (const key of [
    '@portfolio:assets',
    '@portfolio:assets:open_finance',
    '@portfolio:goal',
    '@portfolio:owner',
    '@simplefinan:mode',
    'carteira_sections_order_v1',
  ]) {
    localStorage.removeItem(key)
  }
}
