import type { Debt, DebtInstallment, Envelope, PaymentMethod, SalesEntry } from '../types'
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

export function upcomingInstallments(installments: DebtInstallment[], withinDays = 5) {
  const today = todayISO()
  return installments
    .filter((i) => i.status === 'pendiente' && i.due_date >= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .map((i) => ({ ...i, urgent: daysBetween(today, i.due_date) <= withinDays }))
}

function daysBetween(aISO: string, bISO: string) {
  const a = new Date(aISO + 'T00:00:00')
  const b = new Date(bISO + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function profitPct(envelopes: Envelope[]) {
  return envelopes.filter((e) => e.is_profit).reduce((sum, e) => sum + e.pct, 0)
}
