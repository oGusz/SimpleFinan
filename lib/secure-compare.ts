import 'server-only'

import { createHash, timingSafeEqual } from 'crypto'

/** Compara segredos em tempo constante, independentemente do tamanho recebido. */
export function secretsMatch(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false
  const hash = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(hash(received), hash(expected))
}
