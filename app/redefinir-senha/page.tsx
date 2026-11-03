'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock } from 'lucide-react'
import { updatePassword } from '@/app/actions/auth'
import { PasswordRequirements, RequirementItem } from '@/components/password-requirements'
import { isStrongPassword } from '@/lib/password-rules'

const INPUT_CLASS =
  'w-full h-12 rounded-xl bg-slate-900 border border-slate-800 pl-10 pr-4 text-base select-text text-foreground placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-colors'

export default function RedefinirSenhaPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const result = await updatePassword(password, confirmPassword)
    if (result.error) {
      setError(result.error)
      setSaving(false)
      return
    }
    router.replace('/')
  }

  return (
    <main className="min-h-screen flex flex-col justify-center items-center px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-3">
        <h1 className="text-center text-xl font-bold text-white">Crie uma nova senha</h1>

        {error && (
          <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400">{error}</p>
        )}

        <div className="relative flex items-center">
          <Lock className="absolute left-3.5 h-4 w-4 text-slate-500 pointer-events-none" />
          <input
            type="password"
            required
            autoComplete="new-password"
            placeholder="Nova senha"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <PasswordRequirements password={password} />

        <div className="relative flex items-center">
          <Lock className="absolute left-3.5 h-4 w-4 text-slate-500 pointer-events-none" />
          <input
            type="password"
            required
            autoComplete="new-password"
            placeholder="Confirme a nova senha"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <ul className="px-1 py-1">
          <RequirementItem met={passwordsMatch} label="As senhas são iguais" />
        </ul>

        <button
          type="submit"
          disabled={saving || !isStrongPassword(password) || !passwordsMatch}
          className="flex h-12 items-center justify-center rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar nova senha'}
        </button>
      </form>
    </main>
  )
}
