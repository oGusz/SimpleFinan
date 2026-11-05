'use client'

import { useId, useState, type FormEvent } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { mutate } from 'swr'
import { deleteBill, updateBill, type Bill } from '@/app/actions/finance'
import { buttonVariants } from '@/components/ui/button'
import { Field, fieldControlClass } from '@/components/ui/field'
import { ConfirmDialog, Modal } from '@/components/ui/modal'
import { MoneyInput } from '@/components/ui/money-input'
import { useToast } from '@/components/ui/toast'
import { formatDate } from '@/lib/format'
import { isValidDate, MAX_TITLE_LENGTH } from '@/lib/validation'

export const BILL_CATEGORIES = [
  { value: 'Moradia', label: 'Moradia' },
  { value: 'Cartão de Crédito', label: 'Cartão de crédito' },
  { value: 'Serviços', label: 'Serviços e assinaturas' },
  { value: 'Alimentação', label: 'Alimentação' },
  { value: 'Outros', label: 'Outros' },
]

export const DEFAULT_BILL_CATEGORY = 'Outros'

const CONNECTION_ERROR = 'Não foi possível salvar. Verifique a conexão e tente de novo.'
const DELETE_ERROR = 'Não foi possível excluir. Verifique a conexão e tente de novo.'

type DeleteScope = 'only' | 'following'

interface FieldErrors {
  title?: string
  amount?: string
  dueDate?: string
}

interface EditBillModalProps {
  bill: Bill
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function EditBillModal({ bill, open, onOpenChange, onSuccess }: EditBillModalProps) {
  const { toast } = useToast()
  const formId = useId()

  const originalDate = bill.due_date ? bill.due_date.slice(0, 10) : ''
  const originalCategory = bill.category || DEFAULT_BILL_CATEGORY

  const [title, setTitle] = useState(bill.title ?? '')
  const [amount, setAmount] = useState<number | null>(Number(bill.amount) || null)
  const [dueDate, setDueDate] = useState(originalDate)
  const [category, setCategory] = useState(originalCategory)
  const [isRecurring, setIsRecurring] = useState(Boolean(bill.is_recurring))

  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deletingScope, setDeletingScope] = useState<DeleteScope | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const deleting = deletingScope !== null
  const billName = bill.title || 'esta conta'
  const categories = BILL_CATEGORIES.some((item) => item.value === originalCategory)
    ? BILL_CATEGORIES
    : [...BILL_CATEGORIES, { value: originalCategory, label: originalCategory }]

  // Fechar no meio da gravação esconderia o resultado dela.
  const requestClose = (next: boolean) => {
    if (!next && (saving || deleting)) return
    onOpenChange(next)
  }

  const refresh = () => {
    if (onSuccess) onSuccess()
    else void mutate((key) => Array.isArray(key) && key[0] === 'dashboard')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return

    const nextTitle = title.trim()
    const nextErrors: FieldErrors = {
      title: nextTitle ? undefined : 'Informe o nome da conta.',
      amount: amount && amount > 0 ? undefined : 'Informe um valor maior que zero.',
      dueDate: isValidDate(dueDate) ? undefined : 'Informe o vencimento.',
    }
    setErrors(nextErrors)
    setFormError(null)
    if (nextErrors.title || nextErrors.amount || nextErrors.dueDate) return

    // Só o que mudou: renomear ou desligar a repetição também afeta os outros meses da conta.
    const changes: Parameters<typeof updateBill>[1] = {}
    if (nextTitle !== bill.title) changes.title = nextTitle
    if (amount !== Number(bill.amount)) changes.amount = amount as number
    if (dueDate !== originalDate) changes.dueDate = dueDate
    if (category !== originalCategory) changes.category = category
    if (isRecurring !== Boolean(bill.is_recurring)) changes.is_recurring = isRecurring

    if (Object.keys(changes).length === 0) {
      onOpenChange(false)
      return
    }

    setSaving(true)
    try {
      const result = await updateBill(bill.id, changes)
      if (!result.success) {
        setFormError(result.error)
        return
      }
    } catch {
      setFormError(CONNECTION_ERROR)
      return
    } finally {
      setSaving(false)
    }

    const movedMonth = dueDate.slice(0, 7) !== originalDate.slice(0, 7)
    toast({
      message: movedMonth ? `Conta movida para ${formatDate(dueDate)}.` : 'Conta atualizada.',
      kind: 'success',
    })
    refresh()
    onOpenChange(false)
  }

  const handleDelete = async (scope: DeleteScope) => {
    if (deleting) return
    setDeletingScope(scope)
    setDeleteError(null)
    try {
      const result = await deleteBill(bill.id, scope)
      if (!result.success) {
        setDeleteError(result.error)
        return
      }
    } catch {
      setDeleteError(DELETE_ERROR)
      return
    } finally {
      setDeletingScope(null)
    }

    let message = 'Conta excluída.'
    if (bill.is_recurring) {
      message = scope === 'following' ? 'Conta excluída deste mês em diante.' : 'Conta excluída só deste mês.'
    }
    toast({ message, kind: 'success' })
    setConfirmOpen(false)
    refresh()
    onOpenChange(false)
  }

  const requestConfirmChange = (next: boolean) => {
    if (!next && deleting) return
    setConfirmOpen(next)
  }

  return (
    <Modal
      open={open}
      onOpenChange={requestClose}
      title="Editar conta a pagar"
      closeLabel="Fechar edição da conta"
      footer={
        <>
          <button
            type="button"
            onClick={() => requestClose(false)}
            disabled={saving}
            className={buttonVariants({ variant: 'secondary', className: 'flex-1' })}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form={formId}
            disabled={saving}
            aria-busy={saving}
            className={buttonVariants({ className: 'flex-1' })}
          >
            {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
            {saving ? 'Salvando...' : 'Salvar alterações'}
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
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={MAX_TITLE_LENGTH}
              required
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
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                required
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
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-describedby={describedBy}
              className={fieldControlClass}
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          )}
        </Field>

        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(event) => setIsRecurring(event.target.checked)}
            className="size-5 shrink-0 accent-emerald-500"
          />
          Repetir todo mês
        </label>
      </form>

      <button
        type="button"
        onClick={() => {
          setDeleteError(null)
          setConfirmOpen(true)
        }}
        className="mt-3 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-medium text-rose-400 transition-colors hover:bg-rose-500/10"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        Excluir conta a pagar
      </button>

      {/* Ficam dentro do Modal para o Base UI tratá-los como aninhados: um toque neles não fecha a edição. */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={requestConfirmChange}
        title="Excluir conta a pagar"
        description={
          bill.is_recurring
            ? `"${billName}" se repete todo mês. O que você quer excluir?`
            : `"${billName}" será excluída. Isso não pode ser desfeito.`
        }
        confirmLabel={bill.is_recurring ? 'Este e os próximos' : 'Excluir'}
        destructive
        loading={deleting}
        error={deleteError}
        onConfirm={() => handleDelete(bill.is_recurring ? 'following' : 'only')}
        secondaryAction={
          bill.is_recurring
            ? { label: 'Só este mês', onClick: () => handleDelete('only'), busy: deletingScope === 'only' }
            : undefined
        }
      />
    </Modal>
  )
}
