'use client'

import { useId, useState, type FormEvent } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { mutate } from 'swr'
import { createBill } from '@/app/actions/bills'
import { BILL_CATEGORIES, DEFAULT_BILL_CATEGORY } from '@/components/bills/EditBillModal'
import { buttonVariants } from '@/components/ui/button'
import { Field, fieldControlClass } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { MoneyInput } from '@/components/ui/money-input'
import { useToast } from '@/components/ui/toast'
import { todayInBrazil } from '@/lib/finance-insights'
import { formatDate, formatMonthYear } from '@/lib/format'
import { isNativeApp, requestPushRegistration } from '@/lib/native-bridge'
import { safeGet, safeSet } from '@/lib/safe-storage'
import { isValidDate, MAX_TITLE_LENGTH } from '@/lib/validation'

const PUSH_ASKED_KEY = '@simplefinan:push-asked'
const SAVE_ERROR = 'Não foi possível salvar. Verifique a conexão e tente de novo.'

interface FieldErrors {
  title?: string
  amount?: string
  dueDate?: string
}

interface CreateBillModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
  /** Com onSaved, quem chama mostra o aviso: o modal só entrega a mensagem. */
  onSaved?: (message: string) => void
}

// O pedido de permissão só faz sentido quando já existe uma conta para lembrar.
function askPushOnce() {
  if (!isNativeApp() || safeGet(PUSH_ASKED_KEY)) return
  if (requestPushRegistration()) safeSet(PUSH_ASKED_KEY, '1')
}

/** Mês por extenso quando o vencimento é fora do mês corrente, onde a pessoa procuraria a conta. */
function otherMonthLabel(dueDate: string) {
  if (dueDate.slice(0, 7) === todayInBrazil().slice(0, 7)) return null
  const [year, month] = dueDate.split('-').map(Number)
  return formatMonthYear(year, month)
}

export function CreateBillModal({ open, onOpenChange, hideTrigger = false, onSaved }: CreateBillModalProps) {
  const { toast } = useToast()
  const formId = useId()

  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = open ?? internalOpen

  const [amount, setAmount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const setOpen = (next: boolean) => {
    // Fechar no meio da gravação esconderia o resultado dela.
    if (!next && loading) return
    if (open === undefined) setInternalOpen(next)
    onOpenChange?.(next)
  }

  // Os demais campos somem com o painel. Só estes vivem aqui fora dele.
  const resetForm = () => {
    setAmount(null)
    setErrors({})
    setFormError(null)
  }

  const savedMessage = (dueDate: string) => {
    const date = formatDate(dueDate)
    const month = otherMonthLabel(dueDate)
    return month ? `Conta salva para ${date}. Ela aparece em ${month}.` : `Conta salva para ${date}.`
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return

    const formData = new FormData(event.currentTarget)
    const title = String(formData.get('title') ?? '').trim()
    const dueDate = String(formData.get('due_date') ?? '')

    const nextErrors: FieldErrors = {
      title: title ? undefined : 'Informe o nome da conta.',
      amount: amount && amount > 0 ? undefined : 'Informe um valor maior que zero.',
      dueDate: isValidDate(dueDate) ? undefined : 'Informe o vencimento.',
    }
    setErrors(nextErrors)
    setFormError(null)
    if (nextErrors.title || nextErrors.amount || nextErrors.dueDate) return

    setLoading(true)
    try {
      const result = await createBill(formData)
      if (!result.success) {
        setFormError(result.error)
        return
      }
    } catch {
      setFormError(SAVE_ERROR)
      return
    } finally {
      setLoading(false)
    }

    const message = savedMessage(dueDate)
    if (onSaved) onSaved(message)
    else toast({ message, kind: 'success' })
    askPushOnce()
    // A tela inicial guarda os dados em cache: sem isto, a conta nova não apareceria.
    void mutate((key) => Array.isArray(key) && key[0] === 'dashboard')
    if (open === undefined) setInternalOpen(false)
    onOpenChange?.(false)
  }

  return (
    <>
      {!hideTrigger && (
        <button type="button" onClick={() => setOpen(true)} className={buttonVariants()}>
          <Plus aria-hidden="true" />
          Nova conta a pagar
        </button>
      )}

      <Modal
        open={isOpen}
        onOpenChange={setOpen}
        onClosed={resetForm}
        title="Nova conta a pagar"
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className={buttonVariants({ variant: 'secondary', className: 'flex-1' })}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form={formId}
              disabled={loading}
              aria-busy={loading}
              className={buttonVariants({ className: 'flex-1' })}
            >
              {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
              {loading ? 'Salvando...' : 'Salvar conta'}
            </button>
          </>
        }
      >
        <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {formError && (
            <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
              {formError}
            </p>
          )}

          <Field label="Nome da conta" error={errors.title}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                type="text"
                name="title"
                required
                maxLength={MAX_TITLE_LENGTH}
                placeholder="Ex.: aluguel, internet"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className={fieldControlClass}
              />
            )}
          </Field>

          <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">
            <Field label="Valor" error={errors.amount} className="min-w-0">
              {({ id, describedBy, invalid }) => (
                <MoneyInput
                  id={id}
                  name="amount"
                  value={amount}
                  onValueChange={setAmount}
                  required
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                />
              )}
            </Field>

            <Field label="Vencimento" error={errors.dueDate} className="min-w-0">
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  type="date"
                  name="due_date"
                  required
                  defaultValue={todayInBrazil()}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  className={fieldControlClass}
                />
              )}
            </Field>
          </div>

          <Field label="Categoria">
            {({ id, describedBy }) => (
              <select
                id={id}
                name="category"
                defaultValue={DEFAULT_BILL_CATEGORY}
                aria-describedby={describedBy}
                className={fieldControlClass}
              >
                {BILL_CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-200">
            <input type="checkbox" name="is_recurring" className="size-5 shrink-0 accent-emerald-500" />
            Repetir todo mês
          </label>
        </form>
      </Modal>
    </>
  )
}
