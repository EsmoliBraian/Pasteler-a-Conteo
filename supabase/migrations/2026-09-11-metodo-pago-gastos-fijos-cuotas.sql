-- Permite marcar con qué medio de pago se pagó un gasto fijo o una cuota de
-- deuda, para que el conteo de caja los tenga en cuenta.
alter table fixed_expense_payments add column if not exists payment_method_id uuid references payment_methods(id);
alter table debt_installments add column if not exists payment_method_id uuid references payment_methods(id);
