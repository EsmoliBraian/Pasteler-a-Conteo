import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useTable } from '../hooks/useTable'
import type { Envelope, EnvelopeTransaction } from '../types'
import { formatDate, formatMoney } from '../lib/format'
import { Banner, Button, Card, MoneyInput, PageHeader, SectionTitle, TextInput } from '../components/UI'
import { ChevronDown, ChevronUp } from 'lucide-react'

export default function Sobres() {
  const { data: envelopes } = useTable<Envelope>('envelopes', (q) => q.eq('active', true).order('sort_order'))
  const { data: transactions, refetch } = useTable<EnvelopeTransaction>('envelope_transactions', (q) =>
    q.order('created_at', { ascending: false })
  )
  const [openId, setOpenId] = useState<string | null>(null)

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
          const isOpen = openId === e.id
          return (
            <Card key={e.id} className="p-0">
              <button
                className="flex w-full items-center justify-between px-4 py-3.5 text-left"
                onClick={() => setOpenId(isOpen ? null : e.id)}
              >
                <div>
                  <p className="font-semibold text-stone-900 dark:text-stone-50">
                    {e.name} <span className="font-normal text-stone-400">· {e.pct}%</span>
                  </p>
                  {e.description && <p className="text-xs text-stone-400">{e.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-lg font-bold tabular-nums ${
                      balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-stone-900 dark:text-stone-50'
                    }`}
                  >
                    {formatMoney(balance)}
                  </span>
                  {isOpen ? <ChevronUp size={18} className="text-stone-400" /> : <ChevronDown size={18} className="text-stone-400" />}
                </div>
              </button>
              {balance < 0 && (
                <div className="px-4 pb-3">
                  <Banner tone="bad">Este sobre está en negativo.</Banner>
                </div>
              )}
              {isOpen && (
                <EnvelopeDetail
                  envelope={e}
                  transactions={transactions.filter((t) => t.envelope_id === e.id)}
                  onSaved={refetch}
                />
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function EnvelopeDetail({
  envelope,
  transactions,
  onSaved,
}: {
  envelope: Envelope
  transactions: EnvelopeTransaction[]
  onSaved: () => void
}) {
  const { session } = useAuth()
  const [kind, setKind] = useState<'egreso' | 'ingreso'>('egreso')
  const [amount, setAmount] = useState(0)
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    if (amount <= 0) return
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('envelope_transactions').insert({
      envelope_id: envelope.id,
      amount: kind === 'egreso' ? -amount : amount,
      type: kind === 'egreso' ? 'expense_payment' : 'adjustment',
      description: description || (kind === 'egreso' ? 'Pago registrado' : 'Ajuste manual'),
      created_by: session?.user.id,
    })
    if (error) setError(error.message)
    else {
      setAmount(0)
      setDescription('')
      onSaved()
    }
    setSaving(false)
  }

  return (
    <div className="space-y-3 border-t border-stone-100 px-4 py-3 dark:border-stone-800">
      <div className="flex gap-2">
        <button
          onClick={() => setKind('egreso')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${
            kind === 'egreso' ? 'bg-red-600 text-white' : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
          }`}
        >
          Pago / egreso
        </button>
        <button
          onClick={() => setKind('ingreso')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${
            kind === 'ingreso' ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
          }`}
        >
          Ajuste / ingreso
        </button>
      </div>
      <MoneyInput value={amount} onChange={setAmount} />
      <TextInput placeholder="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      {error && <Banner tone="bad">{error}</Banner>}
      <Button variant="secondary" className="w-full" onClick={handleAdd} disabled={saving || amount <= 0}>
        {saving ? 'Guardando…' : 'Registrar movimiento'}
      </Button>

      <div>
        <SectionTitle>Historial</SectionTitle>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {transactions.length === 0 && <p className="text-sm text-stone-400">Sin movimientos todavía.</p>}
          {transactions.slice(0, 40).map((tx) => (
            <div key={tx.id} className="flex items-center justify-between py-1.5 text-sm">
              <div className="min-w-0 pr-2">
                <p className="truncate text-stone-700 dark:text-stone-300">{tx.description || tx.type}</p>
                <p className="text-xs text-stone-400">{formatDate(tx.created_at.slice(0, 10))}</p>
              </div>
              <span className={`shrink-0 font-medium tabular-nums ${tx.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {tx.amount < 0 ? '' : '+'}
                {formatMoney(tx.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
