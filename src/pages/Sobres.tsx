import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useTable } from '../hooks/useTable'
import type { Envelope, EnvelopeTransaction } from '../types'
import { formatMoney } from '../lib/format'
import { Banner, Button, Card, MoneyInput, PageHeader } from '../components/UI'

export default function Sobres() {
  const { session } = useAuth()
  const { data: envelopes } = useTable<Envelope>('envelopes', (q) => q.eq('active', true).order('sort_order'))
  const { data: transactions, refetch } = useTable<EnvelopeTransaction>('envelope_transactions')
  const [adjustingId, setAdjustingId] = useState<string | null>(null)

  const balances = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of transactions) map.set(tx.envelope_id, (map.get(tx.envelope_id) ?? 0) + Number(tx.amount))
    return map
  }, [transactions])

  return (
    <div>
      <PageHeader title="Sobres" subtitle="Reparto automático del neto" />
      <div className="space-y-3 p-4">
        <Banner tone="info">
          Si un sobre no refleja lo que realmente tenés (por ejemplo, porque venís pagando cosas por fuera de la app
          desde antes), tocá "Ajustar saldo" para ponerlo al día.
        </Banner>
        {envelopes.map((e) => {
          const balance = balances.get(e.id) ?? 0
          if (adjustingId === e.id) {
            return (
              <AdjustBalanceForm
                key={e.id}
                envelope={e}
                currentBalance={balance}
                userId={session?.user.id}
                onDone={() => {
                  setAdjustingId(null)
                  refetch()
                }}
              />
            )
          }
          return (
            <Card key={e.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-neutral-900 dark:text-neutral-50">
                    {e.name} <span className="font-normal text-neutral-400">· {e.pct}%</span>
                  </p>
                  {e.description && <p className="text-xs text-neutral-400">{e.description}</p>}
                </div>
                <span
                  className={`text-lg font-bold tabular-nums ${
                    balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-neutral-900 dark:text-neutral-50'
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
              <button
                onClick={() => setAdjustingId(e.id)}
                className="mt-2 text-xs text-neutral-400 underline active:text-amber-700"
              >
                Ajustar saldo
              </button>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function AdjustBalanceForm({
  envelope,
  currentBalance,
  userId,
  onDone,
}: {
  envelope: Envelope
  currentBalance: number
  userId: string | undefined
  onDone: () => void
}) {
  const [realBalance, setRealBalance] = useState(currentBalance)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const delta = realBalance - currentBalance
    if (delta === 0) {
      onDone()
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('envelope_transactions').insert({
      envelope_id: envelope.id,
      amount: delta,
      type: 'adjustment',
      description: 'Ajuste de saldo',
      created_by: userId,
    })
    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }
    setSaving(false)
    onDone()
  }

  return (
    <Card className="space-y-2">
      <p className="font-semibold text-neutral-900 dark:text-neutral-50">{envelope.name}</p>
      <p className="text-xs text-neutral-400">
        El sistema calcula {formatMoney(currentBalance)}. Poné cuánto hay en realidad y la diferencia queda registrada
        como un ajuste.
      </p>
      <MoneyInput value={realBalance} onChange={setRealBalance} />
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
