import type * as XLSXType from 'xlsx'
import type { Unit } from '../types'

const COMBINING_MARKS = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g')

function normalize(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .trim()
}

function findColumn(headers: string[], keywords: string[]): number {
  const normalized = headers.map(normalize)
  for (const kw of keywords) {
    const exact = normalized.findIndex((h) => h === kw)
    if (exact !== -1) return exact
  }
  for (const kw of keywords) {
    const partial = normalized.findIndex((h) => h.includes(kw))
    if (partial !== -1) return partial
  }
  return -1
}

function detectUnit(raw: unknown): Unit {
  const v = normalize(raw)
  if (v.startsWith('kg') || v.includes('kilo')) return 'kg'
  if (v === 'l' || v.startsWith('lt') || v.includes('litro')) return 'l'
  return 'un'
}

function toNumber(raw: unknown): number {
  if (typeof raw === 'number') return raw
  const cleaned = String(raw ?? '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '') // miles con punto
    .replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

// Busca una hoja por nombre, evitando falsos positivos como "Subproductos"
// cuando buscamos "Productos" (o "Subingredientes" cuando buscamos "Ingredientes").
function findSheet(workbook: XLSXType.WorkBook, keywords: string[], excludeContains: string[] = []): string | null {
  const names = workbook.SheetNames
  const excluded = (n: string) => excludeContains.some((x) => normalize(n).includes(x))
  for (const kw of keywords) {
    const exact = names.find((n) => !excluded(n) && normalize(n) === kw)
    if (exact) return exact
  }
  for (const kw of keywords) {
    const partial = names.find((n) => !excluded(n) && normalize(n).includes(kw))
    if (partial) return partial
  }
  return null
}

function sheetRows(
  xlsx: typeof XLSXType,
  workbook: XLSXType.WorkBook,
  sheetName: string
): { headers: string[]; rows: unknown[][] } {
  const sheet = workbook.Sheets[sheetName]
  const raw = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false })
  if (raw.length === 0) return { headers: [], rows: [] }
  const headers = (raw[0] as unknown[]).map((h) => String(h ?? ''))
  return { headers, rows: raw.slice(1) as unknown[][] }
}

export type ParsedIngredient = { name: string; unit: Unit; price: number }
export type ParsedProduct = { name: string; price: number }
export type ParsedRecipeLink = { parent: string; component: string; quantity: number }
export type ParsedSubIngredientLink = { parent: string; component: string; quantity: number }

export type ParsedImport = {
  ingredients: ParsedIngredient[]
  subIngredients: { name: string; unit: Unit }[]
  subIngredientLinks: ParsedSubIngredientLink[]
  products: ParsedProduct[]
  recipeLinks: ParsedRecipeLink[]
  warnings: string[]
}

/**
 * Fudo exporta esto en dos archivos separados:
 * - "ingredientes.xls": hojas "Ingredientes" y "Subingredientes"
 * - "productos.xls": hojas "Productos" y "Recetas" (además de otras que no usamos)
 *
 * La hoja "Subingredientes" no es una lista de subingredientes con su propio
 * costo: es la composición de un ingrediente "compuesto" (ej. "Cookie") hecho de
 * otros ingredientes de la hoja "Ingredientes" (ej. "Harina", "Huevo"). La
 * columna "Ingrediente" es el compuesto y "Subingrediente" es el componente.
 * Por eso: cualquier nombre que aparezca como "Ingrediente" (compuesto) en esa
 * hoja se importa como sub-receta (con rendimiento 1, ya que las cantidades ya
 * están expresadas para producir 1 unidad), y se excluye de la lista de
 * ingredientes simples para no duplicarlo.
 */
export async function parseFudoExcel(files: File[]): Promise<ParsedImport> {
  // Import dinámico: la librería de Excel pesa bastante y solo hace falta acá.
  const xlsx = await import('xlsx')
  const warnings: string[] = []

  const rawIngredients: ParsedIngredient[] = []
  const subIngredientLinks: ParsedSubIngredientLink[] = []
  const products: ParsedProduct[] = []
  const recipeLinks: ParsedRecipeLink[] = []

  for (const file of files) {
    const buffer = await file.arrayBuffer()
    const workbook = xlsx.read(buffer, { type: 'array' })

    const ingredientsSheet = findSheet(workbook, ['ingredientes', 'ingrediente'], ['sub'])
    if (ingredientsSheet) {
      const { headers, rows } = sheetRows(xlsx, workbook, ingredientsSheet)
      const nameCol = findColumn(headers, ['nombre', 'ingrediente', 'insumo'])
      const unitCol = findColumn(headers, ['unidad', 'medida', 'um'])
      const priceCol = findColumn(headers, ['costo', 'precio', 'valor'])
      if (nameCol === -1) warnings.push(`"${file.name}", hoja "${ingredientsSheet}": no encontré columna de nombre.`)
      else {
        for (const row of rows) {
          const name = String(row[nameCol] ?? '').trim()
          if (!name) continue
          rawIngredients.push({
            name,
            unit: unitCol !== -1 ? detectUnit(row[unitCol]) : 'kg',
            price: priceCol !== -1 ? toNumber(row[priceCol]) : 0,
          })
        }
      }
    }

    const subSheet = findSheet(workbook, ['subingredientes', 'subingrediente'])
    if (subSheet) {
      const { headers, rows } = sheetRows(xlsx, workbook, subSheet)
      const parentCol = findColumn(headers, ['ingrediente', 'subingrediente', 'preparacion', 'elaboracion'])
      const componentCol = findColumn(headers, ['subingrediente', 'ingrediente', 'insumo', 'componente'])
      const qtyCol = findColumn(headers, ['cantidad', 'cant'])
      if (parentCol === -1 || componentCol === -1 || parentCol === componentCol || qtyCol === -1) {
        warnings.push(`"${file.name}", hoja "${subSheet}": no pude reconocer sus columnas.`)
      } else {
        for (const row of rows) {
          const parent = String(row[parentCol] ?? '').trim()
          const component = String(row[componentCol] ?? '').trim()
          if (!parent || !component) continue
          subIngredientLinks.push({ parent, component, quantity: toNumber(row[qtyCol]) })
        }
      }
    }

    const productsSheet = findSheet(workbook, ['productos', 'producto'], ['sub'])
    if (productsSheet) {
      const { headers, rows } = sheetRows(xlsx, workbook, productsSheet)
      const nameCol = findColumn(headers, ['nombre', 'producto', 'articulo'])
      const priceCol = findColumn(headers, ['precio de venta', 'precio venta', 'pvp', 'precio'])
      const activeCol = findColumn(headers, ['activo'])
      if (nameCol === -1) warnings.push(`"${file.name}", hoja "${productsSheet}": no encontré columna de nombre.`)
      else {
        for (const row of rows) {
          const name = String(row[nameCol] ?? '').trim()
          if (!name) continue
          if (activeCol !== -1 && normalize(row[activeCol]) === 'no') continue
          products.push({ name, price: priceCol !== -1 ? toNumber(row[priceCol]) : 0 })
        }
      }
    }

    const recetasSheet = findSheet(workbook, ['recetas', 'receta'])
    if (recetasSheet) {
      const { headers, rows } = sheetRows(xlsx, workbook, recetasSheet)
      const productCol = findColumn(headers, ['producto', 'articulo'])
      const subParentCol = findColumn(headers, ['subingrediente', 'elaboracion', 'preparacion'])
      const componentCol = findColumn(headers, ['ingrediente', 'insumo', 'componente'])
      const qtyCol = findColumn(headers, ['cantidad', 'cant'])
      if (componentCol === -1 || qtyCol === -1 || (productCol === -1 && subParentCol === -1)) {
        warnings.push(`"${file.name}", hoja "${recetasSheet}": no pude reconocer sus columnas.`)
      } else {
        for (const row of rows) {
          const parent = String(row[productCol] ?? row[subParentCol] ?? '').trim()
          const component = String(row[componentCol] ?? '').trim()
          if (!parent || !component) continue
          recipeLinks.push({ parent, component, quantity: toNumber(row[qtyCol]) })
        }
      }
    }

    if (!ingredientsSheet && !subSheet && !productsSheet && !recetasSheet) {
      warnings.push(`"${file.name}": no reconocí ninguna hoja (Ingredientes/Subingredientes/Productos/Recetas) en este archivo.`)
    }
  }

  const compoundNames = new Set(subIngredientLinks.map((l) => normalize(l.parent)))
  const ingredients = rawIngredients.filter((i) => !compoundNames.has(normalize(i.name)))
  const subIngredients = [...compoundNames].map((key) => {
    const match = rawIngredients.find((i) => normalize(i.name) === key)
    const original = subIngredientLinks.find((l) => normalize(l.parent) === key)!.parent
    return { name: original, unit: match?.unit ?? ('un' as Unit) }
  })

  if (ingredients.length === 0 && subIngredients.length === 0 && products.length === 0 && recipeLinks.length === 0) {
    warnings.push('No se reconoció ningún dato para importar en los archivos elegidos.')
  }

  return { ingredients, subIngredients, subIngredientLinks, products, recipeLinks, warnings }
}
