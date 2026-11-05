'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { CalendarClock, Landmark, Target, TrendingUp } from 'lucide-react'
import { mutate } from 'swr'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { useAppMode } from '@/context/AppModeContext'
import { usePortfolio } from '@/context/PortfolioContext'

export type QuickAddKind = 'bill' | 'asset' | 'goal'

type QuickAddFormProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  hideTrigger?: boolean
  onSaved?: (message?: string) => void
  initialCategory?: string
}

// Formulários pesados só são baixados quando alguém pede para adicionar algo.
const CreateBillModal = dynamic(
  () =>
    import('@/components/bills/CreateBillModal').then(
      (module): ComponentType<QuickAddFormProps> => module.CreateBillModal,
    ),
  { ssr: false },
)
const AddInvestmentModal = dynamic(
  () =>
    import('@/components/AddInvestmentModal').then(
      (module): ComponentType<QuickAddFormProps> => module.AddInvestmentModal,
    ),
  { ssr: false },
)
const CreateGoalModal = dynamic(
  () =>
    import('@/components/goals/CreateGoalModal').then(
      (module): ComponentType<QuickAddFormProps> => module.CreateGoalModal,
    ),
  { ssr: false },
)

const FORMS: Record<QuickAddKind, ComponentType<QuickAddFormProps>> = {
  bill: CreateBillModal,
  asset: AddInvestmentModal,
  goal: CreateGoalModal,
}

// O formulário pode trazer uma mensagem mais precisa, como a data da conta ou as cotas somadas.
const SAVED_MESSAGE: Record<QuickAddKind, string> = {
  bill: 'Conta cadastrada.',
  asset: 'Investimento adicionado.',
  goal: 'Meta criada.',
}

type QuickAddContextValue = {
  open: (kind: QuickAddKind, options?: { category?: string }) => void
  openSheet: () => void
  notifyDataChanged: () => void
}

const QuickAddContext = createContext<QuickAddContextValue | null>(null)

const SHEET_OPTION_CLASS =
  'flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-left text-sm font-medium text-slate-100 hover:bg-slate-800'

type ActiveForm = { kind: QuickAddKind; category?: string; key: number; open: boolean }

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const { isOpenFinance, isPremium } = useAppMode()
  const { reloadAssets } = usePortfolio()
  const { toast } = useToast()

  const [form, setForm] = useState<ActiveForm | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const pendingKind = useRef<QuickAddKind | null>(null)

  const open = useCallback<QuickAddContextValue['open']>((kind, options) => {
    setForm((current) => ({ kind, category: options?.category, key: (current?.key ?? 0) + 1, open: true }))
  }, [])

  const openSheet = useCallback(() => setSheetOpen(true), [])

  const notifyDataChanged = useCallback(() => {
    void mutate((key) => key === 'goals' || (Array.isArray(key) && key[0] === 'dashboard'))
    reloadAssets()
  }, [reloadAssets])

  const value = useMemo(() => ({ open, openSheet, notifyDataChanged }), [open, openSheet, notifyDataChanged])

  // O formulário só abre depois que a folha fecha, para ela não devolver o foco ao botão '+'.
  const chooseFromSheet = (kind: QuickAddKind) => {
    pendingKind.current = kind
    setSheetOpen(false)
  }

  const handleSheetClosed = () => {
    const kind = pendingKind.current
    pendingKind.current = null
    if (kind) open(kind)
  }

  const handleFormOpenChange = (next: boolean) => {
    setForm((current) => (current ? { ...current, open: next } : current))
  }

  const handleSaved = (message?: string) => {
    if (form) toast({ message: message ?? SAVED_MESSAGE[form.kind], kind: 'success' })
    notifyDataChanged()
  }

  // A carteira do modo Open Finance vem dos bancos e é só leitura.
  const sheetOptions = [
    { kind: 'bill' as const, label: 'Nova conta a pagar', icon: CalendarClock },
    ...(isOpenFinance ? [] : [{ kind: 'asset' as const, label: 'Novo investimento', icon: TrendingUp }]),
    { kind: 'goal' as const, label: 'Nova meta', icon: Target },
  ]

  const Form = form ? FORMS[form.kind] : null

  return (
    <QuickAddContext.Provider value={value}>
      {children}

      <Modal
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onClosed={handleSheetClosed}
        title="O que você quer adicionar?"
        variant="sheet"
      >
        <ul className="flex flex-col gap-2">
          {sheetOptions.map(({ kind, label, icon: Icon }) => (
            <li key={kind}>
              <button
                type="button"
                onClick={() => chooseFromSheet(kind)}
                className={SHEET_OPTION_CLASS}
              >
                <Icon className="size-5 shrink-0 text-emerald-400" aria-hidden="true" />
                {label}
              </button>
            </li>
          ))}
          {isPremium && (
            <li>
              <Link href="/open-finance" onClick={() => setSheetOpen(false)} className={SHEET_OPTION_CLASS}>
                <Landmark className="size-5 shrink-0 text-emerald-400" aria-hidden="true" />
                Conectar banco
              </Link>
            </li>
          )}
        </ul>
      </Modal>

      {form && Form && (
        <Form
          key={form.key}
          open={form.open}
          onOpenChange={handleFormOpenChange}
          hideTrigger
          onSaved={handleSaved}
          initialCategory={form.category}
        />
      )}
    </QuickAddContext.Provider>
  )
}

export function useQuickAdd() {
  const context = useContext(QuickAddContext)
  if (!context) throw new Error('useQuickAdd precisa estar dentro de QuickAddProvider')
  return context
}
