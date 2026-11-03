import type { init } from '@sentry/nextjs'

// O DSN só permite enviar erros e fica visível no navegador de qualquer forma.
const DEFAULT_DSN =
  'https://f84e9bbdfea4c22c92d19e00c81461ee@o4512369585618944.ingest.us.sentry.io/4512369599709184'

// O padrão do Sentry 11 coleta cookies, cabeçalhos, corpos de requisição e variáveis locais.
// Aqui eles carregariam a sessão, senhas e valores financeiros, então nada disso é enviado.
export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || DEFAULT_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    stackFrameVariables: false,
  },
} satisfies Parameters<typeof init>[0]
