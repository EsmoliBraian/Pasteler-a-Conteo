import { useMemo } from 'react'
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { useTable } from '../hooks/useTable'
import type {
  AppSettings,
  CardPurchase,
  CashCount,
  Debt,
  DebtInstallment,
  Envelope,
  EnvelopeTransaction,
  FixedExpense,
  PaymentMethod,
  SalesEntry,
} from '../types'
import {
  daysWithSales,
  debtPendingBalance,
  installmentsDueInMonth,
  monthlyBreakevenDaily,
  profitPct,
  projectedMonthlyNet,
  upcomingInstallments,
} from '../lib/calculations'
import { currentPeriod, daysInMonth, formatDate, formatMoney, formatMoneyCompact, toISODate, todayISO } from '../lib/format'
import { Banner, Card, PageHeader, SectionTitle, StatTile } from '../components/UI'

const STATUS_GOOD = '#0ca30c'
const STATUS_CRITICAL = '#d03b3b'

export default function Dashboard() {
  const period = currentPeriod()
  const today = todayISO()
  const [year, month] = period.split('-').map(Number)
  const firstOfMonth = `${period}-01`

  const windowStart = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 44)
    return toISODate(d)
  }, [])

  const { data: entries } = useTable<SalesEntry>('sales_entries', (q) => q.gte('sale_date', windowStart), [windowStart])
  const { data: envelopes } = useTable<Envelope>('envelopes', (q) => q.eq('active', true).order('sort_order'))
  const { data: transactions } = useTable<EnvelopeTransaction>('envelope_transactions')
  const { data: debts } = useTable<Debt>('debts', (q) => q.eq('status', 'activa'))
  const { data: installments } = useTable<DebtInstallment>('debt_installments', (q) => q.order('due_date'))
  const { data: fixedExpenses } = useTable<FixedExpense>('fixed_expenses', (q) => q.eq('active', true))
  const { data: settingsRows } = useTable<AppSettings>('app_settings')
  const { data: methods } = useTable<PaymentMethod>('payment_methods', (q) => q.eq('active', true).order('sort_order'))
  const { data: cashCounts } = useTable<CashCount>('cash_counts', (q) => q.order('created_at', { ascending: false }))
  const { data: cardPurchases } = useTable<CardPurchase>('card_purchases', (q) => q.eq('status', 'pendiente').order('due_date'))
  const settings = settingsRows[0]

  const monthEntries = entries.filter((e) => e.sale_date >= firstOfMonth)
  const monthGross = monthEntries.reduce((s, e) => s + e.gross_amount, 0)
  const monthNet = monthEntries.reduce((s, e) => s + e.net_amount, 0)
  const monthCommission = monthGross - monthNet

  const profitPercent = profitPct(envelopes)
  const gananciaMes = (monthNet * profitPercent) / 100
  const totalDaysMonth = daysInMonth(year, month)
  // Ojo: proyectamos al ritmo de los DÍAS CON VENTA CARGADA este mes (no el
  // día del calendario), porque si recién empezaste a cargar datos esta
  // semana aunque el mes ya iba más avanzado, la proyección no queda
  // artificialmente baja.
  const daysWithSalesThisMonth = daysWithSales(monthEntries)
  const netProyectadoMes = projectedMonthlyNet(monthEntries, totalDaysMonth)
  const proyeccion = daysWithSalesThisMonth > 0 ? (gananciaMes / daysWithSalesThisMonth) * totalDaysMonth : 0

  const retiroPct = envelopes.find((e) => e.is_withdrawal_envelope)?.pct ?? 0
  const retiroSanoProyectado = (netProyectadoMes * retiroPct) / 100

  const latestCountByMethod = useMemo(() => {
    const map = new Map<string, CashCount>()
    for (const c of cashCounts) if (!map.has(c.payment_method_id)) map.set(c.payment_method_id, c)
    return map
  }, [cashCounts])
  const totalOnHand = methods.reduce((sum, m) => sum + (latestCountByMethod.get(m.id)?.counted_amount ?? 0), 0)

  const breakevenMonthly = settings?.monthly_breakeven ?? 0
  const breakevenToday = monthlyBreakevenDaily(breakevenMonthly, today)
  const todayNet = entries.filter((e) => e.sale_date === today).reduce((s, e) => s + e.net_amount, 0)
  const todayLoaded = entries.some((e) => e.sale_date === today)
  const superoHoy = todayNet >= breakevenToday

  const chartDays = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const e of entries) byDate.set(e.sale_date, (byDate.get(e.sale_date) ?? 0) + e.net_amount)
    const days: { date: string; net: number; breakeven: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const iso = toISODate(d)
      days.push({ date: iso, net: byDate.get(iso) ?? 0, breakeven: monthlyBreakevenDaily(breakevenMonthly, iso) })
    }
    return days
  }, [entries, breakevenMonthly])

  const envelopeBalances = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of transactions) map.set(tx.envelope_id, (map.get(tx.envelope_id) ?? 0) + Number(tx.amount))
    return map
  }, [transactions])

  const totalDebtPending = debts.reduce((s, d) => s + debtPendingBalance(d, installments), 0)
  const nextDue = upcomingInstallments(installments)[0]
  const debtMonthlyCommitment = installmentsDueInMonth(installments).reduce((s, i) => s + i.amount, 0)
  const fixedExpensesTotal = fixedExpenses.reduce((s, e) => s + e.amount, 0)
  const monthlyCommitments = fixedExpensesTotal + debtMonthlyCommitment
  const pctComprometido = totalOnHand > 0 ? (monthlyCommitments / totalOnHand) * 100 : null

  const totalCardPending = cardPurchases.reduce((s, p) => s + p.amount, 0)
  const nextCardDue = cardPurchases[0]

  const withdrawalEnvelope = envelopes.find((e) => e.is_withdrawal_envelope)
  const retirable = withdrawalEnvelope ? Math.max(0, envelopeBalances.get(withdrawalEnvelope.id) ?? 0) : 0

  return (
    <div>
      <PageHeader title="Panel principal" subtitle={formatDate(today)} />
      <div className="space-y-4 p-4">
        <Card className="space-y-1">
          <p className="text-xs font-medium text-stone-500 dark:text-stone-400">Ganancia del mes a la fecha</p>
          <p className="text-3xl font-bold tabular-nums text-stone-900 dark:text-stone-50">{formatMoney(gananciaMes)}</p>
          <p className="text-xs text-stone-400">
            Proyección al cierre: {formatMoney(proyeccion)}
            {daysWithSalesThisMonth > 0 && daysWithSalesThisMonth < totalDaysMonth && (
              <> (con {daysWithSalesThisMonth} día{daysWithSalesThisMonth === 1 ? '' : 's'} cargado{daysWithSalesThisMonth === 1 ? '' : 's'} este mes)</>
            )}
          </p>
        </Card>

        <Card className="space-y-3">
          <SectionTitle>Plata en mano</SectionTitle>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {methods.map((m) => {
              const c = latestCountByMethod.get(m.id)
              return (
                <div key={m.id}>
                  <p className="text-xs text-stone-500 dark:text-stone-400">{m.name}</p>
                  <p className="text-lg font-bold tabular-nums text-stone-900 dark:text-stone-50">
                    {c ? formatMoneyCompact(c.counted_amount) : '—'}
                  </p>
                  {c && <p className="text-[11px] text-stone-400">{formatDate(c.count_date)}</p>}
                </div>
              )
            })}
          </div>
          <div className="border-t border-stone-100 pt-2 dark:border-stone-800">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-stone-700 dark:text-stone-300">Total en mano</span>
              <span className="text-lg font-bold tabular-nums text-stone-900 dark:text-stone-50">{formatMoney(totalOnHand)}</span>
            </div>
            {pctComprometido !== null ? (
              <p
                className={`text-xs ${
                  pctComprometido >= 100
                    ? 'font-semibold text-red-600 dark:text-red-400'
                    : pctComprometido >= 70
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-stone-400'
                }`}
              >
                {pctComprometido.toFixed(0)}% ya tiene destino este mes ({formatMoney(monthlyCommitments)} en gastos fijos +
                cuotas)
              </p>
            ) : (
              <p className="text-xs text-stone-400">Cargá un conteo en Más → Conteo de caja para ver esto.</p>
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between">
            <SectionTitle>Punto de equilibrio de hoy</SectionTitle>
            {todayLoaded && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  superoHoy
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                }`}
              >
                {superoHoy ? 'Superado ✓' : 'No llegó'}
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between">
            <StatTile label="Vendido hoy (neto)" value={formatMoney(todayNet)} tone={todayLoaded ? (superoHoy ? 'good' : 'bad') : 'default'} />
            <StatTile label="Equilibrio diario" value={formatMoney(breakevenToday)} />
          </div>
        </Card>

        <Card>
          <SectionTitle>Últimos 14 días</SectionTitle>
          <div className="mb-2 flex gap-3 text-xs text-stone-500 dark:text-stone-400">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: STATUS_GOOD }} /> Superó equilibrio
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: STATUS_CRITICAL }} /> No llegó
            </span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartDays} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(8, 10)}
                tick={{ fontSize: 11, fill: '#898781' }}
                axisLine={{ stroke: '#e1e0d9' }}
                tickLine={false}
              />
              <Tooltip
                formatter={(value) => formatMoney(Number(value))}
                labelFormatter={(label) => formatDate(String(label))}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <ReferenceLine y={breakevenToday} stroke="#898781" strokeDasharray="3 3" />
              <Bar dataKey="net" radius={[4, 4, 0, 0]}>
                {chartDays.map((d) => (
                  <Cell key={d.date} fill={d.net >= d.breakeven ? STATUS_GOOD : STATUS_CRITICAL} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile label="Facturado (mes)" value={formatMoneyCompact(monthGross)} />
          <StatTile label="Neto a caja (mes)" value={formatMoneyCompact(monthNet)} />
          <StatTile label="Comisiones pagadas" value={formatMoneyCompact(monthCommission)} tone="warn" />
          <StatTile label="Compromisos mensuales (cuotas)" value={formatMoneyCompact(debtMonthlyCommitment)} />
        </Card>

        <div>
          <SectionTitle>Sobres</SectionTitle>
          <Card className="divide-y divide-stone-100 p-0 dark:divide-stone-800">
            {envelopes.map((e) => {
              const balance = envelopeBalances.get(e.id) ?? 0
              return (
                <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-stone-600 dark:text-stone-300">{e.name}</span>
                  <span className={`font-semibold tabular-nums ${balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-stone-900 dark:text-stone-50'}`}>
                    {formatMoney(balance)}
                  </span>
                </div>
              )
            })}
          </Card>
        </div>

        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-500 dark:text-stone-400">Deuda pendiente total</span>
            <span className="text-xl font-bold tabular-nums text-stone-900 dark:text-stone-50">{formatMoney(totalDebtPending)}</span>
          </div>
          {nextDue && (
            <p className={`text-xs ${nextDue.urgent ? 'font-semibold text-red-600 dark:text-red-400' : 'text-stone-400'}`}>
              Próximo vencimiento: {formatDate(nextDue.due_date)} · {formatMoney(nextDue.amount)}
            </p>
          )}
          {!nextDue && <p className="text-xs text-stone-400">Sin cuotas pendientes.</p>}
        </Card>

        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-500 dark:text-stone-400">Tarjetas de crédito pendientes</span>
            <span className="text-xl font-bold tabular-nums text-stone-900 dark:text-stone-50">{formatMoney(totalCardPending)}</span>
          </div>
          {nextCardDue ? (
            <p className="text-xs text-stone-400">
              Próximo vencimiento: {formatDate(nextCardDue.due_date)} · {formatMoney(nextCardDue.amount)}
            </p>
          ) : (
            <p className="text-xs text-stone-400">Sin compras pendientes de pago.</p>
          )}
        </Card>

        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-500 dark:text-stone-400">Podemos retirar este mes</span>
            <span className="text-xl font-bold tabular-nums text-stone-900 dark:text-stone-50">{formatMoney(retirable)}</span>
          </div>
          <p className="text-xs text-stone-400">Ya asignado en el sobre de Retiro, sin comprometer gastos fijos ({formatMoney(fixedExpensesTotal)}) ni cuotas de deuda.</p>
          <div className="flex items-center justify-between border-t border-stone-100 pt-2 dark:border-stone-800">
            <span className="text-sm text-stone-500 dark:text-stone-400">Retiro sano proyectado (mes completo)</span>
            <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-50">{formatMoney(retiroSanoProyectado)}</span>
          </div>
          <p className="text-xs text-stone-400">
            {retiroPct}% de la venta neta, proyectada al ritmo de los {daysWithSalesThisMonth || 0} días de ventas cargados
            este mes.
          </p>
        </Card>

        {!settings && <Banner tone="info">Cargá el punto de equilibrio mensual en Ajustes para ver estos indicadores.</Banner>}
      </div>
    </div>
  )
}
