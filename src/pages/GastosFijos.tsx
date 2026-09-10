import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useTable } from '../hooks/useTable'
import type { Envelope, FixedExpense, FixedExpensePayment } from '../types'
import { currentPeriod, formatMoney, todayISO } from '../lib/format'
import { Banner, Button, Card, MoneyInput, PageHeader, TextInput } from '../components/UI'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'

export default function GastosFijos() {
  const { session } = useAuth()
  const period = currentPeriod()
  const { data: expenses, refetch } = useTable<FixedExpense>('fixed_expenses', (q) =>
    q.eq('active', true).order('sort_order')
  )
  const { data: payments, refetch: refetchPayments } = useTable<FixedExpensePayment>(
    'fixed_expense_payments',
    (q) => q.eq('period', period),
    [period]
  )
  const { data: envelopes } = useTable<Envelope>('envelopes', (q) => q.eq('active', true))
  const fixedEnvelope = envelopes.find((e) => e.is_fixed_expense_envelope) ?? null

  const [editingId, setEditingId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const paidTotal = payments.reduce((s, p) => s + p.amount, 0)

  async function markPaid(expense: FixedExpense) {
    if (!fixedEnvelope) return
    const { error } = await supabase.from('fixed_expense_payments').insert({
      fixed_expense_id: expense.id,
      period,
      amount: expense.amount,
    })
    if (error) return
    await supabase.from('envelope_transactions').insert({
      envelope_id: fixedEnvelope.id,
      amount: -expense.amount,
      type: 'expense_payment',
      description: `${expense.name} · ${period}`,
      related_type: 'fixed_expense',
      related_id: expense.id,
      related_date: todayISO(),
      created_by: session?.user.id,
    })
    refetchPayments()
  }

  async function unmarkPaid(expense: FixedExpense) {
    const payment = payments.find((p) => p.fixed_expense_id === expense.id)
    if (!payment) return
    await supabase.from('fixed_expense_payments').delete().eq('id', payment.id)
    await supabase.from('envelope_transactions').delete().eq('related_type', 'fixed_expense').eq('related_id', expense.id)
    refetchPayments()
  }

  async function deleteExpense(expense: FixedExpense) {
    if (!confirm(`¿Eliminar "${expense.name}" de los gastos fijos?`)) return
    await supabase.from('fixed_expenses').update({ active: false }).eq('id', expense.id)
    refetch()
  }

  return (
    <div>
      <PageHeader
        title="Gastos fijos"
        subtitle="Mensuales, editables"
        action={
          <button onClick={() => setShowNew((s) => !s)} className="rounded-full bg-amber-700 p-2 text-white active:bg-amber-800">
            {showNew ? <X size={20} /> : <Plus size={20} />}
          </button>
        }
      />
      <div className="space-y-4 p-4">
        <Card className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-500 dark:text-stone-400">Total mensual</span>
            <span className="text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-50">{formatMoney(total)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-500 dark:text-stone-400">Pagado este mes</span>
            <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(paidTotal)}</span>
          </div>
        </Card>

        {showNew && <NewExpenseForm onCreated={() => { setShowNew(false); refetch() }} />}

        <div className="space-y-2">
          {expenses.map((expense) => {
            const isPaid = payments.some((p) => p.fixed_expense_id === expense.id)
            return editingId === expense.id ? (
              <EditExpenseForm
                key={expense.id}
                expense={expense}
                onDone={() => {
                  setEditingId(null)
                  refetch()
                }}
              />
            ) : (
              <Card key={expense.id} className="flex items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-stone-800 dark:text-stone-200">{expense.name}</p>
                  <p className="tabular-nums text-stone-500 dark:text-stone-400">{formatMoney(expense.amount)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setEditingId(expense.id)}
                    className="rounded-lg p-2 text-stone-400 active:bg-stone-100 dark:active:bg-stone-800"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => deleteExpense(expense)}
                    className="rounded-lg p-2 text-stone-400 active:bg-stone-100 dark:active:bg-stone-800"
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    onClick={() => (isPaid ? unmarkPaid(expense) : markPaid(expense))}
                    className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold ${
                      isPaid
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
                    }`}
                  >
                    {isPaid && <Check size={14} />}
                    {isPaid ? 'Pagado' : 'Marcar pagado'}
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function EditExpenseForm({ expense, onDone }: { expense: FixedExpense; onDone: () => void }) {
  const [name, setName] = useState(expense.name)
  const [amount, setAmount] = useState(expense.amount)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('fixed_expenses').update({ name, amount }).eq('id', expense.id)
    setSaving(false)
    onDone()
  }

  return (
    <Card className="space-y-2">
      <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      <MoneyInput value={amount} onChange={setAmount} />
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onDone}>
          Cancelar
        </Button>
        <Button className="flex-1" onClick={save} disabled={saving}>
          Guardar
        </Button>
      </div>
    </Card>
  )
}

function NewExpenseForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || amount <= 0) return
    const { error } = await supabase.from('fixed_expenses').insert({ name, amount, sort_order: 999 })
    if (error) setError(error.message)
    else onCreated()
  }

  return (
    <Card as="form" onSubmit={submit} className="space-y-2">
      <TextInput placeholder="Concepto" value={name} onChange={(e) => setName(e.target.value)} required />
      <MoneyInput value={amount} onChange={setAmount} />
      {error && <Banner tone="bad">{error}</Banner>}
      <Button type="submit" className="w-full">
        Agregar
      </Button>
    </Card>
  )
}
