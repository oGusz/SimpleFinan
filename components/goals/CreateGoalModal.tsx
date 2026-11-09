'use client'

import { useId, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { createGoal } from '@/app/actions/finance'
import { Button } from '@/components/ui/button'
import { Field, fieldControlClass } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { MoneyInput } from '@/components/ui/money-input'
import { useToast } from '@/components/ui/toast'
import { todayInBrazil } from '@/lib/finance-insights'
import { GOAL_CATEGORIES, normalizeGoalCategory } from '@/lib/goal-categories'
import { MAX_TITLE_LENGTH } from '@/lib/validation'

const SAVE_FAILED = 'Não foi possível salvar. Verifique a conexão e tente de novo.'

interface CreateGoalModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Sem o gatilho próprio, quem chama abre o formulário por open. */
  hideTrigger?: boolean
  /** Quem passa onSaved avisa a pessoa: o QuickAddProvider já mostra o toast de sucesso. */
  onSaved?: () => void
  /** Aceita a chave nova ou o rótulo antigo. */
  initialCategory?: string
}

type FieldErrors = { title?: string; target?: string; deadline?: string }

export function CreateGoalModal({ open, onOpenChange, hideTrigger, onSaved, initialCategory }: CreateGoalModalProps) {
  const { toast } = useToast()
  const formId = useId()

  const isControlled = open !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = isControlled ? open : internalOpen

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(() => normalizeGoalCategory(initialCategory))
  const [targetAmount, setTargetAmount] = useState<number | null>(null)
  const [currentAmount, setCurrentAmount] = useState<number | null>(null)
  const [monthlyContribution, setMonthlyContribution] = useState<number | null>(null)
  const [deadline, setDeadline] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Limpa ao abrir, e não ao fechar: assim o formulário não some durante a animação de saída.
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) {
      setTitle('')
      setCategory(normalizeGoalCategory(initialCategory))
      setTargetAmount(null)
      setCurrentAmount(null)
      setMonthlyContribution(null)
      setDeadline('')
      setFieldErrors({})
      setFormError(null)
    }
  }

  const applyOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  const handleOpenChange = (next: boolean) => {
    // Fechar no meio do envio esconderia o resultado.
    if (loading && !next) return
    applyOpen(next)
  }

  const today = todayInBrazil()

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (loading) return

    const errors: FieldErrors = {}
    if (!title.trim()) errors.title = 'Dê um nome para a meta.'
    if (targetAmount == null || targetAmount <= 0) errors.target = 'Informe um valor alvo maior que zero.'
    // Alguns navegadores ignoram min no seletor de data.
    if (deadline && deadline < today) errors.deadline = 'O prazo não pode ser anterior a hoje.'
    setFieldErrors(errors)
    setFormError(null)
    if (Object.keys(errors).length > 0 || targetAmount == null) return

    setLoading(true)
    try {
      const result = await createGoal({
        title: title.trim(),
        target_amount: targetAmount,
        current_amount: currentAmount ?? 0,
        monthly_contribution: monthlyContribution ?? 0,
        category,
        deadline: deadline || undefined,
      })
      if (!result.success) {
        setFormError(result.error)
        return
      }
      applyOpen(false)
      if (onSaved) onSaved()
      else toast({ message: 'Meta criada.', kind: 'success' })
    } catch {
      // A ação só rejeita sem resposta do servidor, normalmente por falta de conexão.
      setFormError(SAVE_FAILED)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {!hideTrigger && (
        <Button onClick={() => applyOpen(true)}>
          <Plus aria-hidden="true" />
          Nova meta
        </Button>
      )}

      <Modal
        open={isOpen}
        onOpenChange={handleOpenChange}
        title="Nova meta"
        footer={
          <>
            <Button variant="secondary" className="flex-1" disabled={loading} onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" form={formId} className="flex-1" disabled={loading} aria-busy={loading}>
              {loading ? 'Salvando...' : 'Criar meta'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Nome da meta" error={fieldErrors.title}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                type="text"
                required
                maxLength={MAX_TITLE_LENGTH}
                placeholder="Ex.: Viagem ao Japão"
                value={title}
                disabled={loading}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                onChange={(event) => {
                  setTitle(event.target.value)
                  setFieldErrors((current) => ({ ...current, title: undefined }))
                }}
                className={fieldControlClass}
              />
            )}
          </Field>

          <Field label="Categoria">
            {({ id, describedBy }) => (
              <select
                id={id}
                value={category}
                disabled={loading}
                aria-describedby={describedBy}
                onChange={(event) => setCategory(normalizeGoalCategory(event.target.value))}
                className={fieldControlClass}
              >
                {GOAL_CATEGORIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Valor alvo" error={fieldErrors.target}>
              {({ id, describedBy, invalid }) => (
                <MoneyInput
                  id={id}
                  required
                  value={targetAmount}
                  disabled={loading}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  onValueChange={(value) => {
                    setTargetAmount(value)
                    setFieldErrors((current) => ({ ...current, target: undefined }))
                  }}
                />
              )}
            </Field>

            <Field label="Já guardado" hint="Opcional">
              {({ id, describedBy }) => (
                <MoneyInput
                  id={id}
                  value={currentAmount}
                  disabled={loading}
                  aria-describedby={describedBy}
                  onValueChange={setCurrentAmount}
                />
              )}
            </Field>
          </div>

          <Field label="Aporte mensal previsto" hint="Opcional. Usado para estimar quantos meses faltam.">
            {({ id, describedBy }) => (
              <MoneyInput
                id={id}
                value={monthlyContribution}
                disabled={loading}
                aria-describedby={describedBy}
                onValueChange={setMonthlyContribution}
              />
            )}
          </Field>

          <Field label="Prazo" hint="Opcional" error={fieldErrors.deadline}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                type="date"
                min={today}
                value={deadline}
                disabled={loading}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                onChange={(event) => {
                  setDeadline(event.target.value)
                  setFieldErrors((current) => ({ ...current, deadline: undefined }))
                }}
                className={fieldControlClass}
              />
            )}
          </Field>

          {formError && (
            <p role="alert" className="text-sm text-rose-400">
              {formError}
            </p>
          )}
        </form>
      </Modal>
    </>
  )
}
