'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

const actionStyle = {
  display: 'block',
  boxSizing: 'border-box',
  width: '100%',
  maxWidth: '20rem',
  margin: '0.75rem auto 0',
  padding: '0.75rem 1.25rem',
  borderRadius: '0.5rem',
  border: 0,
  fontSize: '0.875rem',
  fontWeight: 600,
  fontFamily: 'inherit',
  textDecoration: 'none',
} as const

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body style={{ background: '#0d1117', color: '#fff', fontFamily: 'sans-serif', textAlign: 'center', padding: '4rem 1.5rem' }}>
        <h1 style={{ fontSize: '1.125rem' }}>Algo deu errado</h1>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Seus dados estão seguros. Tente abrir a tela novamente.</p>
        <button type="button" onClick={() => retry()} style={{ ...actionStyle, background: '#10b981', color: '#020617' }}>
          Tentar novamente
        </button>
        {/* Link comum de propósito: o layout quebrou, então só um carregamento completo recupera o app. */}
        <a href="/" style={{ ...actionStyle, background: '#1e293b', color: '#f1f5f9' }}>
          Ir para o início
        </a>
      </body>
    </html>
  )
}
