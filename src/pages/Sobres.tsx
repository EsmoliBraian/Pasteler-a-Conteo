import { useMemo } from 'react'
import { useTable } from '../hooks/useTable'
import type { Envelope, EnvelopeTransaction } from '../types'
import { formatMoney } from '../lib/format'
import { Banner, Card, PageHeader } from '../components/UI'

export default function Sobres() {
  const { data: envelopes } = useTable<Envelope>('envelopes', (q) => q.eq('active', true).order('sort_order'))
  const { data: transactions } = useTable<EnvelopeTransaction>('envelope_transactions')

  const balances = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of transactions) map.set(tx.envelope_id, (map.get(tx.envelope_id) ?? 0) + Number(tx.amount))
    return map
  }, [transactions])

  return (
    <div>
      <PageHeader title="Sobres" subtitle="Reparto automático del neto" />
      <div className="space-y-3 p-4">
        {envelopes.map((e) => {
          const balance = balances.get(e.id) ?? 0
          return (
            <Card key={e.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900 dark:text-stone-50">
                    {e.name} <span className="font-normal text-stone-400">· {e.pct}%</span>
                  </p>
                  {e.description && <p className="text-xs text-stone-400">{e.description}</p>}
                </div>
                <span
                  className={`text-lg font-bold tabular-nums ${
                    balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-stone-900 dark:text-stone-50'
                  }`}
                >
                  {formatMoney(balance)}
                </span>
              </div>
              {balance < 0 && (
                <div className="mt-2">
                  <Banner tone="bad">Este sobre está en negativo.</Banner>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
