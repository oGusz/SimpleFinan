'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { login, signup } from '@/app/actions/auth'
import { Mail, Lock, AlertCircle, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleOAuth = async (provider: 'google' | 'apple' | 'facebook') => {
    setError(null)
    setLoading(true)

    const redirectTo = `${window.location.origin}/auth/callback`
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const action = mode === 'login' ? login : signup
    const res = await action(formData)

    if (res?.error) {
      setError(res.error)
      setLoading(false)
    } else {
      router.refresh()
      router.push('/')
    }
  }

  return (
    <main className="min-h-screen flex flex-col justify-center items-center px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] select-none bg-background text-foreground">
      <div className="w-full max-w-sm flex flex-col gap-6">
        
        {/* CABEÇALHO */}
        <div className="text-center flex flex-col gap-1.5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xl shadow-inner">
            $
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-2">SimpleFinan</h1>
          <p className="text-xs text-muted-foreground">
            Controle financeiro e investimentos na palma da mão
          </p>
        </div>

        {/* SEGMENTED CONTROL (IOS STYLE) */}
        <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null) }}
            className={`py-2 rounded-lg transition-all ${
              mode === 'login'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(null) }}
            className={`py-2 rounded-lg transition-all ${
              mode === 'signup'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Cadastrar
          </button>
        </div>

        {/* FEEDBACK DE ERRO */}
        {error && (
          <div className="flex items-center gap-2 p-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* BOTÕES SOCIAIS (TOUCH TARGETS OTIMIZADOS) */}
        <div className="flex flex-col gap-2.5">
          {/* GOOGLE */}
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            disabled={loading}
            className="w-full h-12 flex items-center justify-center gap-3 rounded-xl bg-slate-900 border border-slate-800 text-sm font-medium hover:bg-slate-800/80 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continuar com Google
          </button>

          {/* APPLE */}
          <button
            type="button"
            onClick={() => handleOAuth('apple')}
            disabled={loading}
            className="w-full h-12 flex items-center justify-center gap-3 rounded-xl bg-white text-black text-sm font-semibold hover:bg-slate-100 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <svg className="h-4 w-4 fill-current" viewBox="0 0 170 170">
              <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.58-7.7-11.64-13.99-6.43-10.02-11.2-21.73-14.31-35.12-3.11-13.39-4.67-25.79-4.67-37.2 0-14.14 3.4-25.96 10.18-35.47 6.79-9.51 15.42-14.38 25.9-14.6 4.9 0 10.42 1.34 16.56 4.02 6.14 2.68 10.11 4.09 11.91 4.24 1.48-.2 5.56-1.63 12.22-4.29 6.67-2.66 12.18-3.83 16.53-3.51 12.12.63 21.63 4.8 28.52 12.51-10.49 6.33-15.63 15.11-15.42 26.33.2 8.78 3.52 16.14 9.97 22.09 6.44 5.95 14.16 9.38 23.14 10.28-2.12 6.32-4.66 12.98-7.61 19.98zm-32.3-108.64c0 7.18-2.67 14.07-8.02 20.67-5.35 6.6-11.83 10.59-19.44 11.98-.32-1.27-.48-2.48-.48-3.63 0-6.97 2.82-13.88 8.46-20.73 5.64-6.85 12.29-10.74 19.94-11.67.11 1.13.16 2.26.16 3.38z" />
            </svg>
            Continuar com Apple
          </button>

          {/* FACEBOOK */}
          <button
            type="button"
            onClick={() => handleOAuth('facebook')}
            disabled={loading}
            className="w-full h-12 flex items-center justify-center gap-3 rounded-xl bg-[#1877F2]/10 text-[#1877F2] border border-[#1877F2]/30 text-sm font-semibold hover:bg-[#1877F2]/20 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Continuar com Facebook
          </button>
        </div>

        {/* DIVISOR */}
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <span className="relative bg-background px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            ou com e-mail
          </span>
        </div>

        {/* FORMULÁRIO TRADICIONAL */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative flex items-center">
            <Mail className="absolute left-3.5 h-4 w-4 text-slate-500 pointer-events-none" />
            <input
              name="email"
              type="email"
              required
              placeholder="seu@email.com"
              className="w-full h-12 rounded-xl bg-slate-900 border border-slate-800 pl-10 pr-4 text-sm text-foreground placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <div className="relative flex items-center">
            <Lock className="absolute left-3.5 h-4 w-4 text-slate-500 pointer-events-none" />
            <input
              name="password"
              type="password"
              required
              placeholder="Sua senha"
              className="w-full h-12 rounded-xl bg-slate-900 border border-slate-800 pl-10 pr-4 text-sm text-foreground placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 mt-2 rounded-xl bg-emerald-600 font-semibold text-sm text-white shadow-lg shadow-emerald-950/20 active:scale-[0.98] hover:bg-emerald-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === 'login' ? (
              'Entrar'
            ) : (
              'Criar conta'
            )}
          </button>
        </form>

      </div>
    </main>
  )
}