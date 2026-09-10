import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useTable } from '../hooks/useTable'
import type { Envelope, EnvelopeTransaction, Expense, ExpenseOrigin, PaymentMethod } from '../types'
import { formatDate, formatMoney, todayISO } from '../lib/format'
import { Banner, Button, Card, MoneyInput, PageHeader, SectionTitle, TextInput } from '../components/UI'
import { Pencil, Trash2 } from 'lucide-react'

const ORIGIN_LABEL: Record<ExpenseOrigin, string> = { local: 'Del local', personal: 'Personal' }

export default function Gastos() {
  const { session } = useAuth()
  const { data: expenses, refetch } = useTable<Expense>('expenses', (q) => q.order('expense_date', { ascending: false }))
  const { data: methods } = useTable<PaymentMethod>('payment_methods', (q) => q.eq('active', true).order('sort_order'))
  const { data: envelopes } = useTable<Envelope>('envelopes', (q) => q.eq('active', true))
  const { data: transactions } = useTable<EnvelopeTransaction>('envelope_transactions')

  const withdrawalEnvelope = envelopes.find((e) => e.is_withdrawal_envelope) ?? null
  const suppliesEnvelope = envelopes.find((e) => e.is_supplies_envelope) ?? null

  const balances = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of transactions) map.set(tx.envelope_id, (map.get(tx.envelope_id) ?? 0) + Number(tx.amount))
    return map
  }, [transactions])

  const [amount, setAmount] = useState(0)
  const [description, setDescription] = useState('')
  const [origin, setOrigin] = useState<ExpenseOrigin>('local')
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const targetEnvelope = origin === 'local' ? suppliesEnvelope : withdrawalEnvelope
  const targetBalance = targetEnvelope ? (balances.get(targetEnvelope.id) ?? 0) : 0

  const thisMonthTotal = expenses
    .filter((e) => e.expense_date.slice(0, 7) === todayISO().slice(0, 7))
    .reduce((s, e) => s + e.amount, 0)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (amount <= 0) return
    setSaving(true)
    setError(null)
    setWarning(null)
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
    if (targetEnvelope) {
      await supabase.from('envelope_transactions').insert({
        envelope_id: targetEnvelope.id,
        amount: -amount,
        type: 'expense_payment',
        description: `Gasto ${ORIGIN_LABEL[origin].toLowerCase()}${description ? ' · ' + description : ''}`,
        related_type: 'expense',
        related_id: expense.id,
        related_date: date,
        created_by: session?.user.id,
      })
      if (targetBalance - amount < 0) {
        setWarning(`El sobre "${targetEnvelope.name}" quedó en negativo.`)
      }
    }
    setAmount(0)
    setDescription('')
    setPaymentMethodId('')
    setSaving(false)
    refetch()
  }

  async function deleteExpense(expense: Expense) {
    await supabase.from('envelope_transactions').delete().eq('related_type', 'expense').eq('related_id', expense.id)
    await supabase.from('expenses').delete().eq('id', expense.id)
    refetch()
  }

  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div>
      <PageHeader title="Gastos" subtitle="Del local: insumos/proveedores · Personal: descuenta el retiro" />
      <div className="space-y-4 p-4">
        <Card className="flex items-center justify-between">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">Gastado este mes</span>
          <span className="text-xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">{formatMoney(thisMonthTotal)}</span>
        </Card>

        <Card as="form" onSubmit={handleAdd} className="space-y-3">
          <SectionTitle>Registrar gasto</SectionTitle>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOrigin('local')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                origin === 'local' ? 'bg-amber-700 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
              }`}
            >
              Del local
            </button>
            <button
              type="button"
              onClick={() => setOrigin('personal')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                origin === 'personal' ? 'bg-amber-700 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
              }`}
            >
              Personal
            </button>
          </div>
          {targetEnvelope && (
            <p className="text-xs text-neutral-400">
              Sale del sobre <strong>"{targetEnvelope.name}"</strong> · disponible{' '}
              <span className={targetBalance < 0 ? 'font-semibold text-red-600 dark:text-red-400' : ''}>
                {formatMoney(targetBalance)}
              </span>
            </p>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Monto</label>
            <MoneyInput value={amount} onChange={setAmount} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Descripción</label>
            <TextInput
              placeholder="¿Qué compraste? (ej: harina, arreglo del horno)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">¿De dónde salió? (opcional)</label>
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
            >
              <option value="">Sin especificar</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
          />
          {error && <Banner tone="bad">{error}</Banner>}
          {warning && <Banner tone="warn">{warning}</Banner>}
          <Button type="submit" className="w-full" disabled={saving || amount <= 0}>
            {saving ? 'Guardando…' : 'Registrar gasto'}
          </Button>
        </Card>

        <div>
          <SectionTitle>Historial</SectionTitle>
          <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
            {expenses.length === 0 && <p className="p-4 text-sm text-neutral-400">Sin gastos todavía.</p>}
            {expenses.slice(0, 40).map((e) => {
              if (editingId === e.id) {
                return (
                  <div key={e.id} className="p-3">
                    <EditExpenseForm
                      expense={e}
                      methods={methods}
                      suppliesEnvelope={suppliesEnvelope}
                      withdrawalEnvelope={withdrawalEnvelope}
                      balances={balances}
                      userId={session?.user.id}
                      onDone={() => {
                        setEditingId(null)
                        refetch()
                      }}
                    />
                  </div>
                )
              }
              const method = methods.find((m) => m.id === e.payment_method_id)
              return (
                <div key={e.id} className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-neutral-700 dark:text-neutral-300">
                      <span
                        className={`mr-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                          e.origin === 'local'
                            ? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {ORIGIN_LABEL[e.origin]}
                      </span>
                      {e.description}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {formatDate(e.expense_date)}
                      {method ? ` · ${method.name}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">{formatMoney(e.amount)}</span>
                    <button
                      onClick={() => setEditingId(e.id)}
                      className="rounded-lg p-1.5 text-neutral-400 active:bg-neutral-100 dark:active:bg-neutral-800"
                    >
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => deleteExpense(e)} className="rounded-lg p-1.5 text-neutral-400 active:bg-neutral-100 dark:active:bg-neutral-800">
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

function EditExpenseForm({
  expense,
  methods,
  suppliesEnvelope,
  withdrawalEnvelope,
  balances,
  userId,
  onDone,
}: {
  expense: Expense
  methods: PaymentMethod[]
  suppliesEnvelope: Envelope | null
  withdrawalEnvelope: Envelope | null
  balances: Map<string, number>
  userId: string | undefined
  onDone: () => void
}) {
  const [amount, setAmount] = useState(expense.amount)
  const [description, setDescription] = useState(expense.description ?? '')
  const [origin, setOrigin] = useState<ExpenseOrigin>(expense.origin)
  const [paymentMethodId, setPaymentMethodId] = useState(expense.payment_method_id ?? '')
  const [date, setDate] = useState(expense.expense_date)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targetEnvelope = origin === 'local' ? suppliesEnvelope : withdrawalEnvelope
  const targetBalance = targetEnvelope ? (balances.get(targetEnvelope.id) ?? 0) : 0

  async function save() {
    if (amount <= 0) return
    setSaving(true)
    setError(null)
    const { error: expError } = await supabase
      .from('expenses')
      .update({
        amount,
        description: description || null,
        origin,
        payment_method_id: paymentMethodId || null,
        expense_date: date,
      })
      .eq('id', expense.id)
    if (expError) {
      setError(expError.message)
      setSaving(false)
      return
    }
    await supabase.from('envelope_transactions').delete().eq('related_type', 'expense').eq('related_id', expense.id)
    if (targetEnvelope) {
      await supabase.from('envelope_transactions').insert({
        envelope_id: targetEnvelope.id,
        amount: -amount,
        type: 'expense_payment',
        description: `Gasto ${ORIGIN_LABEL[origin].toLowerCase()}${description ? ' · ' + description : ''}`,
        related_type: 'expense',
        related_id: expense.id,
        related_date: date,
        created_by: userId,
      })
    }
    setSaving(false)
    onDone()
  }

  return (
    <Card className="space-y-3">
      <SectionTitle>Editar gasto</SectionTitle>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOrigin('local')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${
            origin === 'local' ? 'bg-amber-700 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
          }`}
        >
          Del local
        </button>
        <button
          type="button"
          onClick={() => setOrigin('personal')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${
            origin === 'personal' ? 'bg-amber-700 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
          }`}
        >
          Personal
        </button>
      </div>
      {targetEnvelope && (
        <p className="text-xs text-neutral-400">
          Sale del sobre <strong>"{targetEnvelope.name}"</strong> · disponible{' '}
          <span className={targetBalance < 0 ? 'font-semibold text-red-600 dark:text-red-400' : ''}>{formatMoney(targetBalance)}</span>
        </p>
      )}
      <MoneyInput value={amount} onChange={setAmount} />
      <TextInput placeholder="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} />
      <select
        value={paymentMethodId}
        onChange={(e) => setPaymentMethodId(e.target.value)}
        className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
      >
        <option value="">Sin especificar</option>
        {methods.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
      />
      {error && <Banner tone="bad">{error}</Banner>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onDone}>
          Cancelar
        </Button>
        <Button className="flex-1" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </Card>
  )
}
