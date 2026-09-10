import type {
  Debt,
  DebtInstallment,
  Envelope,
  Expense,
  FixedExpensePayment,
  PaymentMethod,
  SalesEntry,
  Withdrawal,
} from '../types'
import { daysInMonth, toISODate, todayISO } from './format'

export function addMonthsClamped(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  const day = d.getDate()
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, lastDay))
  return toISODate(target)
}

export function generateInstallmentDates(firstDate: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonthsClamped(firstDate, i))
}

export type SaleBreakdownRow = {
  payment_method: PaymentMethod
  gross: number
  commission: number
  net: number
}

export function computeDayBreakdown(
  amounts: Record<string, number>,
  methods: PaymentMethod[]
): SaleBreakdownRow[] {
  return methods.map((pm) => {
    const gross = amounts[pm.id] || 0
    const commission = gross * (pm.commission_pct / 100)
    return { payment_method: pm, gross, commission, net: gross - commission }
  })
}

export function sumBreakdown(rows: SaleBreakdownRow[]) {
  return rows.reduce(
    (acc, r) => ({
      gross: acc.gross + r.gross,
      commission: acc.commission + r.commission,
      net: acc.net + r.net,
    }),
    { gross: 0, commission: 0, net: 0 }
  )
}

export function distributeAcrossEnvelopes(netAmount: number, envelopes: Envelope[]) {
  return envelopes.map((e) => ({ envelope: e, amount: (netAmount * e.pct) / 100 }))
}

export function pendingSettlement(entries: SalesEntry[], asOfISO: string = todayISO()) {
  return entries
    .filter((e) => e.settles_on > asOfISO)
    .reduce((sum, e) => sum + e.net_amount, 0)
}

export function monthlyBreakevenDaily(monthlyBreakeven: number, referenceISO: string = todayISO()) {
  const [y, m] = referenceISO.split('-').map(Number)
  return monthlyBreakeven / daysInMonth(y, m)
}

export function debtPendingBalance(debt: Debt, installments: DebtInstallment[]) {
  return installments
    .filter((i) => i.debt_id === debt.id && i.status === 'pendiente')
    .reduce((sum, i) => sum + i.amount, 0)
}

export function debtProgress(debt: Debt, installments: DebtInstallment[]) {
  const own = installments.filter((i) => i.debt_id === debt.id)
  const paid = own.filter((i) => i.status === 'pagada').length
  return { paid, total: own.length || debt.installments_count }
}

export function installmentsDueInMonth(installments: DebtInstallment[], period: string = currentPeriodOf()) {
  return installments.filter((i) => i.due_date.startsWith(period) && i.status === 'pendiente')
}

function currentPeriodOf() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function upcomingInstallments(
  installments: DebtInstallment[],
  opts: { windowDays?: number; urgentDays?: number } = {}
) {
  const { windowDays = 20, urgentDays = 5 } = opts
  const today = todayISO()
  return installments
    .filter((i) => i.status === 'pendiente')
    .map((i) => ({ ...i, daysUntil: daysBetween(today, i.due_date) }))
    // incluye vencidas (daysUntil negativo, para no esconder una cuota impaga) y
    // las que vencen dentro de la ventana pedida
    .filter((i) => i.daysUntil <= windowDays)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .map((i) => ({ ...i, urgent: i.daysUntil <= urgentDays }))
}

function daysBetween(aISO: string, bISO: string) {
  const a = new Date(aISO + 'T00:00:00')
  const b = new Date(bISO + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function profitPct(envelopes: Envelope[]) {
  return envelopes.filter((e) => e.is_profit).reduce((sum, e) => sum + e.pct, 0)
}

/** Cantidad de días distintos con venta cargada dentro de las entradas dadas. */
export function daysWithSales(entries: SalesEntry[]) {
  return new Set(entries.map((e) => e.sale_date)).size
}

/**
 * Proyecta el neto del mes al ritmo de los días que YA se cargaron (no al
 * ritmo del día del calendario) — así, si recién empezaste a cargar ventas
 * esta semana aunque el mes ya iba más avanzado, la proyección no queda
 * artificialmente baja.
 */
export function projectedMonthlyNet(monthEntries: SalesEntry[], totalDaysInMonth: number) {
  const days = daysWithSales(monthEntries)
  if (days === 0) return 0
  const net = monthEntries.reduce((sum, e) => sum + e.net_amount, 0)
  return (net / days) * totalDaysInMonth
}

/**
 * Cuánto "debería" haber acumulado en un medio de pago: neto vendido por ese
 * medio, menos los gastos y retiros que se marcaron explícitamente como
 * salidos de ese medio. No conoce gastos fijos/deudas (esos se pagan aparte,
 * no de la plata física en efectivo/alias/posnet/QR).
 */
export function expectedBalanceByMethod(
  paymentMethodId: string,
  salesEntries: SalesEntry[],
  expenses: Expense[],
  withdrawals: Withdrawal[],
  fixedExpensePayments: FixedExpensePayment[] = [],
  debtInstallments: DebtInstallment[] = []
) {
  const sales = salesEntries
    .filter((e) => e.payment_method_id === paymentMethodId)
    .reduce((sum, e) => sum + e.net_amount, 0)
  const spent = expenses
    .filter((e) => e.payment_method_id === paymentMethodId)
    .reduce((sum, e) => sum + e.amount, 0)
  const withdrawn = withdrawals
    .filter((w) => w.payment_method_id === paymentMethodId)
    .reduce((sum, w) => sum + w.amount, 0)
  const fixedPaid = fixedExpensePayments
    .filter((p) => p.payment_method_id === paymentMethodId)
    .reduce((sum, p) => sum + p.amount, 0)
  const installmentsPaid = debtInstallments
    .filter((i) => i.payment_method_id === paymentMethodId)
    .reduce((sum, i) => sum + (i.paid_amount ?? i.amount), 0)
  return sales - spent - withdrawn - fixedPaid - installmentsPaid
}
