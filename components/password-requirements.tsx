'use client'

import { useState } from 'react'
import { Check, Eye, EyeOff, Lock } from 'lucide-react'
import { PASSWORD_RULES } from '@/lib/password-rules'

export function RequirementItem({ met, label }: { met: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 text-xs transition-colors duration-200 ${met ? 'text-emerald-400' : 'text-slate-400'}`}>
      <span
        aria-hidden="true"
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
          met ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-700'
        }`}
      >
        {met && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      {/* A cor e o ícone não chegam ao leitor de tela: é este texto que anuncia a mudança. */}
      <span className="sr-only">{met ? 'Atendido: ' : 'Pendente: '}</span>
      {label}
    </li>
  )
}

export function PasswordRequirements({ password, id }: { password: string; id?: string }) {
  return (
    <div id={id} aria-live="polite">
      <ul className="grid grid-cols-1 gap-1.5 px-1 py-1">
        {PASSWORD_RULES.map((rule) => (
          <RequirementItem key={rule.label} met={rule.test(password)} label={rule.label} />
        ))}
      </ul>
    </div>
  )
}

export interface PasswordInputProps {
  id: string
  name?: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  describedBy?: string
  /** Nome do que o botão revela, para diferenciar os dois campos da troca de senha. */
  toggleSubject?: string
}

export function PasswordInput({
  id,
  name,
  value,
  onChange,
  autoComplete,
  describedBy,
  toggleSubject = 'a senha',
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative flex items-center">
      <Lock aria-hidden="true" className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-describedby={describedBy}
        className="w-full h-12 rounded-xl bg-slate-900 border border-slate-800 pl-10 pr-12 text-base text-foreground placeholder:text-slate-400 focus:border-emerald-500 transition-colors"
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${toggleSubject}`}
        aria-pressed={visible}
        className="absolute right-0 flex h-12 w-12 items-center justify-center rounded-xl text-slate-400 hover:text-slate-200 transition-colors"
      >
        {visible ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
      </button>
    </div>
  )
}
