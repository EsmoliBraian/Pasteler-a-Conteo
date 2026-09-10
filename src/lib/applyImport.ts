import { supabase } from './supabase'
import type { ParsedImport } from './excelImport'

function normalizeName(s: string) {
  return s.trim().toLowerCase()
}

export async function applyFudoImport(parsed: ParsedImport, onProgress?: (msg: string) => void) {
  const warnings: string[] = []
  const now = new Date().toISOString()

  if (parsed.ingredients.length) {
    onProgress?.('Guardando ingredientes…')
    const { error } = await supabase
      .from('ingredients')
      .upsert(
        parsed.ingredients.map((i) => ({ name: i.name, unit: i.unit, price_per_unit: i.price, updated_at: now })),
        { onConflict: 'name' }
      )
    if (error) warnings.push(`Ingredientes: ${error.message}`)
  }

  if (parsed.subIngredients.length) {
    onProgress?.('Guardando subingredientes…')
    const { error } = await supabase
      .from('sub_ingredients')
      .upsert(
        parsed.subIngredients.map((s) => ({ name: s.name, unit: s.unit, yield_quantity: 1, updated_at: now })),
        { onConflict: 'name' }
      )
    if (error) warnings.push(`Subingredientes: ${error.message}`)
  }

  if (parsed.products.length) {
    onProgress?.('Guardando productos…')
    const { error } = await supabase
      .from('products')
      .upsert(
        parsed.products.map((p) => ({ name: p.name, sale_price: p.price, updated_at: now })),
        { onConflict: 'name' }
      )
    if (error) warnings.push(`Productos: ${error.message}`)
  }

  if (parsed.subIngredientLinks.length || parsed.recipeLinks.length) {
    onProgress?.('Vinculando recetas…')
    const [{ data: ingredients }, { data: subIngredients }, { data: products }] = await Promise.all([
      supabase.from('ingredients').select('id,name'),
      supabase.from('sub_ingredients').select('id,name'),
      supabase.from('products').select('id,name'),
    ])
    const ingByName = new Map((ingredients ?? []).map((i) => [normalizeName(i.name), i.id as string]))
    const subByName = new Map((subIngredients ?? []).map((s) => [normalizeName(s.name), s.id as string]))
    const productByName = new Map((products ?? []).map((p) => [normalizeName(p.name), p.id as string]))

    // Composición de los subingredientes (ej. "Cookie" = Harina + Huevo + ...)
    const subByParent = new Map<string, ParsedImport['subIngredientLinks']>()
    for (const link of parsed.subIngredientLinks) {
      const key = normalizeName(link.parent)
      if (!subByParent.has(key)) subByParent.set(key, [])
      subByParent.get(key)!.push(link)
    }
    for (const [parentKey, links] of subByParent) {
      const subId = subByName.get(parentKey)
      if (!subId) {
        warnings.push(`No encontré el subingrediente "${links[0].parent}" para vincular su composición.`)
        continue
      }
      const rows: { sub_ingredient_id: string; ingredient_id: string; quantity: number }[] = []
      for (const link of links) {
        const ingId = ingByName.get(normalizeName(link.component))
        if (ingId) rows.push({ sub_ingredient_id: subId, ingredient_id: ingId, quantity: link.quantity })
        else warnings.push(`No encontré el ingrediente "${link.component}" (composición de "${link.parent}").`)
      }
      await supabase.from('sub_ingredient_items').delete().eq('sub_ingredient_id', subId)
      if (rows.length) {
        const { error } = await supabase.from('sub_ingredient_items').insert(rows)
        if (error) warnings.push(`Composición de "${links[0].parent}": ${error.message}`)
      }
    }

    // Recetas de productos (y, si el archivo las mezcla ahí, de subingredientes)
    const byParent = new Map<string, ParsedImport['recipeLinks']>()
    for (const link of parsed.recipeLinks) {
      const key = normalizeName(link.parent)
      if (!byParent.has(key)) byParent.set(key, [])
      byParent.get(key)!.push(link)
    }

    for (const [parentKey, links] of byParent) {
      const productId = productByName.get(parentKey)
      const subId = subByName.get(parentKey)
      if (productId) {
        const rows: { product_id: string; ingredient_id: string | null; sub_ingredient_id: string | null; quantity: number }[] = []
        for (const link of links) {
          const compKey = normalizeName(link.component)
          const ingId = ingByName.get(compKey)
          const subCompId = subByName.get(compKey)
          if (ingId) rows.push({ product_id: productId, ingredient_id: ingId, sub_ingredient_id: null, quantity: link.quantity })
          else if (subCompId) rows.push({ product_id: productId, ingredient_id: null, sub_ingredient_id: subCompId, quantity: link.quantity })
          else warnings.push(`No encontré el insumo "${link.component}" (receta de "${link.parent}").`)
        }
        await supabase.from('recipe_items').delete().eq('product_id', productId)
        if (rows.length) {
          const { error } = await supabase.from('recipe_items').insert(rows)
          if (error) warnings.push(`Receta de "${linkParent(links)}": ${error.message}`)
        }
      } else if (subId) {
        const rows: { sub_ingredient_id: string; ingredient_id: string; quantity: number }[] = []
        for (const link of links) {
          const ingId = ingByName.get(normalizeName(link.component))
          if (ingId) rows.push({ sub_ingredient_id: subId, ingredient_id: ingId, quantity: link.quantity })
          else warnings.push(`No encontré el ingrediente "${link.component}" (subreceta de "${link.parent}").`)
        }
        await supabase.from('sub_ingredient_items').delete().eq('sub_ingredient_id', subId)
        if (rows.length) {
          const { error } = await supabase.from('sub_ingredient_items').insert(rows)
          if (error) warnings.push(`Subreceta de "${linkParent(links)}": ${error.message}`)
        }
      } else {
        warnings.push(`No encontré el producto ni subingrediente "${links[0].parent}" para vincular su receta.`)
      }
    }
  }

  return { warnings }
}

function linkParent(links: ParsedImport['recipeLinks']) {
  return links[0]?.parent ?? ''
}
