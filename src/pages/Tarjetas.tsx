import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useTable } from '../hooks/useTable'
import type { Card, CardPurchase, Envelope, EnvelopeTransaction, ExpenseOrigin } from '../types'
import { formatDate, formatMoney, todayISO } from '../lib/format'
import { Banner, Button, Card as UICard, MoneyInput, PageHeader, SectionTitle, TextInput } from '../components/UI'
import { Check, Trash2 } from 'lucide-react'

const ORIGIN_LABEL: Record<ExpenseOrigin, string> = { local: 'Del local', personal: 'Personal' }

export default function Tarjetas() {
  const { session } = useAuth()
  const { data: cards, refetch: refetchCards } = useTable<Card>('cards', (q) => q.eq('active', true).order('sort_order'))
  const { data: purchases, refetch: refetchPurchases } = useTable<CardPurchase>('card_purchases', (q) =>
    q.order('due_date')
  )
  const { data: envelopes } = useTable<Envelope>('envelopes', (q) => q.eq('active', true))
  const { data: transactions } = useTable<EnvelopeTransaction>('envelope_transactions')

  const withdrawalEnvelope = envelopes.find((e) => e.is_withdrawal_envelope) ?? null
  const suppliesEnvelope = envelopes.find((e) => e.is_supplies_envelope) ?? null
  const balances = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of transactions) map.set(tx.envelope_id, (map.get(tx.envelope_id) ?? 0) + Number(tx.amount))
    return map
  }, [transactions])

  const pending = purchases.filter((p) => p.status === 'pendiente')
  const totalPending = pending.reduce((s, p) => s + p.amount, 0)
  const pendingByCard = new Map<string, number>()
  for (const p of pending) pendingByCard.set(p.card_id, (pendingByCard.get(p.card_id) ?? 0) + p.amount)
  const thisMonthTotal = purchases
    .filter((p) => p.purchase_date.slice(0, 7) === todayISO().slice(0, 7))
    .reduce((s, p) => s + p.amount, 0)
  const upcoming = [...pending].sort((a, b) => a.due_date.localeCompare(b.due_date))

  async function markPaid(purchase: CardPurchase) {
    await supabase.from('card_purchases').update({ status: 'pagada', paid_at: new Date().toISOString() }).eq('id', purchase.id)
    refetchPurchases()
  }

  async function deletePurchase(purchase: CardPurchase) {
    await supabase.from('envelope_transactions').delete().eq('related_type', 'card_purchase').eq('related_id', purchase.id)
    await supabase.from('card_purchases').delete().eq('id', purchase.id)
    refetchPurchases()
  }

  return (
    <div>
      <PageHeader title="Compras con tarjeta" subtitle="MercadoLibre y otras compras a 1 cuota" />
      <div className="space-y-4 p-4">
        <UICard className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-500 dark:text-stone-400">Pendiente de pago</span>
            <span className="text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-50">{formatMoney(totalPending)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-500 dark:text-stone-400">Gastado este mes</span>
            <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-50">{formatMoney(thisMonthTotal)}</span>
          </div>
          {cards.length > 0 && (
            <div className="space-y-1 border-t border-stone-100 pt-2 dark:border-stone-800">
              {cards.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-stone-500 dark:text-stone-400">{c.name}</span>
                  <span className="font-medium tabular-nums text-stone-700 dark:text-stone-300">
                    {formatMoney(pendingByCard.get(c.id) ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </UICard>

        <NewPurchaseForm
          cards={cards}
          onCardCreated={refetchCards}
          onCreated={refetchPurchases}
          suppliesEnvelope={suppliesEnvelope}
          withdrawalEnvelope={withdrawalEnvelope}
          balances={balances}
          userId={session?.user.id}
        />

        <div>
          <SectionTitle>Próximos vencimientos</SectionTitle>
          <UICard className="divide-y divide-stone-100 p-0 dark:divide-stone-800">
            {upcoming.length === 0 && <p className="p-4 text-sm text-stone-400">No hay compras pendientes de pago.</p>}
            {upcoming.map((p) => {
              const card = cards.find((c) => c.id === p.card_id)
              const urgent = daysUntil(p.due_date) <= 5
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-200">
                      {card?.name} {p.description ? `· ${p.description}` : ''}
                    </p>
                    <p className={`text-xs ${urgent ? 'font-semibold text-red-600 dark:text-red-400' : 'text-stone-400'}`}>
                      Vence {formatDate(p.due_date)} · {ORIGIN_LABEL[p.origin]}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-50">{formatMoney(p.amount)}</span>
                    <Button variant="secondary" onClick={() => markPaid(p)} className="px-3 py-2 text-xs">
                      Pagada
                    </Button>
                  </div>
                </div>
              )
            })}
          </UICard>
        </div>

        <div>
          <SectionTitle>Historial</SectionTitle>
          <UICard className="divide-y divide-stone-100 p-0 dark:divide-stone-800">
            {purchases.length === 0 && <p className="p-4 text-sm text-stone-400">Sin compras todavía.</p>}
            {purchases.slice(0, 50).map((p) => {
              const card = cards.find((c) => c.id === p.card_id)
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-stone-700 dark:text-stone-300">
                      <span
                        className={`mr-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                          p.status === 'pagada'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
                        }`}
                      >
                        {p.status === 'pagada' ? 'Pagada' : 'Pendiente'}
                      </span>
                      {card?.name} {p.description ? `· ${p.description}` : ''}
                    </p>
                    <p className="text-xs text-stone-400">
                      Compra {formatDate(p.purchase_date)} · vence {formatDate(p.due_date)} · {ORIGIN_LABEL[p.origin]}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-50">{formatMoney(p.amount)}</span>
                    {p.status === 'pendiente' && (
                      <button
                        onClick={() => markPaid(p)}
                        className="rounded-lg p-1.5 text-stone-400 active:bg-stone-100 dark:active:bg-stone-800"
                        title="Marcar pagada"
                      >
                        <Check size={14} />
                      </button>
                    )}
                    <button onClick={() => deletePurchase(p)} className="rounded-lg p-1.5 text-stone-400 active:bg-stone-100 dark:active:bg-stone-800">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </UICard>
        </div>
      </div>
    </div>
  )
}

function daysUntil(iso: string) {
  const today = new Date(todayISO() + 'T00:00:00')
  const target = new Date(iso + 'T00:00:00')
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function NewPurchaseForm({
  cards,
  onCardCreated,
  onCreated,
  suppliesEnvelope,
  withdrawalEnvelope,
  balances,
  userId,
}: {
  cards: Card[]
  onCardCreated: () => void
  onCreated: () => void
  suppliesEnvelope: Envelope | null
  withdrawalEnvelope: Envelope | null
  balances: Map<string, number>
  userId: string | undefined
}) {
  const [cardId, setCardId] = useState('')
  const [newCardName, setNewCardName] = useState('')
  const [showNewCard, setShowNewCard] = useState(false)
  const [amount, setAmount] = useState(0)
  const [description, setDescription] = useState('')
  const [origin, setOrigin] = useState<ExpenseOrigin>('local')
  const [purchaseDate, setPurchaseDate] = useState(todayISO())
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targetEnvelope = origin === 'local' ? suppliesEnvelope : withdrawalEnvelope
  const targetBalance = targetEnvelope ? (balances.get(targetEnvelope.id) ?? 0) : 0

  async function addCard() {
    if (!newCardName.trim()) return
    const { data, error } = await supabase.from('cards').insert({ name: newCardName.trim() }).select().single()
    if (error) {
      setError(error.message)
      return
    }
    setNewCardName('')
    setShowNewCard(false)
    onCardCreated()
    if (data) setCardId(data.id)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!cardId || amount <= 0 || !dueDate) return
    setSaving(true)
    setError(null)
    const { data: purchase, error: pError } = await supabase
      .from('card_purchases')
      .insert({
        card_id: cardId,
        amount,
        description: description || null,
        origin,
        purchase_date: purchaseDate,
        due_date: dueDate,
        created_by: userId,
      })
      .select()
      .single()
    if (pError || !purchase) {
      setError(pError?.message ?? 'No se pudo registrar la compra')
      setSaving(false)
      return
    }
    if (targetEnvelope) {
      const card = cards.find((c) => c.id === cardId)
      await supabase.from('envelope_transactions').insert({
        envelope_id: targetEnvelope.id,
        amount: -amount,
        type: 'expense_payment',
        description: `Compra tarjeta ${card?.name ?? ''}${description ? ' · ' + description : ''}`,
        related_type: 'card_purchase',
        related_id: purchase.id,
        related_date: purchaseDate,
        created_by: userId,
      })
    }
    setAmount(0)
    setDescription('')
    setDueDate('')
    setSaving(false)
    onCreated()
  }

  return (
    <UICard as="form" onSubmit={handleSubmit} className="space-y-3">
      <SectionTitle>Nueva compra</SectionTitle>

      <div>
        <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Tarjeta</label>
        {!showNewCard ? (
          <div className="flex gap-2">
            <select
              value={cardId}
              onChange={(e) => setCardId(e.target.value)}
              className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50"
            >
              <option value="">Elegir tarjeta…</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button type="button" variant="secondary" onClick={() => setShowNewCard(true)} className="whitespace-nowrap px-3">
              + Nueva
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <TextInput placeholder="Nombre de la tarjeta" value={newCardName} onChange={(e) => setNewCardName(e.target.value)} />
            <Button type="button" variant="secondary" onClick={addCard} className="whitespace-nowrap px-3">
              Guardar
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOrigin('local')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${
            origin === 'local' ? 'bg-amber-700 text-white' : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
          }`}
        >
          Del local
        </button>
        <button
          type="button"
          onClick={() => setOrigin('personal')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${
            origin === 'personal' ? 'bg-amber-700 text-white' : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
          }`}
        >
          Personal
        </button>
      </div>
      {targetEnvelope && (
        <p className="text-xs text-stone-400">
          Sale del sobre <strong>"{targetEnvelope.name}"</strong> · disponible{' '}
          <span className={targetBalance < 0 ? 'font-semibold text-red-600 dark:text-red-400' : ''}>{formatMoney(targetBalance)}</span>
        </p>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Monto</label>
        <MoneyInput value={amount} onChange={setAmount} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Detalle</label>
        <TextInput placeholder="¿Qué compraste?" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Fecha de compra</label>
          <input
            type="date"
            value={purchaseDate}
            max={todayISO()}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Hay que pagarla el</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50"
          />
        </div>
      </div>
      {error && <Banner tone="bad">{error}</Banner>}
      <Button type="submit" className="w-full" disabled={saving || amount <= 0 || !cardId || !dueDate}>
        {saving ? 'Guardando…' : 'Registrar compra'}
      </Button>
    </UICard>
  )
}
