'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body style={{ background: '#0d1117', color: '#fff', fontFamily: 'sans-serif', textAlign: 'center', padding: '4rem 1.5rem' }}>
        <h1 style={{ fontSize: '1.125rem' }}>Algo deu errado</h1>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Seus dados estão seguros. Tente abrir a tela novamente.</p>
        <button type="button" onClick={reset} style={{ marginTop: '1rem', padding: '0.75rem 1.25rem', borderRadius: '0.5rem', border: 0 }}>
          Tentar novamente
        </button>
      </body>
    </html>
  )
}
