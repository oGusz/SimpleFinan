'use client'

import { useEffect, useState } from 'react'
import { BarChart3, BellRing, ScanFace } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { disableLock, enableLock, isLockEnabled, isLockSupported } from '@/lib/app-lock'
import { isAnalyticsAvailable, isAnalyticsEnabled, setAnalyticsEnabled } from '@/lib/analytics'

function Toggle({ label, hint, checked, onChange, icon: Icon }: {
  label: string
  hint: string
  checked: boolean
  onChange: () => void
  icon: typeof BellRing
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="w-full flex items-center justify-between gap-3 p-4 text-left active:bg-slate-800/50 transition-colors"
    >
      <span className="flex items-center gap-3">
        <Icon className="h-4 w-4 shrink-0 text-emerald-400" />
        <span>
          <span className="block text-xs font-medium text-slate-200">{label}</span>
          <span className="block text-[11px] text-slate-500">{hint}</span>
        </span>
      </span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-700'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

export function PreferenceToggles() {
  const [lockSupported, setLockSupported] = useState(false)
  const [lockOn, setLockOn] = useState(false)
  const [remindersOn, setRemindersOn] = useState(true)
  const [metricsAvailable, setMetricsAvailable] = useState(false)
  const [metricsOn, setMetricsOn] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    isLockSupported().then(setLockSupported)
    setLockOn(isLockEnabled())
    setMetricsAvailable(isAnalyticsAvailable())
    setMetricsOn(isAnalyticsEnabled())
    createClient().auth.getSession().then(({ data }) => {
      setRemindersOn(data.session?.user.user_metadata?.email_reminders !== false)
    })
  }, [])

  const toggleLock = async () => {
    setError(null)
    if (lockOn) {
      disableLock()
      setLockOn(false)
      return
    }
    try {
      await enableLock()
      setLockOn(true)
    } catch {
      setError('Não foi possível ativar o bloqueio neste aparelho.')
    }
  }

  const toggleReminders = async () => {
    const next = !remindersOn
    setError(null)
    setRemindersOn(next)
    const { error: updateError } = await createClient().auth.updateUser({ data: { email_reminders: next } })
    if (updateError) {
      setRemindersOn(!next)
      setError('Não foi possível salvar a preferência.')
    }
  }

  const toggleMetrics = () => {
    setAnalyticsEnabled(!metricsOn)
    setMetricsOn(!metricsOn)
  }

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 divide-y divide-slate-800/60 shadow-sm overflow-hidden">
      {lockSupported && (
        <Toggle
          icon={ScanFace}
          label="Bloqueio com Face ID"
          hint="Pede sua biometria ao abrir o app neste aparelho"
          checked={lockOn}
          onChange={toggleLock}
        />
      )}
      <Toggle
        icon={BellRing}
        label="Lembretes por e-mail"
        hint="Vencimentos próximos e resumo mensal"
        checked={remindersOn}
        onChange={toggleReminders}
      />
      {metricsAvailable && (
        <Toggle
          icon={BarChart3}
          label="Métricas de uso"
          hint="Ajudam a melhorar o app, com valores e textos ocultos"
          checked={metricsOn}
          onChange={toggleMetrics}
        />
      )}
      {error && <p className="p-3 text-xs text-rose-400">{error}</p>}
    </div>
  )
}
