import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useTable } from '../hooks/useTable'
import type { Envelope, EnvelopeTransaction, PaymentMethod, SalesEntry, Withdrawal, WithdrawalCategory } from '../types'
import { currentPeriod, daysInMonth, formatDate, formatMoney, todayISO } from '../lib/format'
import { projectedMonthlyNet } from '../lib/calculations'
import { Banner, Button, Card, MoneyInput, PageHeader, SectionTitle, TextInput } from '../components/UI'
import { Pencil, Trash2 } from 'lucide-react'

export default function Retiro() {
  const { session } = useAuth()
  const period = currentPeriod()
  const { data: categories, refetch: refetchCategories } = useTable<WithdrawalCategory>(
    'withdrawal_categories',
    (q) => q.eq('active', true).order('sort_order')
  )
  const { data: withdrawals, refetch: refetchWithdrawals } = useTable<Withdrawal>('withdrawals', (q) =>
    q.order('withdrawal_date', { ascending: false })
  )
  const { data: envelopes } = useTable<Envelope>('envelopes', (q) => q.eq('active', true))
  const { data: transactions } = useTable<EnvelopeTransaction>('envelope_transactions')
  const { data: methods } = useTable<PaymentMethod>('payment_methods', (q) => q.eq('active', true).order('sort_order'))
  const firstOfMonth = `${period}-01`
  const { data: monthSales } = useTable<SalesEntry>('sales_entries', (q) => q.gte('sale_date', firstOfMonth), [firstOfMonth])

  const withdrawalEnvelope = envelopes.find((e) => e.is_withdrawal_envelope) ?? null
  const available = useMemo(
    () =>
      withdrawalEnvelope
        ? transactions.filter((t) => t.envelope_id === withdrawalEnvelope.id).reduce((s, t) => s + Number(t.amount), 0)
        : 0,
    [transactions, withdrawalEnvelope]
  )
  const thisMonth = withdrawals.filter((w) => w.withdrawal_date.startsWith(period))
  const withdrawnThisMonth = thisMonth.reduce((s, w) => s + w.amount, 0)
  const budgetTotal = categories.reduce((s, c) => s + c.monthly_budget, 0)

  const [year, month] = period.split('-').map(Number)
  const retiroPct = withdrawalEnvelope?.pct ?? 0
  const retiroSanoProyectado = (projectedMonthlyNet(monthSales, daysInMonth(year, month)) * retiroPct) / 100

  const [editingCat, setEditingCat] = useState<string | null>(null)
  const [amount, setAmount] = useState(0)
  const [categoryId, setCategoryId] = useState('')
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayISO())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (amount <= 0) return
    setSaving(true)
    setError(null)
    const { data: withdrawal, error: wError } = await supabase
      .from('withdrawals')
      .insert({
        withdrawal_category_id: categoryId || null,
        payment_method_id: paymentMethodId || null,
        amount,
        description: description || null,
        withdrawal_date: date,
        created_by: session?.user.id,
      })
      .select()
      .single()
    if (wError || !withdrawal) {
      setError(wError?.message ?? 'No se pudo registrar el retiro')
      setSaving(false)
      return
    }
    if (withdrawalEnvelope) {
      await supabase.from('envelope_transactions').insert({
        envelope_id: withdrawalEnvelope.id,
        amount: -amount,
        type: 'withdrawal',
        description: description || 'Retiro personal',
        related_type: 'withdrawal',
        related_id: withdrawal.id,
        related_date: date,
        created_by: session?.user.id,
      })
    }
    setAmount(0)
    setDescription('')
    setSaving(false)
    refetchWithdrawals()
  }

  async function deleteWithdrawal(w: Withdrawal) {
    await supabase.from('envelope_transactions').delete().eq('related_type', 'withdrawal').eq('related_id', w.id)
    await supabase.from('withdrawals').delete().eq('id', w.id)
    refetchWithdrawals()
  }

  const [editingWithdrawalId, setEditingWithdrawalId] = useState<string | null>(null)

  return (
    <div>
      <PageHeader title="Retiro personal" />
      <div className="space-y-4 p-4">
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-500 dark:text-stone-400">Disponible en sobre "Retiro"</span>
            <span
              className={`text-2xl font-bold tabular-nums ${available < 0 ? 'text-red-600' : 'text-stone-900 dark:text-stone-50'}`}
            >
              {formatMoney(available)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-500 dark:text-stone-400">Retirado este mes</span>
            <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-50">{formatMoney(withdrawnThisMonth)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-500 dark:text-stone-400">Presupuesto mensual configurado</span>
            <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-50">{formatMoney(budgetTotal)}</span>
          </div>
          {available < 0 && <Banner tone="bad">Ya retiraron más de lo que el negocio permite este mes.</Banner>}
          {available >= 0 && withdrawnThisMonth > budgetTotal && budgetTotal > 0 && (
            <Banner tone="warn">Superaron el presupuesto mensual configurado para retiros.</Banner>
          )}
        </Card>

        <Card className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-500 dark:text-stone-400">Retiro sano proyectado (mes completo)</span>
            <span className="text-xl font-bold tabular-nums text-stone-900 dark:text-stone-50">{formatMoney(retiroSanoProyectado)}</span>
          </div>
          <p className="text-xs text-stone-400">
            {retiroPct}% de la venta neta, proyectada al ritmo de los días de venta ya cargados este mes.
          </p>
        </Card>

        <div>
          <SectionTitle>Categorías</SectionTitle>
          <div className="space-y-2">
            {categories.map((cat) => {
              const pctDeSano = retiroSanoProyectado > 0 ? (cat.monthly_budget / retiroSanoProyectado) * 100 : null
              return editingCat === cat.id ? (
                <EditCategoryForm key={cat.id} category={cat} onDone={() => { setEditingCat(null); refetchCategories() }} />
              ) : (
                <Card key={cat.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-stone-800 dark:text-stone-200">{cat.name}</p>
                    <p className="text-xs text-stone-400">
                      Presupuesto: {formatMoney(cat.monthly_budget)}/mes
                      {pctDeSano !== null && ` · ${pctDeSano.toFixed(0)}% del retiro sano`}
                    </p>
                  </div>
                  <button onClick={() => setEditingCat(cat.id)} className="rounded-lg p-2 text-stone-400 active:bg-stone-100 dark:active:bg-stone-800">
                    <Pencil size={16} />
                  </button>
                </Card>
              )
            })}
          </div>
          {budgetTotal > retiroSanoProyectado && retiroSanoProyectado > 0 && (
            <div className="mt-2">
              <Banner tone="warn">
                Los presupuestos configurados ({formatMoney(budgetTotal)}) suman más que el retiro sano proyectado.
              </Banner>
            </div>
          )}
        </div>

        <Card as="form" onSubmit={handleAdd} className="space-y-3">
          <SectionTitle>Registrar retiro</SectionTitle>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50"
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
          <MoneyInput value={amount} onChange={setAmount} />
          <TextInput placeholder="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50"
          />
          {error && <Banner tone="bad">{error}</Banner>}
          <Button type="submit" className="w-full" disabled={saving || amount <= 0}>
            {saving ? 'Guardando…' : 'Registrar retiro'}
          </Button>
        </Card>

        <div>
          <SectionTitle>Historial</SectionTitle>
          <Card className="divide-y divide-stone-100 p-0 dark:divide-stone-800">
            {withdrawals.length === 0 && <p className="p-4 text-sm text-stone-400">Sin retiros todavía.</p>}
            {withdrawals.slice(0, 30).map((w) => {
              if (editingWithdrawalId === w.id) {
                return (
                  <div key={w.id} className="p-3">
                    <EditWithdrawalForm
                      withdrawal={w}
                      categories={categories}
                      methods={methods}
                      withdrawalEnvelope={withdrawalEnvelope}
                      userId={session?.user.id}
                      onDone={() => {
                        setEditingWithdrawalId(null)
                        refetchWithdrawals()
                      }}
                    />
                  </div>
                )
              }
              const cat = categories.find((c) => c.id === w.withdrawal_category_id)
              return (
                <div key={w.id} className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-stone-700 dark:text-stone-300">
                      {cat?.name ?? 'Sin categoría'}
                      {w.description ? ` · ${w.description}` : ''}
                    </p>
                    <p className="text-xs text-stone-400">{formatDate(w.withdrawal_date)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-50">{formatMoney(w.amount)}</span>
                    <button
                      onClick={() => setEditingWithdrawalId(w.id)}
                      className="rounded-lg p-1.5 text-stone-400 active:bg-stone-100 dark:active:bg-stone-800"
                    >
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => deleteWithdrawal(w)} className="rounded-lg p-1.5 text-stone-400 active:bg-stone-100 dark:active:bg-stone-800">
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

function EditWithdrawalForm({
  withdrawal,
  categories,
  methods,
  withdrawalEnvelope,
  userId,
  onDone,
}: {
  withdrawal: Withdrawal
  categories: WithdrawalCategory[]
  methods: PaymentMethod[]
  withdrawalEnvelope: Envelope | null
  userId: string | undefined
  onDone: () => void
}) {
  const [amount, setAmount] = useState(withdrawal.amount)
  const [categoryId, setCategoryId] = useState(withdrawal.withdrawal_category_id ?? '')
  const [paymentMethodId, setPaymentMethodId] = useState(withdrawal.payment_method_id ?? '')
  const [description, setDescription] = useState(withdrawal.description ?? '')
  const [date, setDate] = useState(withdrawal.withdrawal_date)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (amount <= 0) return
    setSaving(true)
    setError(null)
    const { error: wError } = await supabase
      .from('withdrawals')
      .update({
        withdrawal_category_id: categoryId || null,
        payment_method_id: paymentMethodId || null,
        amount,
        description: description || null,
        withdrawal_date: date,
      })
      .eq('id', withdrawal.id)
    if (wError) {
      setError(wError.message)
      setSaving(false)
      return
    }
    await supabase.from('envelope_transactions').delete().eq('related_type', 'withdrawal').eq('related_id', withdrawal.id)
    if (withdrawalEnvelope) {
      await supabase.from('envelope_transactions').insert({
        envelope_id: withdrawalEnvelope.id,
        amount: -amount,
        type: 'withdrawal',
        description: description || 'Retiro personal',
        related_type: 'withdrawal',
        related_id: withdrawal.id,
        related_date: date,
        created_by: userId,
      })
    }
    setSaving(false)
    onDone()
  }

  return (
    <Card className="space-y-2">
      <SectionTitle>Editar retiro</SectionTitle>
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50"
      >
        <option value="">Sin categoría</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
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
      <MoneyInput value={amount} onChange={setAmount} />
      <TextInput placeholder="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50"
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

function EditCategoryForm({ category, onDone }: { category: WithdrawalCategory; onDone: () => void }) {
  const [budget, setBudget] = useState(category.monthly_budget)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('withdrawal_categories').update({ monthly_budget: budget }).eq('id', category.id)
    setSaving(false)
    onDone()
  }

  return (
    <Card className="space-y-2">
      <p className="font-medium text-stone-800 dark:text-stone-200">{category.name}</p>
      <MoneyInput value={budget} onChange={setBudget} />
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
