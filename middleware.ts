import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export default async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getClaims valida a assinatura do token localmente (chave ES256 do projeto) e renova a
  // sessão quando precisa. getUser iria ao Supabase em toda navegação e Server Action.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims

  const isAuthPage = request.nextUrl.pathname.startsWith('/login')

  // /auth/callback precisa ser público: é nele que o login social cria a sessão.
  // As lojas exigem que /privacidade e /termos abram sem login.
  const isPublicPath = ['/api', '/auth', '/privacidade', '/termos'].some((path) =>
    request.nextUrl.pathname.startsWith(path)
  )

  // Redireciona usuários não autenticados para /login
  if (!user && !isAuthPage && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redireciona quem já está autenticado para o painel principal
  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    // /monitoring é o túnel do Sentry: erros de quem está sem login também precisam chegar.
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}