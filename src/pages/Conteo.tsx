import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTable } from '../hooks/useTable'
import type { CashCount, DebtInstallment, Expense, FixedExpensePayment, PaymentMethod, SalesEntry, Withdrawal } from '../types'
import { expectedBalanceByMethod } from '../lib/calculations'
import { formatDate, formatMoney, todayISO } from '../lib/format'
import { Banner, Button, Card, MoneyInput, PageHeader, SectionTitle } from '../components/UI'

export default function Conteo() {
  const { data: methods } = useTable<PaymentMethod>('payment_methods', (q) => q.eq('active', true).order('sort_order'))
  const { data: salesEntries } = useTable<SalesEntry>('sales_entries')
  const { data: expenses } = useTable<Expense>('expenses')
  const { data: withdrawals } = useTable<Withdrawal>('withdrawals')
  const { data: fixedExpensePayments } = useTable<FixedExpensePayment>('fixed_expense_payments')
  const { data: debtInstallments } = useTable<DebtInstallment>('debt_installments', (q) => q.eq('status', 'pagada'))
  const { data: counts, refetch: refetchCounts } = useTable<CashCount>('cash_counts', (q) =>
    q.order('created_at', { ascending: false })
  )

  return (
    <div>
      <PageHeader title="Conteo de caja" subtitle="Comparar lo que tenés contra lo esperado" />
      <div className="space-y-3 p-4">
        <Banner tone="info">
          "Esperado" = neto vendido por ese medio, menos los gastos, retiros, gastos fijos y cuotas de deuda que
          marcaste como pagados desde ahí.
        </Banner>
        {methods.map((pm) => {
          const expected = expectedBalanceByMethod(pm.id, salesEntries, expenses, withdrawals, fixedExpensePayments, debtInstallments)
          const lastCount = counts.find((c) => c.payment_method_id === pm.id)
          return (
            <MethodCounter key={pm.id} method={pm} expected={expected} lastCount={lastCount} onSaved={refetchCounts} />
          )
        })}

        <div>
          <SectionTitle>Historial de conteos</SectionTitle>
          <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
            {counts.length === 0 && <p className="p-4 text-sm text-neutral-400">Todavía no registraste ningún conteo.</p>}
            {counts.slice(0, 30).map((c) => {
              const method = methods.find((m) => m.id === c.payment_method_id)
              const diff = c.counted_amount - c.expected_amount
              return (
                <div key={c.id} className="flex items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">{method?.name}</p>
                    <p className="text-xs text-neutral-400">{formatDate(c.count_date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-neutral-400">
                      contado {formatMoney(c.counted_amount)} · esperado {formatMoney(c.expected_amount)}
                    </p>
                    <p
                      className={`font-semibold tabular-nums ${
                        Math.abs(diff) < 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {diff >= 0 ? '+' : ''}
                      {formatMoney(diff)}
                    </p>
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

function MethodCounter({
  method,
  expected,
  lastCount,
  onSaved,
}: {
  method: PaymentMethod
  expected: number
  lastCount?: CashCount
  onSaved: () => void
}) {
  const [counted, setCounted] = useState(0)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<number | null>(null)

  async function register() {
    setSaving(true)
    await supabase.from('cash_counts').insert({
      payment_method_id: method.id,
      expected_amount: expected,
      counted_amount: counted,
      count_date: todayISO(),
    })
    setResult(counted - expected)
    setCounted(0)
    setSaving(false)
    onSaved()
  }

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-neutral-900 dark:text-neutral-50">{method.name}</p>
        <p className="text-sm text-neutral-400">
          Esperado: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{formatMoney(expected)}</span>
        </p>
      </div>
      <div className="flex gap-2">
        <MoneyInput value={counted} onChange={setCounted} placeholder="Cuánto contás ahora" />
        <Button variant="secondary" onClick={register} disabled={saving} className="whitespace-nowrap">
          Registrar
        </Button>
      </div>
      {result !== null && (
        <Banner tone={Math.abs(result) < 1 ? 'good' : 'warn'}>
          Diferencia: {result >= 0 ? '+' : ''}
          {formatMoney(result)}
        </Banner>
      )}
      {result === null && lastCount && (
        <p className="text-xs text-neutral-400">
          Último conteo: {formatDate(lastCount.count_date)}, diferencia {formatMoney(lastCount.counted_amount - lastCount.expected_amount)}
        </p>
      )}
    </Card>
  )
}
