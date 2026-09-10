import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useTable } from '../hooks/useTable'
import type { AppSettings, Envelope, PaymentMethod } from '../types'
import { formatMoney } from '../lib/format'
import { Banner, Button, Card, MoneyInput, PageHeader, SectionTitle, TextInput } from '../components/UI'
import { Pencil } from 'lucide-react'

export default function Ajustes() {
  const { signOut } = useAuth()
  const { data: methods, refetch: refetchMethods } = useTable<PaymentMethod>('payment_methods', (q) =>
    q.eq('active', true).order('sort_order')
  )
  const { data: envelopes, refetch: refetchEnvelopes } = useTable<Envelope>('envelopes', (q) =>
    q.eq('active', true).order('sort_order')
  )
  const { data: settingsRows, refetch: refetchSettings } = useTable<AppSettings>('app_settings')
  const settings = settingsRows[0]

  const [editingMethod, setEditingMethod] = useState<string | null>(null)
  const [editingEnvelope, setEditingEnvelope] = useState<string | null>(null)

  const pctTotal = envelopes.reduce((s, e) => s + e.pct, 0)

  return (
    <div>
      <PageHeader title="Ajustes" />
      <div className="space-y-4 p-4">
        <div>
          <SectionTitle>Medios de pago</SectionTitle>
          <div className="space-y-2">
            {methods.map((pm) =>
              editingMethod === pm.id ? (
                <EditMethodForm key={pm.id} method={pm} onDone={() => { setEditingMethod(null); refetchMethods() }} />
              ) : (
                <Card key={pm.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-neutral-800 dark:text-neutral-200">{pm.name}</p>
                    <p className="text-xs text-neutral-400">
                      Comisión {pm.commission_pct}% · acredita en {pm.settlement_days} días
                    </p>
                  </div>
                  <button
                    onClick={() => setEditingMethod(pm.id)}
                    className="rounded-lg p-2 text-neutral-400 active:bg-neutral-100 dark:active:bg-neutral-800"
                  >
                    <Pencil size={16} />
                  </button>
                </Card>
              )
            )}
          </div>
        </div>

        <div>
          <SectionTitle>Sobres (reparto del neto)</SectionTitle>
          {pctTotal !== 100 && (
            <div className="mb-2">
              <Banner tone="warn">Los porcentajes suman {pctTotal}%, deberían sumar 100%.</Banner>
            </div>
          )}
          <div className="space-y-2">
            {envelopes.map((e) =>
              editingEnvelope === e.id ? (
                <EditEnvelopeForm key={e.id} envelope={e} onDone={() => { setEditingEnvelope(null); refetchEnvelopes() }} />
              ) : (
                <Card key={e.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-neutral-800 dark:text-neutral-200">{e.name}</p>
                    <p className="text-xs text-neutral-400">{e.pct}%</p>
                  </div>
                  <button
                    onClick={() => setEditingEnvelope(e.id)}
                    className="rounded-lg p-2 text-neutral-400 active:bg-neutral-100 dark:active:bg-neutral-800"
                  >
                    <Pencil size={16} />
                  </button>
                </Card>
              )
            )}
          </div>
        </div>

        {settings && <GeneralSettings settings={settings} onSaved={refetchSettings} />}

        <Button variant="secondary" className="w-full" onClick={signOut}>
          Cerrar sesión
        </Button>
      </div>
    </div>
  )
}

function EditMethodForm({ method, onDone }: { method: PaymentMethod; onDone: () => void }) {
  const [commission, setCommission] = useState(String(method.commission_pct))
  const [days, setDays] = useState(String(method.settlement_days))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await supabase
      .from('payment_methods')
      .update({ commission_pct: Number(commission) || 0, settlement_days: Number(days) || 0 })
      .eq('id', method.id)
    setSaving(false)
    onDone()
  }

  return (
    <Card className="space-y-2">
      <p className="font-medium text-neutral-800 dark:text-neutral-200">{method.name}</p>
      <div>
        <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Comisión (%)</label>
        <TextInput type="number" step="0.1" value={commission} onChange={(e) => setCommission(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Días de acreditación</label>
        <TextInput type="number" value={days} onChange={(e) => setDays(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onDone}>
          Cancelar
        </Button>
        <Button className="flex-1" onClick={save} disabled={saving}>
          Guardar
        </Button>
      </div>
    </Card>
  )
}

function EditEnvelopeForm({ envelope, onDone }: { envelope: Envelope; onDone: () => void }) {
  const [pct, setPct] = useState(String(envelope.pct))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('envelopes').update({ pct: Number(pct) || 0 }).eq('id', envelope.id)
    setSaving(false)
    onDone()
  }

  return (
    <Card className="space-y-2">
      <p className="font-medium text-neutral-800 dark:text-neutral-200">{envelope.name}</p>
      <TextInput type="number" step="0.1" value={pct} onChange={(e) => setPct(e.target.value)} />
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onDone}>
          Cancelar
        </Button>
        <Button className="flex-1" onClick={save} disabled={saving}>
          Guardar
        </Button>
      </div>
    </Card>
  )
}

function GeneralSettings({ settings, onSaved }: { settings: AppSettings; onSaved: () => void }) {
  const [breakeven, setBreakeven] = useState(settings.monthly_breakeven)
  const [insumosPct, setInsumosPct] = useState(String(settings.insumos_cost_pct))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    await supabase
      .from('app_settings')
      .update({ monthly_breakeven: breakeven, insumos_cost_pct: Number(insumosPct) || 0 })
      .eq('id', 1)
    setSaving(false)
    setSaved(true)
    onSaved()
  }

  return (
    <div>
      <SectionTitle>Punto de equilibrio</SectionTitle>
      <Card className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Punto de equilibrio mensual</label>
          <MoneyInput value={breakeven} onChange={setBreakeven} />
          <p className="mt-1 text-xs text-neutral-400">Diario: {formatMoney(breakeven / 30)} (referencial)</p>
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Costo de insumos estimado (% de venta)</label>
          <TextInput type="number" step="0.1" value={insumosPct} onChange={(e) => setInsumosPct(e.target.value)} />
        </div>
        {saved && <Banner tone="good">Guardado ✓</Banner>}
        <Button className="w-full" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </Card>
    </div>
  )
}
