import { Check } from 'lucide-react'
import { PASSWORD_RULES } from '@/lib/password-rules'

export function RequirementItem({ met, label }: { met: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 text-xs transition-colors duration-200 ${met ? 'text-emerald-400' : 'text-slate-500'}`}>
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
          met ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-700'
        }`}
      >
        {met && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      {label}
    </li>
  )
}

export function PasswordRequirements({ password }: { password: string }) {
  return (
    <ul className="grid grid-cols-1 gap-1.5 px-1 py-1">
      {PASSWORD_RULES.map((rule) => (
        <RequirementItem key={rule.label} met={rule.test(password)} label={rule.label} />
      ))}
    </ul>
  )
}
