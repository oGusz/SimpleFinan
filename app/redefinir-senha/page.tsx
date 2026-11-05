'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { updatePassword } from '@/app/actions/auth'
import { PasswordInput, PasswordRequirements, RequirementItem } from '@/components/password-requirements'
import { Field } from '@/components/ui/field'
import { isStrongPassword } from '@/lib/password-rules'

const REQUIREMENTS_ID = 'nova-senha-requisitos'

export default function RedefinirSenhaPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const result = await updatePassword(password, confirmPassword)
      if (result.error) setError(result.error)
      else setSaved(true)
    } catch (err) {
      console.error('[Auth] Falha ao salvar a nova senha:', err)
      setError(
        err instanceof TypeError || navigator.onLine === false
          ? 'Sem conexão. Verifique sua internet e tente de novo.'
          : 'Não foi possível concluir agora. Tente novamente em instantes.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-dvh flex flex-col justify-center items-center px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)] bg-background text-foreground">
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="flex flex-col items-center gap-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.svg" alt="" className="h-12 w-12" />
          <p className="text-sm font-semibold text-slate-300">SimpleFinan</p>
        </div>

        {saved ? (
          // O link costuma abrir fora do app: mandar para o início deixaria a pessoa logada só neste navegador.
          <div role="status" className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 aria-hidden="true" className="h-8 w-8 text-emerald-400" />
            <h1 className="text-xl font-bold text-white">Senha alterada</h1>
            <p className="text-sm text-slate-300">Senha alterada. Volte ao app e entre com a nova senha.</p>
            <Link href="/" className="flex min-h-11 items-center px-3 text-sm font-medium text-emerald-400 underline">
              Ir para o início
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <h1 className="text-center text-xl font-bold text-white">Crie uma nova senha</h1>

            {error && (
              <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-400">
                <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <Field label="Nova senha">
              {({ id }) => (
                <PasswordInput
                  id={id}
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  describedBy={REQUIREMENTS_ID}
                  toggleSubject="a nova senha"
                />
              )}
            </Field>

            <PasswordRequirements id={REQUIREMENTS_ID} password={password} />

            <Field label="Confirme a nova senha">
              {({ id }) => (
                <PasswordInput
                  id={id}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                  toggleSubject="a confirmação da senha"
                />
              )}
            </Field>

            <div aria-live="polite">
              <ul className="px-1 py-1">
                <RequirementItem met={passwordsMatch} label="As senhas são iguais" />
              </ul>
            </div>

            <button
              type="submit"
              disabled={saving || !isStrongPassword(password) || !passwordsMatch}
              aria-busy={saving}
              className="flex h-12 items-center justify-center rounded-xl bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {saving ? (
                <>
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  <span className="sr-only">Salvando a nova senha</span>
                </>
              ) : (
                'Salvar nova senha'
              )}
            </button>

            <Link
              href="/"
              className="flex min-h-11 items-center justify-center self-center px-3 text-sm font-medium text-emerald-400"
            >
              Voltar para o início
            </Link>
          </form>
        )}
      </div>
    </main>
  )
}
