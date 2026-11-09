import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

import { PortfolioProvider } from '@/context/PortfolioContext'
import { AppModeProvider } from '@/context/AppModeContext'
import { AnalyticsGate } from '@/components/analytics-gate'
import { AppLock } from '@/components/app-lock'
import { BottomNav } from '@/components/bottom-nav'
import { ConsentPrompt } from '@/components/consent-prompt'
import { MotionProvider } from '@/components/motion-provider'
import { NativePushListener } from '@/components/native-push-listener'
import { QuickAddProvider } from '@/components/quick-add-provider'
import { ToastProvider } from '@/components/ui/toast'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

const DESCRIPTION = 'Organize contas, vencimentos, metas e investimentos em um só lugar.'

// Sem a variável, ou com valor inválido, o Next usa o endereço da própria implantação.
function appUrl() {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL?.trim() ?? '')
  } catch {
    return undefined
  }
}

export const metadata: Metadata = {
  metadataBase: appUrl(),
  title: 'SimpleFinan',
  description: DESCRIPTION,
  openGraph: {
    title: 'SimpleFinan',
    description: DESCRIPTION,
    siteName: 'SimpleFinan',
    locale: 'pt_BR',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'SimpleFinan' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SimpleFinan',
    description: DESCRIPTION,
    images: ['/og-image.png'],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SimpleFinan',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0d1117',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt-BR"
      className={`dark bg-background ${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="font-sans antialiased">
        <MotionProvider>
          <AppModeProvider>
            <PortfolioProvider>
              <ToastProvider>
                <QuickAddProvider>
                  {/* Antes do conteúdo: com o mesmo z-index, os modais das páginas ficam por cima. */}
                  <BottomNav />
                  {children}
                  <AppLock />
                  <ConsentPrompt />
                  <NativePushListener />
                  <AnalyticsGate />
                </QuickAddProvider>
              </ToastProvider>
            </PortfolioProvider>
          </AppModeProvider>
        </MotionProvider>
      </body>
    </html>
  )
}
