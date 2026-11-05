'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { BarChart3, BellRing, Mail, ScanFace } from 'lucide-react'
import { getReminderAvailability } from '@/app/actions/preferences'
import { createClient } from '@/lib/supabase/client'
import { disableLock, enableLock, isLockEnabled, isLockSupported } from '@/lib/app-lock'
import { isAnalyticsAvailable, isAnalyticsEnabled, setAnalyticsEnabled, subscribeAnalyticsConsent } from '@/lib/analytics'
import { getNativeInfo, requestPushRegistration } from '@/lib/native-bridge'

function Toggle({ label, hint, checked, onChange, icon: Icon, disabled }: {
  label: string
  hint: string
  checked: boolean
  onChange: () => void
  icon: typeof BellRing
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 p-4 text-left transition-colors active:bg-slate-800/50 disabled:cursor-default disabled:opacity-60"
    >
      <span className="flex items-center gap-3">
        <Icon className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
        <span>
          <span className="block text-sm font-medium text-slate-200">{label}</span>
          <span className="block text-xs text-slate-400">{hint}</span>
        </span>
      </span>
      <span aria-hidden="true" className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-700'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

type MetadataKey = 'email_reminders' | 'push_reminders'

export function PreferenceToggles() {
  const [lockSupported, setLockSupported] = useState(false)
  const [lockOn, setLockOn] = useState(false)
  const [lockBusy, setLockBusy] = useState(false)
  const [emailAvailable, setEmailAvailable] = useState(false)
  const [emailOn, setEmailOn] = useState(true)
  const [pushAvailable, setPushAvailable] = useState(false)
  const [pushOn, setPushOn] = useState(false)
  const [metricsAvailable, setMetricsAvailable] = useState(false)
  const metricsOn = useSyncExternalStore(subscribeAnalyticsConsent, isAnalyticsEnabled, () => false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    isLockSupported().then((supported) => {
      if (active) setLockSupported(supported)
    })
    setLockOn(isLockEnabled())
    setMetricsAvailable(isAnalyticsAvailable())

    async function loadReminders() {
      try {
        const [availability, { data }] = await Promise.all([
          getReminderAvailability(),
          createClient().auth.getSession(),
        ])
        if (!active) return
        const metadata = data.session?.user.user_metadata

        setEmailOn(metadata?.email_reminders !== false)
        setEmailAvailable(availability.emailEnabled)

        // Ligado só por escolha explícita: sem permissão do aparelho não há token, e um
        // interruptor ligado por padrão prometeria um aviso que não chegaria.
        const wantsPush = metadata?.push_reminders === true
        const canPush = availability.pushEnabled && getNativeInfo() !== null
        setPushOn(wantsPush)
        setPushAvailable(canPush)
        // Em outro aparelho da mesma conta, ou com token renovado, o registro precisa ser refeito.
        if (canPush && wantsPush) requestPushRegistration()
      } catch (loadError) {
        console.warn('Não foi possível carregar os lembretes.', loadError)
      }
    }
    void loadReminders()

    return () => {
      active = false
    }
  }, [])

  const toggleLock = async () => {
    setError(null)
    if (lockOn) {
      disableLock()
      setLockOn(false)
      return
    }
    setLockBusy(true)
    const result = await enableLock()
    setLockBusy(false)
    if (result === 'ok') setLockOn(true)
    else if (result === 'unavailable') setError('Cadastre a biometria nos ajustes do aparelho para usar o bloqueio.')
    else setError('Não foi possível ativar o bloqueio neste aparelho.')
  }

  const saveReminder = async (key: MetadataKey, next: boolean, apply: (value: boolean) => void) => {
    setError(null)
    apply(next)
    let failed = false
    try {
      const { error: updateError } = await createClient().auth.updateUser({ data: { [key]: next } })
      failed = Boolean(updateError)
    } catch {
      failed = true
    }
    if (failed) {
      apply(!next)
      setError('Não foi possível salvar a preferência. Tente de novo.')
    }
    return !failed
  }

  const togglePush = async () => {
    const next = !pushOn
    const saved = await saveReminder('push_reminders', next, setPushOn)
    if (saved && next) requestPushRegistration()
  }

  return (
    <div className="divide-y divide-slate-800/60 overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/40 shadow-sm">
      {lockSupported && (
        <Toggle
          icon={ScanFace}
          label="Bloqueio com biometria"
          hint="Pede sua biometria ao abrir o app neste aparelho. Sair da conta desliga o bloqueio."
          checked={lockOn}
          onChange={toggleLock}
          disabled={lockBusy}
        />
      )}
      {emailAvailable && (
        <Toggle
          icon={Mail}
          label="Lembretes por e-mail"
          hint="Vencimentos próximos e resumo mensal"
          checked={emailOn}
          onChange={() => saveReminder('email_reminders', !emailOn, setEmailOn)}
        />
      )}
      {pushAvailable && (
        <Toggle
          icon={BellRing}
          label="Lembretes no celular"
          hint="Avisa de vencimentos próximos. Se não chegar, permita as notificações do SimpleFinan nos ajustes do aparelho."
          checked={pushOn}
          onChange={togglePush}
        />
      )}
      {metricsAvailable ? (
        <Toggle
          icon={BarChart3}
          label="Métricas de uso"
          hint="Ajudam a melhorar o app, com valores e textos ocultos"
          checked={metricsOn}
          onChange={() => setAnalyticsEnabled(!metricsOn)}
        />
      ) : (
        <div className="flex items-center gap-3 p-4">
          <BarChart3 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span>
            <span className="block text-sm font-medium text-slate-200">Métricas de uso</span>
            <span className="block text-xs text-slate-400">Sem métricas neste ambiente</span>
          </span>
        </div>
      )}
      {error && <p role="alert" className="p-3 text-xs text-rose-400">{error}</p>}
    </div>
  )
}
