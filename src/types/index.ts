export type PaymentMethod = {
  id: string
  name: string
  commission_pct: number
  settlement_days: number
  sort_order: number
  active: boolean
}

export type Envelope = {
  id: string
  name: string
  pct: number
  description: string | null
  is_profit: boolean
  is_debt_envelope: boolean
  is_fixed_expense_envelope: boolean
  is_withdrawal_envelope: boolean
  sort_order: number
  active: boolean
}

export type SalesEntry = {
  id: string
  sale_date: string
  payment_method_id: string
  gross_amount: number
  commission_pct: number
  settlement_days: number
  net_amount: number
  settles_on: string
  created_at: string
  updated_at: string
}

export type DebtType = 'prestamo_bancario' | 'tarjeta_credito' | 'financiacion_proveedor' | 'prestamo_personal'
export type DebtStatus = 'activa' | 'pagada'

export type Debt = {
  id: string
  name: string
  debt_type: DebtType
  principal_amount: number
  installments_count: number
  installment_amount: number
  first_installment_date: string
  interest_rate: number | null
  status: DebtStatus
  notes: string | null
  created_at: string
}

export type InstallmentStatus = 'pendiente' | 'pagada'

export type DebtInstallment = {
  id: string
  debt_id: string
  installment_number: number
  due_date: string
  amount: number
  status: InstallmentStatus
  paid_at: string | null
  paid_amount: number | null
}

export type EnvelopeTransactionType =
  | 'income_distribution'
  | 'expense_payment'
  | 'debt_payment'
  | 'withdrawal'
  | 'adjustment'

export type EnvelopeTransaction = {
  id: string
  envelope_id: string
  amount: number
  type: EnvelopeTransactionType
  description: string | null
  related_date: string | null
  related_type: string | null
  related_id: string | null
  created_at: string
}

export type FixedExpense = {
  id: string
  name: string
  amount: number
  sort_order: number
  active: boolean
}

export type FixedExpensePayment = {
  id: string
  fixed_expense_id: string
  period: string
  amount: number
  paid_at: string
}

export type WithdrawalCategory = {
  id: string
  name: string
  monthly_budget: number
  sort_order: number
  active: boolean
}

export type Withdrawal = {
  id: string
  withdrawal_category_id: string | null
  amount: number
  description: string | null
  withdrawal_date: string
  created_at: string
}

export type Unit = 'kg' | 'l' | 'un'

export type Ingredient = {
  id: string
  name: string
  unit: Unit
  price_per_unit: number
}

export type SubIngredient = {
  id: string
  name: string
  unit: Unit
  yield_quantity: number
}

export type SubIngredientItem = {
  id: string
  sub_ingredient_id: string
  ingredient_id: string
  quantity: number
}

export type Product = {
  id: string
  name: string
  sale_price: number
  active: boolean
}

export type RecipeItem = {
  id: string
  product_id: string
  ingredient_id: string | null
  sub_ingredient_id: string | null
  quantity: number
}

export type AppSettings = {
  id: number
  monthly_breakeven: number
  insumos_cost_pct: number
}
