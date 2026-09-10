import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useTable } from '../hooks/useTable'
import type { Envelope, PaymentMethod, SalesEntry } from '../types'
import { computeDayBreakdown, sumBreakdown, pendingSettlement } from '../lib/calculations'
import { formatDate, formatDateLong, formatMoney, todayISO, toISODate } from '../lib/format'
import { Banner, Button, Card, MoneyInput, PageHeader, SectionTitle } from '../components/UI'

export default function Ventas() {
  const { session } = useAuth()
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [amounts, setAmounts] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const { data: methods } = useTable<PaymentMethod>('payment_methods', (q) =>
    q.eq('active', true).order('sort_order')
  )
  const { data: envelopes } = useTable<Envelope>('envelopes', (q) =>
    q.eq('active', true).order('sort_order')
  )

  const fourteenDaysAgo = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 13)
    return toISODate(d)
  }, [])
  const { data: recentEntries, refetch: refetchEntries } = useTable<SalesEntry>(
    'sales_entries',
    (q) => q.gte('sale_date', fourteenDaysAgo).order('sale_date', { ascending: false }),
    [fourteenDaysAgo]
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase.from('sales_entries').select('*').eq('sale_date', selectedDate)
      if (cancelled) return
      if (error) {
        setLoadError(error.message)
        return
      }
      const next: Record<string, number> = {}
      for (const row of (data ?? []) as SalesEntry[]) next[row.payment_method_id] = row.gross_amount
      setAmounts(next)
      setSaved(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selectedDate, recentEntries.length])

  const rows = computeDayBreakdown(amounts, methods)
  const totals = sumBreakdown(rows)
  const pending = pendingSettlement(recentEntries)

  const days: { date: string; net: number }[] = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const e of recentEntries) byDate.set(e.sale_date, (byDate.get(e.sale_date) ?? 0) + e.net_amount)
    return [...byDate.entries()]
      .map(([date, net]) => ({ date, net }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 7)
  }, [recentEntries])

  async function handleSave() {
    setSaving(true)
    setLoadError(null)
    const entryRows = methods.map((pm) => ({
      sale_date: selectedDate,
      payment_method_id: pm.id,
      gross_amount: amounts[pm.id] || 0,
      commission_pct: pm.commission_pct,
      settlement_days: pm.settlement_days,
    }))
    const { error: upsertError } = await supabase
      .from('sales_entries')
      .upsert(entryRows, { onConflict: 'sale_date,payment_method_id' })
    if (upsertError) {
      setLoadError(upsertError.message)
      setSaving(false)
      return
    }

    const netTotal = entryRows.reduce(
      (sum, r) => sum + (r.gross_amount - (r.gross_amount * r.commission_pct) / 100),
      0
    )
    await supabase
      .from('envelope_transactions')
      .delete()
      .eq('related_type', 'sale')
      .eq('related_date', selectedDate)

    if (netTotal > 0 && envelopes.length > 0) {
      const txRows = envelopes.map((e) => ({
        envelope_id: e.id,
        amount: (netTotal * e.pct) / 100,
        type: 'income_distribution' as const,
        description: `Distribución venta ${formatDate(selectedDate)}`,
        related_date: selectedDate,
        related_type: 'sale',
        created_by: session?.user.id,
      }))
      const { error: txError } = await supabase.from('envelope_transactions').insert(txRows)
      if (txError) setLoadError(txError.message)
    }

    setSaving(false)
    setSaved(true)
    refetchEntries()
  }

  return (
    <div>
      <PageHeader title="Carga de ventas" subtitle={formatDateLong(selectedDate)} />
      <div className="space-y-4 p-4">
        <Card>
          <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Día</label>
          <input
            type="date"
            value={selectedDate}
            max={todayISO()}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-amber-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50"
          />
        </Card>

        <Card className="space-y-4">
          <SectionTitle>Venta por medio de pago</SectionTitle>
          {methods.map((pm) => (
            <div key={pm.id}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-sm font-medium text-stone-700 dark:text-stone-300">{pm.name}</span>
                {pm.commission_pct > 0 && (
                  <span className="text-xs text-stone-400">
                    −{pm.commission_pct}% · acredita en {pm.settlement_days}d
                  </span>
                )}
              </div>
              <MoneyInput value={amounts[pm.id] || 0} onChange={(v) => setAmounts((a) => ({ ...a, [pm.id]: v }))} />
            </div>
          ))}
        </Card>

        <Card className="space-y-2">
          <Row label="Total facturado" value={formatMoney(totals.gross)} />
          <Row label="Comisiones descontadas" value={`− ${formatMoney(totals.commission)}`} muted />
          <div className="my-1 border-t border-stone-200 dark:border-stone-800" />
          <Row label="Neto que entra a caja" value={formatMoney(totals.net)} bold />
        </Card>

        {loadError && <Banner tone="bad">{loadError}</Banner>}
        {saved && !loadError && <Banner tone="good">Guardado y repartido en los sobres ✓</Banner>}

        <Button className="w-full" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar día'}
        </Button>

        {pending > 0 && (
          <Banner tone="info">
            Plata vendida y todavía no acreditada: <strong>{formatMoney(pending)}</strong>
          </Banner>
        )}

        <div>
          <SectionTitle>Últimos días</SectionTitle>
          <Card className="divide-y divide-stone-100 p-0 dark:divide-stone-800">
            {days.length === 0 && <p className="p-4 text-sm text-stone-400">Todavía no cargaste ventas.</p>}
            {days.map((d) => (
              <button
                key={d.date}
                onClick={() => setSelectedDate(d.date)}
                className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-stone-50 dark:active:bg-stone-800"
              >
                <span className="text-sm text-stone-600 dark:text-stone-300">{formatDate(d.date)}</span>
                <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-50">
                  {formatMoney(d.net)}
                </span>
              </button>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${muted ? 'text-stone-400' : 'text-stone-600 dark:text-stone-300'}`}>{label}</span>
      <span
        className={`tabular-nums ${bold ? 'text-lg font-bold text-stone-900 dark:text-stone-50' : 'text-sm text-stone-700 dark:text-stone-300'}`}
      >
        {value}
      </span>
    </div>
  )
}
