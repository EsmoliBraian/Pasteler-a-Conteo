import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTable } from '../hooks/useTable'
import type { Ingredient, Product, RecipeItem, SubIngredient, SubIngredientItem, Unit } from '../types'
import { parseFudoExcel, type ParsedImport } from '../lib/excelImport'
import { applyFudoImport } from '../lib/applyImport'
import { productCost, marginPct, subIngredientCostPerUnit } from '../lib/recipeMath'
import { formatMoney } from '../lib/format'
import { Banner, Button, Card, MoneyInput, PageHeader, SectionTitle, TextInput } from '../components/UI'
import { ChevronDown, ChevronUp, Plus, Trash2, Upload } from 'lucide-react'

const TABS = ['Ingredientes', 'Subingredientes', 'Productos'] as const
type Tab = (typeof TABS)[number]

export default function Recetas() {
  const [tab, setTab] = useState<Tab>('Productos')
  const ingredients = useTable<Ingredient>('ingredients', (q) => q.order('name'))
  const subIngredients = useTable<SubIngredient>('sub_ingredients', (q) => q.order('name'))
  const subIngredientItems = useTable<SubIngredientItem>('sub_ingredient_items')
  const products = useTable<Product>('products', (q) => q.eq('active', true).order('name'))
  const recipeItems = useTable<RecipeItem>('recipe_items')

  function refetchAll() {
    ingredients.refetch()
    subIngredients.refetch()
    subIngredientItems.refetch()
    products.refetch()
    recipeItems.refetch()
  }

  return (
    <div>
      <PageHeader title="Costos y recetas" />
      <div className="p-4 pb-2">
        <ImportSection onImported={refetchAll} />
      </div>
      <div className="flex gap-1 border-b border-neutral-200 px-4 dark:border-neutral-800">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-2 py-2 text-sm font-medium ${
              tab === t
                ? 'border-amber-700 text-amber-700 dark:border-amber-500 dark:text-amber-500'
                : 'border-transparent text-neutral-400'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="space-y-3 p-4">
        {tab === 'Ingredientes' && <IngredientesTab ingredients={ingredients.data} onChanged={ingredients.refetch} />}
        {tab === 'Subingredientes' && (
          <SubingredientesTab
            subIngredients={subIngredients.data}
            subIngredientItems={subIngredientItems.data}
            ingredients={ingredients.data}
            onChanged={() => {
              subIngredients.refetch()
              subIngredientItems.refetch()
            }}
          />
        )}
        {tab === 'Productos' && (
          <ProductosTab
            products={products.data}
            recipeItems={recipeItems.data}
            ingredients={ingredients.data}
            subIngredients={subIngredients.data}
            subIngredientItems={subIngredientItems.data}
            onChanged={() => {
              products.refetch()
              recipeItems.refetch()
            }}
          />
        )}
      </div>
    </div>
  )
}

function ImportSection({ onImported }: { onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<ParsedImport | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [result, setResult] = useState<string[] | null>(null)
  const [open, setOpen] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setResult(null)
    const p = await parseFudoExcel(files)
    setParsed(p)
  }

  async function confirmImport() {
    if (!parsed) return
    setProgress('Empezando…')
    const { warnings } = await applyFudoImport(parsed, setProgress)
    setProgress(null)
    setResult([...parsed.warnings, ...warnings])
    setParsed(null)
    if (fileRef.current) fileRef.current.value = ''
    onImported()
  }

  return (
    <Card className="space-y-2">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between">
        <SectionTitle>Importar desde Excel (formato Fudo)</SectionTitle>
        {open ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
      </button>
      {open && (
        <div className="space-y-2">
          <p className="text-xs text-neutral-400">
            Fudo exporta dos archivos: uno con "Ingredientes" + "Subingredientes" y otro con "Productos" +
            "Recetas". Podés elegir los dos juntos (Ctrl/Cmd+click) o subirlos uno por vez, las veces que
            necesites.
          </p>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 py-4 text-sm font-medium text-neutral-500 active:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:active:bg-neutral-800">
            <Upload size={18} />
            Elegir archivo(s) .xls/.xlsx
            <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={handleFile} />
          </label>
        </div>
      )}

      {parsed && (
        <div className="space-y-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Vista previa antes de importar:</p>
          <ul className="text-sm text-neutral-600 dark:text-neutral-300">
            <li>{parsed.ingredients.length} ingredientes</li>
            <li>
              {parsed.subIngredients.length} subingredientes ({parsed.subIngredientLinks.length} líneas de composición)
            </li>
            <li>{parsed.products.length} productos</li>
            <li>{parsed.recipeLinks.length} líneas de receta</li>
          </ul>
          {parsed.warnings.length > 0 && (
            <Banner tone="warn">
              <ul className="list-disc pl-4">
                {parsed.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Banner>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setParsed(null)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={confirmImport} disabled={!!progress}>
              {progress ?? 'Confirmar importación'}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-1">
          <Banner tone={result.length ? 'warn' : 'good'}>
            {result.length ? (
              <ul className="list-disc pl-4">
                {result.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : (
              'Importación completa, sin advertencias.'
            )}
          </Banner>
        </div>
      )}
    </Card>
  )
}

const UNIT_OPTIONS: Unit[] = ['kg', 'l', 'un']

function IngredientesTab({ ingredients, onChanged }: { ingredients: Ingredient[]; onChanged: () => void }) {
  const [showNew, setShowNew] = useState(false)
  return (
    <div className="space-y-2">
      <Button variant="secondary" className="w-full" onClick={() => setShowNew((s) => !s)}>
        {showNew ? 'Cancelar' : '+ Nuevo ingrediente'}
      </Button>
      {showNew && (
        <IngredientForm
          onSaved={() => {
            setShowNew(false)
            onChanged()
          }}
        />
      )}
      {ingredients.map((ing) => (
        <IngredientRow key={ing.id} ingredient={ing} onChanged={onChanged} />
      ))}
    </div>
  )
}

function IngredientForm({
  initial,
  onSaved,
}: {
  initial?: Ingredient
  onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [unit, setUnit] = useState<Unit>(initial?.unit ?? 'kg')
  const [price, setPrice] = useState(initial?.price_per_unit ?? 0)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!name) return
    const payload = { name, unit, price_per_unit: price, updated_at: new Date().toISOString() }
    const { error } = initial
      ? await supabase.from('ingredients').update(payload).eq('id', initial.id)
      : await supabase.from('ingredients').insert(payload)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <Card className="space-y-2">
      <TextInput placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value as Unit)}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        >
          {UNIT_OPTIONS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <MoneyInput value={price} onChange={setPrice} />
      </div>
      {error && <Banner tone="bad">{error}</Banner>}
      <Button className="w-full" onClick={save}>
        Guardar
      </Button>
    </Card>
  )
}

function IngredientRow({ ingredient, onChanged }: { ingredient: Ingredient; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  if (editing)
    return (
      <IngredientForm
        initial={ingredient}
        onSaved={() => {
          setEditing(false)
          onChanged()
        }}
      />
    )
  return (
    <Card className="flex items-center justify-between py-3">
      <div>
        <p className="font-medium text-neutral-800 dark:text-neutral-200">{ingredient.name}</p>
        <p className="text-xs text-neutral-400">
          {formatMoney(ingredient.price_per_unit)} / {ingredient.unit}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => setEditing(true)} className="rounded-lg px-3 py-2 text-xs font-medium text-neutral-500 active:bg-neutral-100 dark:active:bg-neutral-800">
          Editar
        </button>
        <button
          onClick={async () => {
            if (confirm(`¿Eliminar "${ingredient.name}"?`)) {
              await supabase.from('ingredients').delete().eq('id', ingredient.id)
              onChanged()
            }
          }}
          className="rounded-lg p-2 text-neutral-400 active:bg-neutral-100 dark:active:bg-neutral-800"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </Card>
  )
}

function SubingredientesTab({
  subIngredients,
  subIngredientItems,
  ingredients,
  onChanged,
}: {
  subIngredients: SubIngredient[]
  subIngredientItems: SubIngredientItem[]
  ingredients: Ingredient[]
  onChanged: () => void
}) {
  const [showNew, setShowNew] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      <Button variant="secondary" className="w-full" onClick={() => setShowNew((s) => !s)}>
        {showNew ? 'Cancelar' : '+ Nuevo subingrediente'}
      </Button>
      {showNew && (
        <SubIngredientForm
          onSaved={() => {
            setShowNew(false)
            onChanged()
          }}
        />
      )}
      {subIngredients.map((sub) => {
        const cost = subIngredientCostPerUnit(sub, subIngredientItems, ingredients)
        const isOpen = openId === sub.id
        return (
          <Card key={sub.id} className="p-0">
            <button
              onClick={() => setOpenId(isOpen ? null : sub.id)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <p className="font-medium text-neutral-800 dark:text-neutral-200">{sub.name}</p>
                <p className="text-xs text-neutral-400">
                  Rinde {sub.yield_quantity} {sub.unit}
                </p>
              </div>
              <span className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
                {formatMoney(cost)}/{sub.unit}
              </span>
            </button>
            {isOpen && (
              <div className="space-y-2 border-t border-neutral-100 px-4 py-3 dark:border-neutral-800">
                <SubIngredientComposition
                  sub={sub}
                  items={subIngredientItems.filter((i) => i.sub_ingredient_id === sub.id)}
                  ingredients={ingredients}
                  onChanged={onChanged}
                />
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

function SubIngredientForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState<Unit>('kg')
  const [yieldQty, setYieldQty] = useState(1)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!name) return
    const { error } = await supabase.from('sub_ingredients').insert({ name, unit, yield_quantity: yieldQty })
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <Card className="space-y-2">
      <TextInput placeholder="Nombre (ej: Masa madre)" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value as Unit)}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        >
          {UNIT_OPTIONS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <div>
          <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Rinde (cantidad)</label>
          <TextInput type="number" value={yieldQty} onChange={(e) => setYieldQty(Number(e.target.value) || 1)} />
        </div>
      </div>
      {error && <Banner tone="bad">{error}</Banner>}
      <Button className="w-full" onClick={save}>
        Guardar
      </Button>
    </Card>
  )
}

function SubIngredientComposition({
  sub,
  items,
  ingredients,
  onChanged,
}: {
  sub: SubIngredient
  items: SubIngredientItem[]
  ingredients: Ingredient[]
  onChanged: () => void
}) {
  const [ingredientId, setIngredientId] = useState('')
  const [quantity, setQuantity] = useState(0)

  async function addItem() {
    if (!ingredientId || quantity <= 0) return
    await supabase.from('sub_ingredient_items').insert({ sub_ingredient_id: sub.id, ingredient_id: ingredientId, quantity })
    setQuantity(0)
    onChanged()
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const ing = ingredients.find((i) => i.id === item.ingredient_id)
        return (
          <div key={item.id} className="flex items-center justify-between text-sm">
            <span className="text-neutral-600 dark:text-neutral-300">
              {ing?.name} · {item.quantity} {ing?.unit}
            </span>
            <button
              onClick={async () => {
                await supabase.from('sub_ingredient_items').delete().eq('id', item.id)
                onChanged()
              }}
              className="text-neutral-400 active:text-red-600"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )
      })}
      <div className="flex gap-2">
        <select
          value={ingredientId}
          onChange={(e) => setIngredientId(e.target.value)}
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        >
          <option value="">Ingrediente…</option>
          {ingredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Cant."
          value={quantity || ''}
          onChange={(e) => setQuantity(Number(e.target.value) || 0)}
          className="w-20 rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        />
        <button onClick={addItem} className="rounded-lg bg-amber-700 px-3 text-white">
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}

function ProductosTab({
  products,
  recipeItems,
  ingredients,
  subIngredients,
  subIngredientItems,
  onChanged,
}: {
  products: Product[]
  recipeItems: RecipeItem[]
  ingredients: Ingredient[]
  subIngredients: SubIngredient[]
  subIngredientItems: SubIngredientItem[]
  onChanged: () => void
}) {
  const [showNew, setShowNew] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const withMargin = products.map((p) => {
    const cost = productCost(p, recipeItems, ingredients, subIngredients, subIngredientItems)
    return { product: p, cost, margin: marginPct(p.sale_price, cost) }
  })
  withMargin.sort((a, b) => (sortDir === 'desc' ? b.margin - a.margin : a.margin - b.margin))

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => setShowNew((s) => !s)}>
          {showNew ? 'Cancelar' : '+ Nuevo producto'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          className="whitespace-nowrap"
        >
          {sortDir === 'desc' ? 'Mejor margen ↓' : 'Peor margen ↓'}
        </Button>
      </div>
      {showNew && (
        <ProductForm
          onSaved={() => {
            setShowNew(false)
            onChanged()
          }}
        />
      )}
      {withMargin.map(({ product, cost, margin }) => {
        const isOpen = openId === product.id
        const tone = margin < 0 ? 'text-red-600 dark:text-red-400' : margin < 40 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
        return (
          <Card key={product.id} className="p-0">
            <button
              onClick={() => setOpenId(isOpen ? null : product.id)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-neutral-800 dark:text-neutral-200">{product.name}</p>
                <p className="text-xs text-neutral-400">
                  Costo {formatMoney(cost)} · Venta {formatMoney(product.sale_price)}
                </p>
              </div>
              <span className={`shrink-0 text-lg font-bold tabular-nums ${tone}`}>{margin.toFixed(0)}%</span>
            </button>
            {isOpen && (
              <div className="space-y-2 border-t border-neutral-100 px-4 py-3 dark:border-neutral-800">
                <ProductForm
                  initial={product}
                  onSaved={onChanged}
                  compact
                />
                <ProductRecipe
                  product={product}
                  items={recipeItems.filter((r) => r.product_id === product.id)}
                  ingredients={ingredients}
                  subIngredients={subIngredients}
                  onChanged={onChanged}
                />
                <button
                  onClick={async () => {
                    if (confirm(`¿Eliminar "${product.name}"?`)) {
                      await supabase.from('products').update({ active: false }).eq('id', product.id)
                      onChanged()
                    }
                  }}
                  className="text-xs text-neutral-400 underline active:text-red-600"
                >
                  eliminar producto
                </button>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

function ProductForm({ initial, onSaved, compact }: { initial?: Product; onSaved: () => void; compact?: boolean }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [price, setPrice] = useState(initial?.sale_price ?? 0)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!name) return
    const payload = { name, sale_price: price, updated_at: new Date().toISOString() }
    const { error } = initial
      ? await supabase.from('products').update(payload).eq('id', initial.id)
      : await supabase.from('products').insert(payload)
    if (error) setError(error.message)
    else onSaved()
  }

  if (compact)
    return (
      <div className="flex items-center gap-2">
        <MoneyInput value={price} onChange={setPrice} />
        <Button variant="secondary" onClick={save} className="whitespace-nowrap px-3 py-2 text-xs">
          Guardar precio
        </Button>
      </div>
    )

  return (
    <Card className="space-y-2">
      <TextInput placeholder="Nombre del producto" value={name} onChange={(e) => setName(e.target.value)} />
      <MoneyInput value={price} onChange={setPrice} placeholder="Precio de venta" />
      {error && <Banner tone="bad">{error}</Banner>}
      <Button className="w-full" onClick={save}>
        Guardar
      </Button>
    </Card>
  )
}

function ProductRecipe({
  product,
  items,
  ingredients,
  subIngredients,
  onChanged,
}: {
  product: Product
  items: RecipeItem[]
  ingredients: Ingredient[]
  subIngredients: SubIngredient[]
  onChanged: () => void
}) {
  const [selection, setSelection] = useState('')
  const [quantity, setQuantity] = useState(0)

  async function addItem() {
    if (!selection || quantity <= 0) return
    const [kind, id] = selection.split(':')
    await supabase.from('recipe_items').insert({
      product_id: product.id,
      ingredient_id: kind === 'ing' ? id : null,
      sub_ingredient_id: kind === 'sub' ? id : null,
      quantity,
    })
    setQuantity(0)
    setSelection('')
    onChanged()
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Receta</p>
      {items.map((item) => {
        const ing = item.ingredient_id ? ingredients.find((i) => i.id === item.ingredient_id) : null
        const sub = item.sub_ingredient_id ? subIngredients.find((s) => s.id === item.sub_ingredient_id) : null
        const label = ing?.name ?? sub?.name ?? '—'
        const unit = ing?.unit ?? sub?.unit ?? ''
        return (
          <div key={item.id} className="flex items-center justify-between text-sm">
            <span className="text-neutral-600 dark:text-neutral-300">
              {label} · {item.quantity} {unit}
            </span>
            <button
              onClick={async () => {
                await supabase.from('recipe_items').delete().eq('id', item.id)
                onChanged()
              }}
              className="text-neutral-400 active:text-red-600"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )
      })}
      <div className="flex gap-2">
        <select
          value={selection}
          onChange={(e) => setSelection(e.target.value)}
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        >
          <option value="">Ingrediente/subingrediente…</option>
          <optgroup label="Ingredientes">
            {ingredients.map((i) => (
              <option key={i.id} value={`ing:${i.id}`}>
                {i.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Subingredientes">
            {subIngredients.map((s) => (
              <option key={s.id} value={`sub:${s.id}`}>
                {s.name}
              </option>
            ))}
          </optgroup>
        </select>
        <input
          type="number"
          placeholder="Cant."
          value={quantity || ''}
          onChange={(e) => setQuantity(Number(e.target.value) || 0)}
          className="w-20 rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        />
        <button onClick={addItem} className="rounded-lg bg-amber-700 px-3 text-white">
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}
