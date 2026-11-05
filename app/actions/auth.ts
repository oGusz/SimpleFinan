'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAppUrl } from '@/lib/email/send'
import { createClient } from '@/lib/supabase/server'
import { isStrongPassword } from '@/lib/password-rules'
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'

const MAX_NAME_LENGTH = 80

const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos. Se você criou a conta com Google, entre pelo Google.',
  email_not_confirmed: 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
  weak_password: 'Use uma senha mais forte, misturando letras e números.',
  email_address_invalid: 'Informe um e-mail válido.',
  over_email_send_rate_limit: 'Muitos e-mails enviados em pouco tempo. Aguarde e tente novamente.',
  over_request_rate_limit: 'Muitas tentativas em pouco tempo. Aguarde e tente novamente.',
  signup_disabled: 'Novos cadastros estão desativados no momento.',
}

function authErrorMessage(error: { code?: string; message: string }) {
  const known = error.code ? AUTH_ERRORS[error.code] : undefined
  if (!known) console.error('[Auth] Erro não mapeado:', error.code, error.message)
  return known ?? TEMPORARY_FAILURE
}

const RESET_NOTICE =
  'Se este e-mail tiver conta com senha, enviamos um link para criar uma nova. Veja também o spam.'
const RESEND_NOTICE = 'Se este e-mail ainda precisar de confirmação, enviamos um novo link. Veja também o spam.'
const LINK_EXPIRED = 'Este link expirou. Peça outro na tela de entrada.'
const TEMPORARY_FAILURE = 'Não foi possível concluir agora. Tente novamente em instantes.'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_TOKEN_HASH_LENGTH = 512
const TOO_MANY_ATTEMPTS = 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.'
const LOGIN_WINDOW_SECONDS = 15 * 60
const SIGNUP_WINDOW_SECONDS = 60 * 60

/** A Vercel sobrescreve x-forwarded-for, então quem chama não consegue falsificar o IP. */
async function getClientIp() {
  const requestHeaders = await headers()
  return requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido'
}

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Preencha todos os campos.' }
  }

  // O limite por e-mail barra quem tenta muitas senhas em uma conta; o por IP, quem varia as contas.
  const [emailAllowed, ipAllowed] = await Promise.all([
    consumeRateLimit(rateLimitKey('login-email', email), 10, LOGIN_WINDOW_SECONDS),
    consumeRateLimit(rateLimitKey('login-ip', await getClientIp()), 30, LOGIN_WINDOW_SECONDS),
  ])
  if (!emailAllowed || !ipAllowed) return { error: TOO_MANY_ATTEMPTS }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    // A tela usa a marca para oferecer o reenvio do link junto do erro.
    return { error: authErrorMessage(error), needsConfirmation: error.code === 'email_not_confirmed' }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signup(formData: FormData) {
  const fullName = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = formData.get('confirmPassword')

  if (!fullName || !email || !password) {
    return { error: 'Preencha todos os campos.' }
  }
  if (fullName.length > MAX_NAME_LENGTH) {
    return { error: `O nome pode ter no máximo ${MAX_NAME_LENGTH} caracteres.` }
  }
  if (!isStrongPassword(password)) {
    return { error: 'A senha não atende a todos os requisitos.' }
  }
  // A tela não pede mais a repetição da senha, mas quem ainda a enviar precisa acertar.
  if (confirmPassword !== null && password !== confirmPassword) {
    return { error: 'As senhas não são iguais.' }
  }

  const allowed = await consumeRateLimit(rateLimitKey('signup-ip', await getClientIp()), 10, SIGNUP_WINDOW_SECONDS)
  if (!allowed) return { error: TOO_MANY_ATTEMPTS }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  })

  if (error) {
    return { error: authErrorMessage(error) }
  }

  // A resposta é a mesma para e-mail novo e repetido: do contrário, qualquer pessoa
  // descobriria quem usa um app financeiro testando endereços nesta tela.
  // E-mail repetido chega aqui como um usuário sem identidades, e nada é enviado.
  // Se a confirmação de e-mail estiver ativa no Supabase, a sessão ainda não existe.
  if (data.user && !data.session) {
    return { notice: `Enviamos um link para ${email}. Abra-o e volte aqui para entrar.` }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function requestPasswordReset(email: string) {
  const cleanEmail = String(email ?? '').trim()
  if (!EMAIL_PATTERN.test(cleanEmail)) return { error: 'Informe um e-mail válido.' }

  const [emailAllowed, ipAllowed] = await Promise.all([
    consumeRateLimit(rateLimitKey('reset-email', cleanEmail), 3, SIGNUP_WINDOW_SECONDS),
    consumeRateLimit(rateLimitKey('reset-ip', await getClientIp()), 10, SIGNUP_WINDOW_SECONDS),
  ])
  if (!emailAllowed || !ipAllowed) return { error: TOO_MANY_ATTEMPTS }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: `${getAppUrl()}/auth/callback?next=/redefinir-senha`,
  })
  // Só registra: a resposta não pode indicar se o e-mail existe.
  if (error) console.error('[Auth] Falha ao pedir nova senha:', error.code)

  return { notice: RESET_NOTICE }
}

export async function resendConfirmation(email: string) {
  const cleanEmail = String(email ?? '').trim()
  if (!EMAIL_PATTERN.test(cleanEmail)) return { error: 'Informe um e-mail válido.' }

  const [emailAllowed, ipAllowed] = await Promise.all([
    consumeRateLimit(rateLimitKey('resend-email', cleanEmail), 3, SIGNUP_WINDOW_SECONDS),
    consumeRateLimit(rateLimitKey('resend-ip', await getClientIp()), 10, SIGNUP_WINDOW_SECONDS),
  ])
  if (!emailAllowed || !ipAllowed) return { error: TOO_MANY_ATTEMPTS }

  const supabase = await createClient()
  const { error } = await supabase.auth.resend({ type: 'signup', email: cleanEmail })
  // Só registra: a resposta não pode indicar se o e-mail existe ou já foi confirmado.
  if (error) console.error('[Auth] Falha ao reenviar a confirmação:', error.code)

  return { notice: RESEND_NOTICE }
}

/**
 * Valida o link do e-mail sem depender do cookie PKCE, por isso funciona em qualquer navegador.
 * A página só chama esta ação depois do toque em Continuar: filtros de e-mail abrem os links
 * com GET e gastariam o token de uso único antes da pessoa.
 */
export async function confirmEmailToken(tokenHash: string, type: string) {
  if (
    typeof tokenHash !== 'string' ||
    !tokenHash ||
    tokenHash.length > MAX_TOKEN_HASH_LENGTH ||
    (type !== 'recovery' && type !== 'email')
  ) {
    return { error: LINK_EXPIRED }
  }

  const allowed = await consumeRateLimit(rateLimitKey('confirm-ip', await getClientIp()), 30, LOGIN_WINDOW_SECONDS)
  if (!allowed) return { error: TOO_MANY_ATTEMPTS, retryable: true }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error) {
    console.error('[Auth] Falha ao validar o link:', error.code, error.status)
    // Instabilidade não gasta o token: dizer que expirou faria a pessoa desistir de um link válido.
    const isTemporary = error.status === undefined || error.status === 0 || error.status >= 500
    return isTemporary ? { error: TEMPORARY_FAILURE, retryable: true } : { error: LINK_EXPIRED }
  }

  revalidatePath('/', 'layout')
  return { success: true, type }
}

export async function updatePassword(password: string, confirmPassword: string) {
  if (typeof password !== 'string' || !isStrongPassword(password)) {
    return { error: 'A senha não atende a todos os requisitos.' }
  }
  if (password !== confirmPassword) return { error: 'As senhas não são iguais.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'O link expirou. Peça uma nova senha na tela de entrada.' }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    if (error.code === 'same_password') return { error: 'Escolha uma senha diferente da atual.' }
    return { error: authErrorMessage(error) }
  }
  return { success: true }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}