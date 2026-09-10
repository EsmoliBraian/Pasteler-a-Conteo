import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useTable } from '../hooks/useTable'
import type { Debt, DebtInstallment, DebtType, Envelope, EnvelopeTransaction } from '../types'
import {
  debtPendingBalance,
  debtProgress,
  generateInstallmentDates,
  installmentsDueInMonth,
  upcomingInstallments,
} from '../lib/calculations'
import { formatDate, formatMoney, todayISO } from '../lib/format'
import { Banner, Button, Card, MoneyInput, PageHeader, ProgressBar, SectionTitle, TextInput } from '../components/UI'
import { Pencil, Plus, X } from 'lucide-react'

const DEBT_TYPE_LABEL: Record<DebtType, string> = {
  prestamo_bancario: 'Préstamo bancario',
  tarjeta_credito: 'Tarjeta de crédito',
  financiacion_proveedor: 'Financiación de proveedor',
  prestamo_personal: 'Préstamo personal',
}

export default function Deudas() {
  const { data: debts, refetch: refetchDebts } = useTable<Debt>('debts', (q) => q.order('created_at'))
  const { data: installments, refetch: refetchInstallments } = useTable<DebtInstallment>('debt_installments', (q) =>
    q.order('due_date')
  )
  const { data: envelopes } = useTable<Envelope>('envelopes', (q) => q.eq('active', true))
  const { data: transactions, refetch: refetchTx } = useTable<EnvelopeTransaction>('envelope_transactions')
  const [showForm, setShowForm] = useState(false)
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null)
  const [freedMessage, setFreedMessage] = useState<string | null>(null)

  const debtEnvelope = envelopes.find((e) => e.is_debt_envelope) ?? null
  const debtEnvelopeBalance = useMemo(
    () =>
      debtEnvelope ? transactions.filter((t) => t.envelope_id === debtEnvelope.id).reduce((s, t) => s + Number(t.amount), 0) : 0,
    [transactions, debtEnvelope]
  )

  const activeDebts = debts.filter((d) => d.status === 'activa')
  const totalPending = activeDebts.reduce((sum, d) => sum + debtPendingBalance(d, installments), 0)
  const dueThisMonth = installmentsDueInMonth(installments)
  const dueThisMonthTotal = dueThisMonth.reduce((s, i) => s + i.amount, 0)
  const upcoming = upcomingInstallments(installments)
  const notEnough = dueThisMonthTotal > debtEnvelopeBalance

  function refetchAll() {
    refetchDebts()
    refetchInstallments()
    refetchTx()
  }

  const { session } = useAuth()

  async function markPaid(installment: DebtInstallment) {
    if (!debtEnvelope) return
    const debt = debts.find((d) => d.id === installment.debt_id)
    if (!debt) return
    const { error } = await supabase
      .from('debt_installments')
      .update({ status: 'pagada', paid_at: new Date().toISOString(), paid_amount: installment.amount })
      .eq('id', installment.id)
    if (error) return

    await supabase.from('envelope_transactions').insert({
      envelope_id: debtEnvelope.id,
      amount: -installment.amount,
      type: 'debt_payment',
      description: `Cuota ${installment.installment_number}/${debt.installments_count} · ${debt.name}`,
      related_type: 'debt_installment',
      related_id: installment.id,
      related_date: todayISO(),
      created_by: session?.user.id,
    })

    const ownInstallments = installments.filter((i) => i.debt_id === debt.id)
    const stillPending = ownInstallments.some((i) => i.id !== installment.id && i.status === 'pendiente')
    if (!stillPending) {
      await supabase.from('debts').update({ status: 'pagada' }).eq('id', debt.id)
      setFreedMessage(
        `¡"${debt.name}" quedó pagada! A partir de ahora se liberan ${formatMoney(debt.installment_amount)}/mes.`
      )
    }
    refetchAll()
  }

  async function deleteDebt(debt: Debt) {
    if (!confirm(`¿Eliminar "${debt.name}" y todas sus cuotas? Esto no se puede deshacer.`)) return
    await supabase.from('debts').delete().eq('id', debt.id)
    refetchAll()
  }

  return (
    <div>
      <PageHeader
        title="Deudas y créditos"
        action={
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-full bg-amber-700 p-2 text-white active:bg-amber-800"
          >
            {showForm ? <X size={20} /> : <Plus size={20} />}
          </button>
        }
      />
      <div className="space-y-4 p-4">
        {freedMessage && (
          <Banner tone="good">
            {freedMessage}{' '}
            <button className="underline" onClick={() => setFreedMessage(null)}>
              cerrar
            </button>
          </Banner>
        )}

        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-500 dark:text-stone-400">Hay que pagar este mes</span>
            <span className="text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-50">
              {formatMoney(dueThisMonthTotal)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-500 dark:text-stone-400">Saldo del sobre "Deudas y créditos"</span>
            <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-50">
              {formatMoney(debtEnvelopeBalance)}
            </span>
          </div>
          {notEnough && (
            <Banner tone="bad">El sobre de deudas no alcanza para cubrir las cuotas de este mes.</Banner>
          )}
          <div className="flex items-center justify-between border-t border-stone-100 pt-2 dark:border-stone-800">
            <span className="text-xs text-stone-400">Saldo pendiente total (todas las deudas)</span>
            <span className="text-sm font-medium tabular-nums text-stone-500 dark:text-stone-400">
              {formatMoney(totalPending)}
            </span>
          </div>
        </Card>

        {showForm && <NewDebtForm onCreated={() => { setShowForm(false); refetchAll() }} />}

        <div>
          <SectionTitle>Próximos vencimientos</SectionTitle>
          <Card className="divide-y divide-stone-100 p-0 dark:divide-stone-800">
            {upcoming.length === 0 && <p className="p-4 text-sm text-stone-400">No hay cuotas pendientes.</p>}
            {upcoming.slice(0, 15).map((i) => {
              const debt = debts.find((d) => d.id === i.debt_id)
              return (
                <div key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-200">{debt?.name}</p>
                    <p className={`text-xs ${i.urgent ? 'font-semibold text-red-600 dark:text-red-400' : 'text-stone-400'}`}>
                      Vence {formatDate(i.due_date)} · cuota {i.installment_number}/{debt?.installments_count}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-50">
                      {formatMoney(i.amount)}
                    </span>
                    <Button variant="secondary" onClick={() => markPaid(i)} className="px-3 py-2 text-xs">
                      Pagar
                    </Button>
                  </div>
                </div>
              )
            })}
          </Card>
        </div>

        <div>
          <SectionTitle>Todas las deudas</SectionTitle>
          <div className="space-y-3">
            {debts.map((debt) => {
              if (editingDebtId === debt.id) {
                return (
                  <EditDebtForm
                    key={debt.id}
                    debt={debt}
                    onDone={() => {
                      setEditingDebtId(null)
                      refetchAll()
                    }}
                  />
                )
              }
              const { paid, total } = debtProgress(debt, installments)
              const pending = debtPendingBalance(debt, installments)
              return (
                <Card key={debt.id}>
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-stone-900 dark:text-stone-50">{debt.name}</p>
                      <p className="text-xs text-stone-400">{DEBT_TYPE_LABEL[debt.debt_type]}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          debt.status === 'pagada'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
                        }`}
                      >
                        {debt.status === 'pagada' ? 'Pagada' : 'Activa'}
                      </span>
                      <button
                        onClick={() => setEditingDebtId(debt.id)}
                        className="rounded-lg p-1.5 text-stone-400 active:bg-stone-100 dark:active:bg-stone-800"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="mb-2 text-lg font-bold tabular-nums text-stone-900 dark:text-stone-50">
                    {formatMoney(pending)} <span className="text-sm font-normal text-stone-400">pendiente</span>
                  </p>
                  <ProgressBar value={paid} max={total} />
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-xs text-stone-400">
                      {paid}/{total} cuotas pagadas
                    </p>
                    <button
                      onClick={() => deleteDebt(debt)}
                      className="text-xs text-stone-400 underline active:text-red-600"
                    >
                      eliminar
                    </button>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function EditDebtForm({ debt, onDone }: { debt: Debt; onDone: () => void }) {
  const [name, setName] = useState(debt.name)
  const [debtType, setDebtType] = useState<DebtType>(debt.debt_type)
  const [principal, setPrincipal] = useState(debt.principal_amount)
  const [installmentAmount, setInstallmentAmount] = useState(debt.installment_amount)
  const [interestRate, setInterestRate] = useState(debt.interest_rate?.toString() ?? '')
  const [notes, setNotes] = useState(debt.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!name || installmentAmount <= 0) return
    setSaving(true)
    setError(null)
    const { error: debtError } = await supabase
      .from('debts')
      .update({
        name,
        debt_type: debtType,
        principal_amount: principal,
        installment_amount: installmentAmount,
        interest_rate: interestRate ? Number(interestRate) : null,
        notes: notes || null,
      })
      .eq('id', debt.id)
    if (debtError) {
      setError(debtError.message)
      setSaving(false)
      return
    }
    if (installmentAmount !== debt.installment_amount) {
      const { error: instError } = await supabase
        .from('debt_installments')
        .update({ amount: installmentAmount })
        .eq('debt_id', debt.id)
        .eq('status', 'pendiente')
      if (instError) {
        setError(instError.message)
        setSaving(false)
        return
      }
    }
    setSaving(false)
    onDone()
  }

  return (
    <Card className="space-y-3">
      <SectionTitle>Editar deuda</SectionTitle>
      <TextInput placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
      <select
        value={debtType}
        onChange={(e) => setDebtType(e.target.value as DebtType)}
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50"
      >
        {Object.entries(DEBT_TYPE_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <div>
        <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">
          Monto de cada cuota (actualiza las cuotas pendientes)
        </label>
        <MoneyInput value={installmentAmount} onChange={setInstallmentAmount} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Monto total / capital</label>
        <MoneyInput value={principal} onChange={setPrincipal} />
      </div>
      <TextInput
        placeholder="Tasa de interés % (opcional)"
        type="number"
        value={interestRate}
        onChange={(e) => setInterestRate(e.target.value)}
      />
      <TextInput placeholder="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <p className="text-xs text-stone-400">
        Para cambiar la cantidad de cuotas o la fecha de la primera, eliminá esta deuda y cargala de nuevo.
      </p>
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

function NewDebtForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [debtType, setDebtType] = useState<DebtType>('prestamo_bancario')
  const [principal, setPrincipal] = useState(0)
  const [count, setCount] = useState(1)
  const [installmentAmount, setInstallmentAmount] = useState(0)
  const [firstDate, setFirstDate] = useState(todayISO())
  const [interestRate, setInterestRate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || count < 1 || installmentAmount <= 0) return
    setSaving(true)
    setError(null)
    const { data: debt, error: debtError } = await supabase
      .from('debts')
      .insert({
        name,
        debt_type: debtType,
        principal_amount: principal || installmentAmount * count,
        installments_count: count,
        installment_amount: installmentAmount,
        first_installment_date: firstDate,
        interest_rate: interestRate ? Number(interestRate) : null,
        notes: notes || null,
      })
      .select()
      .single()
    if (debtError || !debt) {
      setError(debtError?.message ?? 'No se pudo crear la deuda')
      setSaving(false)
      return
    }
    const dates = generateInstallmentDates(firstDate, count)
    const rows = dates.map((due_date, idx) => ({
      debt_id: debt.id,
      installment_number: idx + 1,
      due_date,
      amount: installmentAmount,
    }))
    const { error: instError } = await supabase.from('debt_installments').insert(rows)
    if (instError) {
      setError(instError.message)
      setSaving(false)
      return
    }
    setSaving(false)
    onCreated()
  }

  return (
    <Card as="form" onSubmit={handleSubmit} className="space-y-3">
      <SectionTitle>Nueva deuda</SectionTitle>
      <TextInput placeholder="Nombre (ej: Crédito Banco Provincia)" value={name} onChange={(e) => setName(e.target.value)} required />
      <select
        value={debtType}
        onChange={(e) => setDebtType(e.target.value as DebtType)}
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50"
      >
        {Object.entries(DEBT_TYPE_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <div>
        <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Monto de cada cuota</label>
        <MoneyInput value={installmentAmount} onChange={setInstallmentAmount} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Cantidad de cuotas</label>
          <TextInput
            type="number"
            min={1}
            value={count}
            onChange={(e) => setCount(Number(e.target.value) || 1)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Monto total / capital</label>
          <MoneyInput value={principal} onChange={setPrincipal} placeholder="opcional" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Fecha de la primera cuota</label>
        <input
          type="date"
          value={firstDate}
          onChange={(e) => setFirstDate(e.target.value)}
          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50"
        />
      </div>
      <TextInput
        placeholder="Tasa de interés % (opcional)"
        type="number"
        value={interestRate}
        onChange={(e) => setInterestRate(e.target.value)}
      />
      <TextInput placeholder="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {error && <Banner tone="bad">{error}</Banner>}
      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? 'Creando…' : 'Crear deuda y generar cuotas'}
      </Button>
    </Card>
  )
}
