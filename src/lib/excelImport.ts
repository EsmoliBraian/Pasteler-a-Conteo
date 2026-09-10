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

function findSheet(workbook: XLSXType.WorkBook, keywords: string[]): string | null {
  const names = workbook.SheetNames
  for (const kw of keywords) {
    const found = names.find((n) => normalize(n).includes(kw))
    if (found) return found
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
export type ParsedSubIngredient = { name: string; unit: Unit; yieldQty: number }
export type ParsedProduct = { name: string; price: number }
export type ParsedRecipeLink = { parent: string; component: string; quantity: number }

export type ParsedImport = {
  ingredients: ParsedIngredient[]
  subIngredients: ParsedSubIngredient[]
  products: ParsedProduct[]
  recipeLinks: ParsedRecipeLink[]
  warnings: string[]
}

export async function parseFudoExcel(file: File): Promise<ParsedImport> {
  // Import dinámico: la librería de Excel pesa bastante y solo hace falta acá.
  const xlsx = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = xlsx.read(buffer, { type: 'array' })
  const warnings: string[] = []

  const ingredients: ParsedIngredient[] = []
  const ingredientsSheet = findSheet(workbook, ['ingrediente'])
  if (ingredientsSheet) {
    const { headers, rows } = sheetRows(xlsx, workbook, ingredientsSheet)
    const nameCol = findColumn(headers, ['nombre', 'ingrediente', 'insumo'])
    const unitCol = findColumn(headers, ['unidad', 'medida', 'um'])
    const priceCol = findColumn(headers, ['precio', 'costo', 'valor'])
    if (nameCol === -1) warnings.push(`Hoja "${ingredientsSheet}": no encontré columna de nombre.`)
    else {
      for (const row of rows) {
        const name = String(row[nameCol] ?? '').trim()
        if (!name) continue
        ingredients.push({
          name,
          unit: unitCol !== -1 ? detectUnit(row[unitCol]) : 'kg',
          price: priceCol !== -1 ? toNumber(row[priceCol]) : 0,
        })
      }
    }
  } else warnings.push('No encontré una hoja "Ingredientes" en el archivo.')

  const subIngredients: ParsedSubIngredient[] = []
  const subSheet = findSheet(workbook, ['subingrediente', 'sub ingrediente', 'subinsumo'])
  if (subSheet) {
    const { headers, rows } = sheetRows(xlsx, workbook, subSheet)
    const nameCol = findColumn(headers, ['nombre', 'subingrediente', 'preparacion', 'elaboracion'])
    const unitCol = findColumn(headers, ['unidad', 'medida', 'um'])
    const yieldCol = findColumn(headers, ['rendimiento', 'produccion', 'rinde', 'cantidad producida'])
    if (nameCol !== -1) {
      for (const row of rows) {
        const name = String(row[nameCol] ?? '').trim()
        if (!name) continue
        subIngredients.push({
          name,
          unit: unitCol !== -1 ? detectUnit(row[unitCol]) : 'kg',
          yieldQty: yieldCol !== -1 ? toNumber(row[yieldCol]) || 1 : 1,
        })
      }
    }
  }

  const products: ParsedProduct[] = []
  const productsSheet = findSheet(workbook, ['producto'])
  if (productsSheet) {
    const { headers, rows } = sheetRows(xlsx, workbook, productsSheet)
    const nameCol = findColumn(headers, ['nombre', 'producto', 'articulo'])
    const priceCol = findColumn(headers, ['precio de venta', 'precio venta', 'pvp', 'precio'])
    if (nameCol === -1) warnings.push(`Hoja "${productsSheet}": no encontré columna de nombre.`)
    else {
      for (const row of rows) {
        const name = String(row[nameCol] ?? '').trim()
        if (!name) continue
        products.push({ name, price: priceCol !== -1 ? toNumber(row[priceCol]) : 0 })
      }
    }
  } else warnings.push('No encontré una hoja "Productos" en el archivo.')

  const recipeLinks: ParsedRecipeLink[] = []
  const recetasSheet = findSheet(workbook, ['receta'])
  if (recetasSheet) {
    const { headers, rows } = sheetRows(xlsx, workbook, recetasSheet)
    const productCol = findColumn(headers, ['producto', 'articulo'])
    const subParentCol = findColumn(headers, ['subingrediente', 'elaboracion', 'preparacion'])
    const componentCol = findColumn(headers, ['ingrediente', 'insumo', 'componente'])
    const qtyCol = findColumn(headers, ['cantidad', 'cant'])
    if (componentCol === -1 || qtyCol === -1 || (productCol === -1 && subParentCol === -1)) {
      warnings.push(`Hoja "${recetasSheet}": no pude reconocer las columnas de producto/ingrediente/cantidad.`)
    } else {
      for (const row of rows) {
        const parent = String(row[productCol] ?? row[subParentCol] ?? '').trim()
        const component = String(row[componentCol] ?? '').trim()
        if (!parent || !component) continue
        recipeLinks.push({ parent, component, quantity: toNumber(row[qtyCol]) })
      }
    }
  } else warnings.push('No encontré una hoja "Recetas" en el archivo.')

  return { ingredients, subIngredients, products, recipeLinks, warnings }
}
