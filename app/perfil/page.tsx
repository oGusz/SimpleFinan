'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Camera,
  User,
  Mail,
  ShieldCheck,
  Trash2,
  LogOut,
  Check,
  AlertCircle,
  Loader2,
  ChevronRight,
  Zap,
  SlidersHorizontal,
} from 'lucide-react'
import { motion } from 'framer-motion'

import { createClient } from '@/lib/supabase/client'
import { logout } from '@/app/actions/auth'
import { BottomNav } from '@/components/bottom-nav'
import { useAppMode } from '@/context/AppModeContext'

export default function PerfilPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const supabase = createClient()

  const { mode, setMode, loading: modeLoading } = useAppMode()
  const [switchingMode, setSwitchingMode] = useState(false)

  // 1. Carregar dados do usuário
  useEffect(() => {
    async function loadUserData() {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const metadata = user.user_metadata || {}
        setName(
          metadata.full_name ||
          metadata.name ||
          user.email?.split('@')[0] ||
          ''
        )
        setEmail(user.email || '')
        setAvatarUrl(metadata.avatar_url || metadata.picture || null)
      }
      setLoading(false)
    }

    loadUserData()
  }, [])

  // 2. Manipulação de upload de foto
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 3 * 1024 * 1024) {
      setErrorMsg('A imagem deve ter no máximo 3MB.')
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      setAvatarUrl(reader.result as string)
      setSuccessMsg('Foto selecionada! Toque em "Salvar alterações" abaixo.')
      setErrorMsg(null)
    }
    reader.readAsDataURL(file)
  }

  // 3. Salvar alterações no Supabase Auth
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: name.trim(),
          avatar_url: avatarUrl,
        },
      })

      if (error) throw error
      setSuccessMsg('Perfil atualizado com sucesso!')
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao atualizar informações.')
    } finally {
      setSaving(false)
    }
  }

  // 4. Limpar cache de carteira
  const handleClearLocalData = () => {
    if (confirm('Deseja limpar as ordens e preferências salvas localmente no app?')) {
      localStorage.removeItem('carteira_sections_order_v1')
      localStorage.removeItem('@simplefinan:mode')
      alert('Dados locais limpos com sucesso!')
    }
  }

  // 5. Trocar modo de operação
  const handleToggleMode = async () => {
    setSwitchingMode(true)
    const newMode = mode === 'manual' ? 'open_finance' : 'manual'
    await setMode(newMode)
    setSwitchingMode(false)
    setSuccessMsg(
      newMode === 'open_finance'
        ? '🚀 Modo Open Finance ativado! Acesse a página de Open Finance para conectar seus bancos.'
        : '📝 Modo Manual ativado. Você pode inserir dados manualmente.'
    )
    setTimeout(() => setSuccessMsg(null), 5000)
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28 select-none">

        {/* CABEÇALHO */}
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-slate-300 active:scale-90 transition-all shadow-sm"
            aria-label="Voltar para o Início"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-base font-bold text-white tracking-tight">Meu Perfil</h1>
          <div className="w-10" />
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <span className="text-xs font-medium tracking-wide">Carregando dados...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-5">

            {/* AVATAR */}
            <div className="flex flex-col items-center justify-center gap-3 pt-2">
              <div className="relative">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={name}
                    referrerPolicy="no-referrer"
                    className="h-24 w-24 rounded-full object-cover border-4 border-slate-800 shadow-xl"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-800 border-4 border-slate-700 text-2xl font-bold text-slate-300 shadow-xl">
                    {name ? name[0]?.toUpperCase() : 'U'}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-md border-2 border-slate-950 active:scale-90 transition-transform"
                  aria-label="Alterar foto"
                >
                  <Camera className="h-4 w-4" />
                </button>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              <div className="text-center">
                <h2 className="text-lg font-bold text-white">{name || 'Usuário'}</h2>
                <p className="text-xs text-slate-400">{email}</p>
              </div>
            </div>

            {/* MENSAGENS DE FEEDBACK */}
            {successMsg && (
              <div className="flex items-center gap-2 p-3 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <Check className="h-4 w-4 shrink-0" />
                <p>{successMsg}</p>
              </div>
            )}
            {errorMsg && (
              <div className="flex items-center gap-2 p-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>{errorMsg}</p>
              </div>
            )}

            {/* MODO DE OPERAÇÃO */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 shadow-sm backdrop-blur-sm space-y-3">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Modo de Operação
              </span>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl border shrink-0 transition-colors ${
                    mode === 'open_finance'
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-slate-800 border-slate-700'
                  }`}>
                    {mode === 'open_finance' ? (
                      <Zap className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <SlidersHorizontal className="h-5 w-5 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      {mode === 'open_finance' ? 'Open Finance' : 'Manual'}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {mode === 'open_finance'
                        ? 'Sincronização automática com bancos'
                        : 'Inserção manual de dados'}
                    </p>
                  </div>
                </div>

                {/* Toggle Switch */}
                <button
                  type="button"
                  onClick={handleToggleMode}
                  disabled={switchingMode || modeLoading}
                  aria-label="Alternar modo"
                  className="relative shrink-0 disabled:opacity-50"
                >
                  {switchingMode ? (
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  ) : (
                    <motion.div
                      className={`relative w-12 h-6 rounded-full border transition-colors ${
                        mode === 'open_finance'
                          ? 'bg-emerald-500 border-emerald-400'
                          : 'bg-slate-700 border-slate-600'
                      }`}
                    >
                      <motion.div
                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md"
                        animate={{ left: mode === 'open_finance' ? '26px' : '2px' }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    </motion.div>
                  )}
                </button>
              </div>

              {/* Link para página de Open Finance quando modo está ativo */}
              {mode === 'open_finance' && (
                <Link
                  href="/open-finance"
                  className="flex items-center justify-between w-full h-10 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors active:scale-[0.98]"
                >
                  <span>Gerenciar Bancos Conectados</span>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              )}

              <p className="text-[11px] text-slate-600 leading-relaxed">
                {mode === 'open_finance'
                  ? '🔒 Modo Pro: dados sincronizados automaticamente via Open Finance (Pluggy).'
                  : '📝 Modo Gratuito: insira contas e investimentos manualmente.'}
              </p>
            </div>

            {/* FORMULÁRIO DE EDIÇÃO */}
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 shadow-sm backdrop-blur-sm space-y-3">
                <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Informações Pessoais
                </span>

                {/* Nome */}
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">Nome completo</label>
                  <div className="relative flex items-center">
                    <User className="absolute left-3.5 h-4 w-4 text-slate-500 pointer-events-none" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="Seu nome"
                      className="w-full h-11 rounded-xl bg-slate-950/80 border border-slate-800 pl-10 pr-4 text-sm text-foreground placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                {/* E-mail */}
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">E-mail associado</label>
                  <div className="relative flex items-center opacity-70">
                    <Mail className="absolute left-3.5 h-4 w-4 text-slate-500 pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      disabled
                      className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800/60 pl-10 pr-4 text-sm text-slate-400 cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full h-12 rounded-xl bg-blue-600 font-semibold text-sm text-white shadow-lg shadow-blue-950/30 active:scale-[0.98] hover:bg-blue-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar alterações'}
              </button>
            </form>

            {/* AJUSTES E SEGURANÇA */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 divide-y divide-slate-800/60 shadow-sm backdrop-blur-sm overflow-hidden">
              <button
                type="button"
                onClick={handleClearLocalData}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-800/30 active:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Trash2 className="h-4 w-4 text-slate-400" />
                  <span className="text-xs font-medium text-slate-200">Limpar cache da carteira</span>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </button>

              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-medium text-slate-200">Segurança & Autenticação</span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">Supabase Ativo</span>
              </div>
            </div>

            {/* LOG OUT */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-1 shadow-sm">
              <button
                type="button"
                onClick={() => logout()}
                className="w-full h-12 flex items-center justify-center gap-2 text-rose-500 hover:text-rose-400 text-sm font-semibold rounded-xl active:bg-rose-500/10 transition-all"
              >
                <LogOut className="h-4 w-4" />
                <span>Log Out</span>
              </button>
            </div>

          </div>
        )}
      </main>

      <BottomNav />
    </>
  )
}
