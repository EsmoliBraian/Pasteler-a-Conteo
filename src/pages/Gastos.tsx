import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useTable } from '../hooks/useTable'
import type { Envelope, Expense, ExpenseOrigin, PaymentMethod } from '../types'
import { formatDate, formatMoney, todayISO } from '../lib/format'
import { Banner, Button, Card, MoneyInput, PageHeader, SectionTitle, TextInput } from '../components/UI'
import { Trash2 } from 'lucide-react'

const ORIGIN_LABEL: Record<ExpenseOrigin, string> = { local: 'Del local', personal: 'Personal' }

export default function Gastos() {
  const { session } = useAuth()
  const { data: expenses, refetch } = useTable<Expense>('expenses', (q) => q.order('expense_date', { ascending: false }))
  const { data: methods } = useTable<PaymentMethod>('payment_methods', (q) => q.eq('active', true).order('sort_order'))
  const { data: envelopes } = useTable<Envelope>('envelopes', (q) => q.eq('active', true))
  const withdrawalEnvelope = envelopes.find((e) => e.is_withdrawal_envelope) ?? null

  const [amount, setAmount] = useState(0)
  const [description, setDescription] = useState('')
  const [origin, setOrigin] = useState<ExpenseOrigin>('local')
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const thisMonthTotal = expenses
    .filter((e) => e.expense_date.slice(0, 7) === todayISO().slice(0, 7))
    .reduce((s, e) => s + e.amount, 0)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (amount <= 0) return
    setSaving(true)
    setError(null)
    const { data: expense, error: expError } = await supabase
      .from('expenses')
      .insert({
        amount,
        description: description || null,
        origin,
        payment_method_id: paymentMethodId || null,
        expense_date: date,
        created_by: session?.user.id,
      })
      .select()
      .single()
    if (expError || !expense) {
      setError(expError?.message ?? 'No se pudo registrar el gasto')
      setSaving(false)
      return
    }
    if (withdrawalEnvelope) {
      await supabase.from('envelope_transactions').insert({
        envelope_id: withdrawalEnvelope.id,
        amount: -amount,
        type: 'expense_payment',
        description: `Gasto ${ORIGIN_LABEL[origin].toLowerCase()}${description ? ' · ' + description : ''}`,
        related_type: 'expense',
        related_id: expense.id,
        related_date: date,
        created_by: session?.user.id,
      })
    }
    setAmount(0)
    setDescription('')
    setSaving(false)
    refetch()
  }

  async function deleteExpense(expense: Expense) {
    await supabase.from('envelope_transactions').delete().eq('related_type', 'expense').eq('related_id', expense.id)
    await supabase.from('expenses').delete().eq('id', expense.id)
    refetch()
  }

  return (
    <div>
      <PageHeader title="Gastos" subtitle="Descuentan de lo que podemos retirar" />
      <div className="space-y-4 p-4">
        <Card className="flex items-center justify-between">
          <span className="text-sm text-stone-500 dark:text-stone-400">Gastado este mes</span>
          <span className="text-xl font-bold tabular-nums text-stone-900 dark:text-stone-50">{formatMoney(thisMonthTotal)}</span>
        </Card>

        <Card as="form" onSubmit={handleAdd} className="space-y-3">
          <SectionTitle>Registrar gasto</SectionTitle>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOrigin('local')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                origin === 'local' ? 'bg-amber-700 text-white' : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
              }`}
            >
              Del local
            </button>
            <button
              type="button"
              onClick={() => setOrigin('personal')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                origin === 'personal' ? 'bg-amber-700 text-white' : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
              }`}
            >
              Personal
            </button>
          </div>
          <MoneyInput value={amount} onChange={setAmount} />
          <TextInput placeholder="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <select
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(e.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50"
          >
            <option value="">¿De dónde salió? (opcional)</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50"
          />
          {error && <Banner tone="bad">{error}</Banner>}
          <Button type="submit" className="w-full" disabled={saving || amount <= 0}>
            {saving ? 'Guardando…' : 'Registrar gasto'}
          </Button>
        </Card>

        <div>
          <SectionTitle>Historial</SectionTitle>
          <Card className="divide-y divide-stone-100 p-0 dark:divide-stone-800">
            {expenses.length === 0 && <p className="p-4 text-sm text-stone-400">Sin gastos todavía.</p>}
            {expenses.slice(0, 40).map((e) => {
              const method = methods.find((m) => m.id === e.payment_method_id)
              return (
                <div key={e.id} className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-stone-700 dark:text-stone-300">
                      <span
                        className={`mr-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                          e.origin === 'local'
                            ? 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {ORIGIN_LABEL[e.origin]}
                      </span>
                      {e.description}
                    </p>
                    <p className="text-xs text-stone-400">
                      {formatDate(e.expense_date)}
                      {method ? ` · ${method.name}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-50">{formatMoney(e.amount)}</span>
                    <button onClick={() => deleteExpense(e)} className="rounded-lg p-1.5 text-stone-400 active:bg-stone-100 dark:active:bg-stone-800">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </Card>
        </div>
      </div>
    </div>
  )
}
