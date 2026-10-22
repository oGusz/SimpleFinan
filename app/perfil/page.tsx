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
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { logout } from '@/app/actions/auth'
import { BottomNav } from '@/components/bottom-nav'

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

  // 1. Carrega as informações atuais do usuário autenticado
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

  // 2. Manipulação de upload de foto com compressão simples para Base64
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Limite de 3MB
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

  // 3. Salvar as alterações no Supabase Auth
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

      if (error) {
        throw error
      }

      setSuccessMsg('Perfil atualizado com sucesso!')
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao atualizar informações.')
    } finally {
      setSaving(false)
    }
  }

  // 4. Limpar cache de carteira do dispositivo
  const handleClearLocalData = () => {
    if (confirm('Deseja limpar as ordens e preferências salvas localmente no app?')) {
      localStorage.removeItem('carteira_sections_order_v1')
      alert('Dados locais limpos com sucesso!')
    }
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28 select-none">
        
        {/* CABEÇALHO COM BOTÃO VOLTAR */}
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-slate-300 active:scale-90 transition-all shadow-sm"
            aria-label="Voltar para o Início"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-base font-bold text-white tracking-tight">Meu Perfil</h1>
          <div className="w-10" /> {/* Espaçador de alinhamento */}
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <span className="text-xs font-medium tracking-wide">Carregando dados...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            
            {/* SEÇÃO DO AVATAR COM DISPARADOR DE CÂMERA */}
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

            {/* FORMULÁRIO DE EDIÇÃO (CARD AGRUPADO IOS) */}
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 shadow-sm backdrop-blur-sm space-y-3">
                <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Informações Pessoais
                </span>

                {/* Campo de Nome */}
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

                {/* Campo de E-mail (Leitura) */}
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

              {/* Botão de Salvar Alterações */}
              <button
                type="submit"
                disabled={saving}
                className="w-full h-12 rounded-xl bg-blue-600 font-semibold text-sm text-white shadow-lg shadow-blue-950/30 active:scale-[0.98] hover:bg-blue-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Salvar alterações'
                )}
              </button>
            </form>

            {/* SEÇÃO DE AJUSTES E ARMAZENAMENTO */}
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

            {/* BOTÃO LOG OUT (ESTILO REFERÊNCIA: TEXTO EM VERMELHO CENTRALIZADO) */}
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

      {/* BARRA INFERIOR FIXA */}
      <BottomNav
        onQuickAction={() => {
          window.location.href = '/'
        }}
      />
    </>
  )
}