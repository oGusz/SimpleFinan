'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { Camera, ChevronRight, Download, ExternalLink, Loader2, LogOut, Mail, User } from 'lucide-react'
import { version as appVersion } from '@/package.json'

import { logout, requestPasswordReset } from '@/app/actions/auth'
import { getNativeInfo } from '@/lib/native-bridge'
import { unregisterPushToken } from '@/lib/push-registration'
import { deleteAccount, exportMyData } from '@/app/actions/account'
import { PreferenceToggles } from '@/components/preference-toggles'
import { useToast } from '@/components/ui/toast'
import { useAppMode, type SubscriptionInfo } from '@/context/AppModeContext'
import { formatDate, plural } from '@/lib/format'
import { LEGAL } from '@/lib/legal'
import { isNativeApp } from '@/lib/native-bridge'
import { resizeImage } from '@/lib/resize-image'
import { createClient } from '@/lib/supabase/client'

const MAX_NAME_LENGTH = 80

const CARD = 'space-y-3 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 shadow-sm'
const SECTION_TITLE = 'text-xs font-semibold uppercase tracking-wider text-slate-400'
const ROW_LINK = 'flex min-h-11 w-full items-center justify-between gap-2 text-sm font-medium text-emerald-400'
const SECONDARY_BUTTON =
  'flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 text-sm font-medium text-slate-200 disabled:cursor-default disabled:opacity-50'

const SIGN_IN_LABELS: Record<string, string> = { google: 'Google', email: 'e-mail', apple: 'Apple' }

// Valores que a RevenueCat grava em subscriptions.store. A compra pode ter sido feita em
// outro aparelho, então quem decide é a loja da assinatura, e não o aparelho atual.
const MANAGE_URLS: Record<string, string> = {
  APP_STORE: 'https://apps.apple.com/account/subscriptions',
  MAC_APP_STORE: 'https://apps.apple.com/account/subscriptions',
  PLAY_STORE: 'https://play.google.com/store/account/subscriptions',
}

function manageUrl(subscription: SubscriptionInfo | null) {
  if (subscription?.provider !== 'revenuecat' || !subscription.store) return null
  return MANAGE_URLS[subscription.store.toUpperCase()] ?? null
}

function trialDaysLeft(periodEnd: string) {
  const days = Math.max(1, Math.ceil((new Date(periodEnd).getTime() - Date.now()) / 86_400_000))
  return days === 1 ? 'falta 1 dia' : `faltam ${plural(days, 'dia', 'dias')}`
}

function describePlan(subscription: SubscriptionInfo | null, isPremium: boolean) {
  const end = subscription?.currentPeriodEnd ?? null

  if (isPremium && subscription) {
    if (subscription.provider === 'trial') {
      return { title: end ? `Teste grátis: ${trialDaysLeft(end)}` : 'Teste grátis' }
    }
    if (!end) return { title: 'Premium' }
    if (subscription.status === 'canceled') return { title: `Premium: encerra em ${formatDate(end)}` }
    if (subscription.status === 'billing_issue') {
      return {
        title: `Premium: acesso até ${formatDate(end)}`,
        warning: 'A loja não conseguiu fazer a cobrança. Atualize o pagamento para manter o Premium.',
      }
    }
    return {
      title: subscription.provider === 'revenuecat' ? `Premium: renova em ${formatDate(end)}` : `Premium: válido até ${formatDate(end)}`,
    }
  }

  if (subscription?.plan === 'premium') {
    const endedAt = end && new Date(end).getTime() <= Date.now() ? ` em ${formatDate(end)}` : ''
    return {
      title: subscription.provider === 'trial' ? `Seu teste terminou${endedAt}` : `Sua assinatura terminou${endedAt}`,
      detail: 'Atualização pausada: os bancos conectados deixam de atualizar. Seus dados continuam guardados.',
    }
  }

  return { title: 'Plano Gratuito', detail: 'Você insere contas e investimentos à mão.' }
}

export default function PerfilPage() {
  const { toast } = useToast()
  const { mode, setMode, isPremium, subscription, subscriptionError, reloadSubscription, loading: modeLoading } = useAppMode()
  const supabase = useMemo(() => createClient(), [])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [name, setName] = useState('')
  const [savedName, setSavedName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [signInMethod, setSignInMethod] = useState<string | null>(null)
  const [lastSignIn, setLastSignIn] = useState<string | null>(null)
  const [hasPassword, setHasPassword] = useState(false)

  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [switchingMode, setSwitchingMode] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const [resetting, setResetting] = useState(false)
  const [resetResult, setResetResult] = useState<{ kind: 'notice' | 'error'; text: string } | null>(null)

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportText, setExportText] = useState<string | null>(null)

  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [shownVersion, setShownVersion] = useState(appVersion)

  // No app, vale a versão publicada na loja, e não a do site carregado dentro dele.
  useEffect(() => {
    const nativeVersion = getNativeInfo()?.version
    if (nativeVersion) setShownVersion(nativeVersion)
  }, [])

  useEffect(() => {
    let active = true

    async function loadUserData() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!active) return
        const user = session?.user
        if (!user) {
          setLoadFailed(true)
          return
        }
        const metadata = user.user_metadata || {}
        const displayName = metadata.full_name || metadata.name || user.email?.split('@')[0] || ''
        setName(displayName)
        setSavedName(displayName)
        setEmail(user.email || '')
        setAvatarUrl(metadata.avatar_url || metadata.picture || null)
        setSignInMethod(SIGN_IN_LABELS[user.app_metadata?.provider ?? ''] ?? null)
        setLastSignIn(user.last_sign_in_at ?? null)
        setHasPassword(
          Boolean(user.identities?.some((identity) => identity.provider === 'email')) ||
            Boolean(user.app_metadata?.providers?.includes('email')),
        )
      } catch {
        if (active) setLoadFailed(true)
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadUserData()
    return () => {
      active = false
    }
  }, [supabase])

  // A foto vale ao ser escolhida. Ela vai para o Storage porque, em base64 no user_metadata,
  // incharia o cookie de sessão; a antiga só sai depois que a nova está gravada no perfil.
  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Limpa o campo para a mesma foto poder ser escolhida de novo depois de uma falha.
    event.target.value = ''
    if (!file) return

    const previousUrl = avatarUrl
    let previewUrl: string | null = null
    setUploadingAvatar(true)

    try {
      // Reduzida aqui: fotos de iPhone passariam do limite de 2 MB do Storage.
      const resized = new File([await resizeImage(file)], 'avatar.jpg', { type: 'image/jpeg' })
      previewUrl = URL.createObjectURL(resized)
      setAvatarUrl(previewUrl)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sem sessão')

      const avatars = supabase.storage.from('avatars')
      const { data: previousFiles } = await avatars.list(user.id)

      const path = `${user.id}/${Date.now()}`
      const { error: uploadError } = await avatars.upload(path, resized, { contentType: resized.type })
      if (uploadError) throw uploadError

      const publicUrl = avatars.getPublicUrl(path).data.publicUrl
      const { error: updateError } = await supabase.auth.updateUser({ data: { avatar_url: publicUrl } })
      if (updateError) {
        await avatars.remove([path])
        throw updateError
      }

      if (previousFiles?.length) {
        await avatars.remove(previousFiles.map((previous) => `${user.id}/${previous.name}`))
      }

      setAvatarUrl(publicUrl)
      toast({ message: 'Foto atualizada.', kind: 'success' })
    } catch {
      setAvatarUrl(previousUrl)
      toast({ message: 'Não foi possível salvar essa foto. Tente de novo ou escolha outra.', kind: 'error' })
    } finally {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setUploadingAvatar(false)
    }
  }

  const handleSaveName = async (event: React.FormEvent) => {
    event.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) return
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ data: { full_name: cleanName } })
      if (error) throw error
      setName(cleanName)
      setSavedName(cleanName)
      toast({ message: 'Nome atualizado.', kind: 'success' })
    } catch {
      toast({ message: 'Não foi possível salvar o nome. Verifique a conexão e tente de novo.', kind: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleMode = async () => {
    const next = mode === 'open_finance' ? 'manual' : 'open_finance'
    setSwitchingMode(true)
    const changed = await setMode(next)
    setSwitchingMode(false)
    if (!changed) {
      toast({ message: 'Não foi possível trocar agora. Verifique a conexão e tente de novo.', kind: 'error' })
    }
  }

  const handlePasswordReset = async () => {
    setResetting(true)
    setResetResult(null)
    try {
      const result = await requestPasswordReset(email)
      if (result.error) setResetResult({ kind: 'error', text: result.error })
      else setResetResult({ kind: 'notice', text: result.notice ?? 'Enviamos um link para o seu e-mail.' })
    } catch {
      setResetResult({ kind: 'error', text: 'Não foi possível enviar o link. Verifique a conexão e tente de novo.' })
    } finally {
      setResetting(false)
    }
  }

  // logout() termina em redirect, que chega aqui como rejeição e precisa seguir para o roteador.
  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await unregisterPushToken()
      await logout()
    } catch (error) {
      unstable_rethrow(error)
      setLoggingOut(false)
      toast({ message: 'Não foi possível sair. Verifique a conexão e tente de novo.', kind: 'error' })
    }
  }

  const deliverExport = async (json: string) => {
    const fileName = `simplefinan-dados-${new Date().toISOString().slice(0, 10)}.json`

    // A WebView não baixa arquivos: usa o compartilhamento do aparelho ou mostra o texto.
    if (isNativeApp()) {
      if (navigator.share) {
        try {
          const file = new File([json], fileName, { type: 'application/json' })
          await navigator.share(
            navigator.canShare?.({ files: [file] })
              ? { files: [file], title: 'Meus dados do SimpleFinan' }
              : { text: json, title: 'Meus dados do SimpleFinan' },
          )
          return
        } catch (error) {
          if ((error as Error)?.name === 'AbortError') return
        }
      }
      setExportText(json)
      return
    }

    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    toast({ message: 'Arquivo com seus dados baixado.', kind: 'success' })
  }

  const handleExport = async () => {
    setExporting(true)
    setExportError(null)
    setExportText(null)
    try {
      const result = await exportMyData()
      if (result.error !== undefined) setExportError(result.error)
      else await deliverExport(result.json)
    } catch {
      setExportError('Não foi possível gerar a cópia. Verifique a conexão e tente de novo.')
    } finally {
      setExporting(false)
    }
  }

  const deleteConfirmed = deleteConfirmation.trim().toUpperCase() === 'EXCLUIR'

  const handleDeleteAccount = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      const result = await deleteAccount(deleteConfirmation)
      if (result.error) {
        setDeleteError(result.error)
        setDeleting(false)
        return
      }
      window.location.href = '/login?conta=excluida'
    } catch {
      setDeleteError('Não foi possível excluir a conta. Verifique a conexão e tente de novo.')
      setDeleting(false)
    }
  }

  const plan = describePlan(subscription, isPremium)
  const manageLink = isPremium ? manageUrl(subscription) : null
  const usingBanks = mode === 'open_finance'

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28">
      <header className="flex min-h-11 items-center justify-center">
        <h1 className="text-base font-bold tracking-tight text-white">Meu Perfil</h1>
      </header>

      {loading ? (
        <div role="status" className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" aria-hidden="true" />
          <span className="text-xs font-medium tracking-wide">Carregando dados...</span>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {loadFailed && (
            <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-400">
              Não foi possível carregar seus dados. Verifique a conexão e abra esta tela de novo.
            </p>
          )}

          {/* FOTO E NOME */}
          <div className="flex flex-col items-center justify-center gap-3 pt-2">
            <div className="relative" aria-busy={uploadingAvatar}>
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-24 w-24 rounded-full border-4 border-slate-800 object-cover shadow-xl"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-slate-700 bg-slate-800 text-2xl font-bold text-slate-300 shadow-xl">
                  {savedName ? savedName[0]?.toUpperCase() : <User className="h-8 w-8" aria-hidden="true" />}
                </div>
              )}

              {uploadingAvatar && (
                <div role="status" className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/70">
                  <Loader2 className="h-6 w-6 animate-spin text-white" aria-hidden="true" />
                  <span className="sr-only">Enviando foto...</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                aria-label="Alterar foto"
                className="absolute -right-1 -bottom-1 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2 border-slate-950 bg-emerald-700 text-white shadow-md transition-transform active:scale-90 disabled:opacity-50"
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
              </button>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageChange}
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
              />
            </div>

            <div className="text-center">
              <h2 className="text-lg font-bold text-white">{savedName || 'Usuário'}</h2>
              <p className="text-xs text-slate-400">{email}</p>
            </div>
          </div>

          {/* SEU PLANO */}
          <section className={CARD}>
            <h2 className={SECTION_TITLE}>Seu plano</h2>

            {modeLoading ? (
              <p role="status" className="text-sm text-slate-400">Carregando plano...</p>
            ) : (
              <>
                {subscriptionError ? (
                  <div className="space-y-2">
                    <p role="alert" className="text-sm text-slate-300">Não foi possível confirmar seu plano agora.</p>
                    <button type="button" onClick={() => void reloadSubscription()} className={SECONDARY_BUTTON}>
                      Tentar de novo
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-white">{plan.title}</p>
                    {plan.detail && <p className="text-xs leading-relaxed text-slate-400">{plan.detail}</p>}
                    {plan.warning && (
                      <p role="alert" className="text-xs leading-relaxed text-amber-300">{plan.warning}</p>
                    )}
                  </div>
                )}

                {isPremium ? (
                  <>
                    <Link href="/open-finance" className={ROW_LINK}>
                      <span>Conectar bancos</span>
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Link>

                    {manageLink && (
                      <a href={manageLink} target="_blank" rel="noopener noreferrer" className={ROW_LINK}>
                        <span>Gerenciar assinatura</span>
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    )}

                    <button
                      type="button"
                      role="switch"
                      aria-checked={usingBanks}
                      onClick={handleToggleMode}
                      disabled={switchingMode}
                      className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 border-t border-slate-800/60 pt-3 text-left disabled:cursor-default disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-200">Usar dados dos bancos</span>
                        <span className="block text-xs leading-relaxed text-slate-400">
                          Ligado, o painel e a carteira mostram o que vem dos bancos. Suas contas e ativos manuais
                          ficam ocultos, não apagados.
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${usingBanks ? 'bg-emerald-500' : 'bg-slate-700'}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${usingBanks ? 'left-[18px]' : 'left-0.5'}`} />
                      </span>
                    </button>
                  </>
                ) : (
                  <Link href="/planos" className={ROW_LINK}>
                    <span>Conhecer o plano</span>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                )}
              </>
            )}
          </section>

          {/* INFORMAÇÕES PESSOAIS */}
          <form onSubmit={handleSaveName} className={CARD}>
            <h2 className={SECTION_TITLE}>Informações pessoais</h2>

            <div className="space-y-1">
              <label htmlFor="perfil-nome" className="text-xs font-medium text-slate-400">Nome completo</label>
              <div className="relative flex items-center">
                <User className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                <input
                  id="perfil-nome"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={MAX_NAME_LENGTH}
                  autoComplete="name"
                  placeholder="Seu nome"
                  className="h-11 w-full rounded-xl border border-slate-800 bg-slate-950/80 pr-4 pl-10 text-sm text-foreground transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="perfil-email" className="text-xs font-medium text-slate-400">E-mail</label>
              <div className="relative flex items-center">
                <Mail className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                <input
                  id="perfil-email"
                  type="email"
                  value={email}
                  disabled
                  aria-describedby="perfil-email-dica"
                  className="h-11 w-full cursor-not-allowed rounded-xl border border-slate-800/60 bg-slate-950 pr-4 pl-10 text-sm text-slate-400"
                />
              </div>
              <p id="perfil-email-dica" className="text-xs text-slate-400">Para trocar o e-mail, fale com o suporte</p>
            </div>

            <button
              type="submit"
              disabled={saving || !name.trim() || name.trim() === savedName}
              className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-700 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:cursor-default disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </form>

          <PreferenceToggles />

          {/* ACESSO */}
          <section className={CARD}>
            <h2 className={SECTION_TITLE}>Acesso</h2>
            {signInMethod && <p className="text-sm text-slate-200">Entrada com {signInMethod}</p>}
            {lastSignIn && <p className="text-sm text-slate-400">Último acesso em {formatDate(lastSignIn)}</p>}

            {hasPassword && (
              <div className="space-y-2">
                <button type="button" onClick={handlePasswordReset} disabled={resetting} className={SECONDARY_BUTTON}>
                  {resetting ? 'Enviando...' : 'Alterar senha'}
                </button>
                <p className="text-xs text-slate-400">Enviamos um link para o seu e-mail. A senha só muda depois de abri-lo.</p>
                {resetResult && (
                  <p
                    role={resetResult.kind === 'error' ? 'alert' : 'status'}
                    className={`text-xs leading-relaxed ${resetResult.kind === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}
                  >
                    {resetResult.text}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* CONQUISTAS */}
          <section className={CARD}>
            <h2 className={SECTION_TITLE}>Conquistas</h2>
            <Link href="/conquistas" className={ROW_LINK}>
              <span>Nível, selos e desafio do mês</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>

          {/* AJUDA */}
          <section className={CARD}>
            <h2 className={SECTION_TITLE}>Ajuda e suporte</h2>
            {LEGAL.supportEmail && <p className="text-sm text-slate-200 select-all">{LEGAL.supportEmail}</p>}
            <Link href="/suporte" className={ROW_LINK}>
              <span>Central de suporte</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <p className="text-xs text-slate-400">Versão {shownVersion}</p>
          </section>

          {/* SAIR */}
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-800/80 bg-slate-900/40 text-sm font-semibold text-rose-400 transition-all active:bg-rose-500/10 disabled:cursor-default disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>{loggingOut ? 'Saindo...' : 'Sair'}</span>
          </button>

          {/* DOCUMENTOS */}
          <p className="text-center text-xs text-slate-400">
            <Link href="/termos" className="inline-block py-3 underline">Termos de Uso</Link>
            {' · '}
            <Link href="/privacidade" className="inline-block py-3 underline">Política de Privacidade</Link>
          </p>

          {/* SEUS DADOS */}
          <section className={CARD}>
            <h2 className={SECTION_TITLE}>Seus dados</h2>
            <button type="button" onClick={handleExport} disabled={exporting} className={SECONDARY_BUTTON}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {exporting ? 'Preparando...' : 'Baixar meus dados'}
            </button>
            {exportError && <p role="alert" className="text-xs text-rose-400">{exportError}</p>}
            {exportText !== null && (
              <div className="space-y-1">
                <label htmlFor="perfil-dados" className="text-xs text-slate-400">
                  Selecione o texto abaixo e copie para guardar seus dados.
                </label>
                <textarea
                  id="perfil-dados"
                  readOnly
                  value={exportText}
                  className="h-48 w-full rounded-xl border border-slate-800 bg-slate-950/80 p-3 font-mono text-xs text-slate-300 select-text"
                />
              </div>
            )}
          </section>

          {/* EXCLUIR CONTA */}
          <details className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4">
            <summary className="cursor-pointer py-3 text-sm font-semibold text-rose-400">Excluir minha conta</summary>
            <div className="space-y-3 pb-4">
              <p className="text-xs leading-relaxed text-slate-400">
                Esta ação é definitiva: apaga seus dados e revoga o acesso aos bancos conectados.
                Se você assina o Premium, cancele também na App Store ou no Google Play, pois a
                cobrança é feita pela loja. Digite EXCLUIR para confirmar.
              </p>
              <input
                type="text"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                placeholder="EXCLUIR"
                aria-label="Digite EXCLUIR para confirmar"
                autoCapitalize="characters"
                autoComplete="off"
                className="h-11 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 text-sm text-foreground transition-colors placeholder:text-slate-400 focus:border-rose-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleting || !deleteConfirmed}
                className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-rose-600 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:cursor-default disabled:opacity-40"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {deleting ? 'Excluindo...' : 'Excluir definitivamente'}
              </button>
              {deleteError && <p role="alert" className="text-xs leading-relaxed text-rose-400">{deleteError}</p>}
            </div>
          </details>
        </div>
      )}
    </main>
  )
}
