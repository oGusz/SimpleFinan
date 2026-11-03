import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Só aceita caminhos internos: "@site.com" ou "//site.com" levariam para outro domínio.
  const requestedNext = searchParams.get('next') ?? '/'
  const next = /^\/(?![/\\])/.test(requestedNext) ? requestedNext : '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[Auth] Falha ao trocar o código de login:', error.code, error.message)
  }

  return NextResponse.redirect(`${origin}/login?error=Falha+ao+autenticar+com+provedor`)
}