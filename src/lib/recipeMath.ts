import type { Ingredient, Product, RecipeItem, SubIngredient, SubIngredientItem } from '../types'

export function subIngredientCostPerUnit(
  sub: SubIngredient,
  items: SubIngredientItem[],
  ingredients: Ingredient[]
): number {
  const own = items.filter((i) => i.sub_ingredient_id === sub.id)
  const total = own.reduce((sum, item) => {
    const ing = ingredients.find((i) => i.id === item.ingredient_id)
    return sum + item.quantity * (ing?.price_per_unit ?? 0)
  }, 0)
  return sub.yield_quantity > 0 ? total / sub.yield_quantity : 0
}

export function productCost(
  product: Product,
  recipeItems: RecipeItem[],
  ingredients: Ingredient[],
  subIngredients: SubIngredient[],
  subIngredientItems: SubIngredientItem[]
): number {
  const own = recipeItems.filter((r) => r.product_id === product.id)
  return own.reduce((sum, item) => {
    if (item.ingredient_id) {
      const ing = ingredients.find((i) => i.id === item.ingredient_id)
      return sum + item.quantity * (ing?.price_per_unit ?? 0)
    }
    if (item.sub_ingredient_id) {
      const sub = subIngredients.find((s) => s.id === item.sub_ingredient_id)
      if (!sub) return sum
      return sum + item.quantity * subIngredientCostPerUnit(sub, subIngredientItems, ingredients)
    }
    return sum
  }, 0)
}

export function marginPct(salePrice: number, cost: number): number {
  if (salePrice <= 0) return 0
  return ((salePrice - cost) / salePrice) * 100
}
