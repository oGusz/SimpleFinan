'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAppUrl } from '@/lib/email/send'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isStrongPassword } from '@/lib/password-rules'
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
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
  return known ?? 'Não foi possível concluir agora. Tente novamente em instantes.'
}

const SIGNUP_NOTICE =
  'Quase lá! Abra o link enviado para o seu e-mail (veja também o spam) e depois entre aqui. Se este e-mail já tiver conta, entre com sua senha ou com o Google.'
const RESET_NOTICE =
  'Se este e-mail tiver conta com senha, enviamos um link para criar uma nova. Abra-o neste mesmo navegador.'
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
    return { error: authErrorMessage(error) }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

/** Roda sem sessão quando a confirmação de e-mail está ativa, por isso usa o cliente admin. */
async function saveSignupAvatar(userId: string, fullName: string, avatar: File) {
  const bytes = Buffer.from(await avatar.arrayBuffer())
  if (bytes.length > MAX_AVATAR_BYTES || !isSupportedImage(bytes)) return false

  try {
    const admin = createAdminClient()
    const path = `${userId}/${Date.now()}`
    const { error: uploadError } = await admin.storage
      .from('avatars')
      .upload(path, bytes, { contentType: avatar.type })
    if (uploadError) throw uploadError

    const avatarUrl = admin.storage.from('avatars').getPublicUrl(path).data.publicUrl
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: { full_name: fullName, avatar_url: avatarUrl },
    })
    if (updateError) throw updateError
    return true
  } catch (error) {
    console.error('[Auth] Falha ao salvar a foto do cadastro:', error)
    return false
  }
}

function isSupportedImage(bytes: Buffer) {
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPng = bytes.subarray(0, 4).toString('hex') === '89504e47'
  const isWebp =
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  return isJpeg || isPng || isWebp
}

export async function signup(formData: FormData) {
  const fullName = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')
  const avatar = formData.get('avatar')

  if (!fullName || !email || !password) {
    return { error: 'Preencha todos os campos.' }
  }
  if (fullName.length > MAX_NAME_LENGTH) {
    return { error: `O nome pode ter no máximo ${MAX_NAME_LENGTH} caracteres.` }
  }
  if (!isStrongPassword(password)) {
    return { error: 'A senha não atende a todos os requisitos.' }
  }
  if (password !== confirmPassword) {
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
  const isNewUser = Boolean(data.user && data.user.identities?.length !== 0)

  if (isNewUser && data.user && avatar instanceof File && avatar.size > 0) {
    await saveSignupAvatar(data.user.id, fullName, avatar)
  }

  // Se a confirmação de e-mail estiver ativa no Supabase, a sessão ainda não existe
  if (data.user && !data.session) {
    return { notice: SIGNUP_NOTICE }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function requestPasswordReset(email: string) {
  const cleanEmail = String(email ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return { error: 'Informe um e-mail válido.' }

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

export async function updatePassword(password: string, confirmPassword: string) {
  if (typeof password !== 'string' || !isStrongPassword(password)) {
    return { error: 'A senha não atende a todos os requisitos.' }
  }
  if (password !== confirmPassword) return { error: 'As senhas não são iguais.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'O link expirou. Peça uma nova senha na tela de login.' }

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