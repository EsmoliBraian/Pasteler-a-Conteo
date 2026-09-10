-- ============================================================================
-- Caja Pastelería — esquema de base de datos
-- Pegar completo en Supabase Dashboard > SQL Editor > New query > Run
-- Es seguro volver a ejecutarlo (usa "if not exists" / "on conflict") salvo que
-- ya hayas modificado los datos precargados a mano.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Medios de pago
-- ----------------------------------------------------------------------------
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  commission_pct numeric not null default 0,
  settlement_days int not null default 0,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. Sobres (envelopes)
-- ----------------------------------------------------------------------------
create table if not exists envelopes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pct numeric not null,
  description text,
  is_profit boolean not null default false, -- cuenta como "ganancia" en el panel principal
  is_debt_envelope boolean not null default false, -- a este sobre se descuentan los pagos de cuotas
  is_fixed_expense_envelope boolean not null default false, -- a este sobre se descuentan los gastos fijos
  is_withdrawal_envelope boolean not null default false, -- a este sobre se descuentan los retiros personales
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. Ventas diarias por medio de pago
-- ----------------------------------------------------------------------------
create table if not exists sales_entries (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null,
  payment_method_id uuid not null references payment_methods(id),
  gross_amount numeric not null default 0,
  commission_pct numeric not null default 0, -- snapshot al momento de la carga
  settlement_days int not null default 0, -- snapshot al momento de la carga
  net_amount numeric generated always as (gross_amount - (gross_amount * commission_pct / 100)) stored,
  settles_on date generated always as (sale_date + settlement_days) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sale_date, payment_method_id)
);
create index if not exists idx_sales_entries_date on sales_entries (sale_date);

-- ----------------------------------------------------------------------------
-- 4. Deudas y cuotas
-- ----------------------------------------------------------------------------
create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  debt_type text not null check (debt_type in ('prestamo_bancario','tarjeta_credito','financiacion_proveedor','prestamo_personal')),
  principal_amount numeric not null,
  installments_count int not null,
  installment_amount numeric not null,
  first_installment_date date not null,
  interest_rate numeric,
  status text not null default 'activa' check (status in ('activa','pagada')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists debt_installments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references debts(id) on delete cascade,
  installment_number int not null,
  due_date date not null,
  amount numeric not null,
  status text not null default 'pendiente' check (status in ('pendiente','pagada')),
  paid_at timestamptz,
  paid_amount numeric,
  created_at timestamptz not null default now(),
  unique (debt_id, installment_number)
);
create index if not exists idx_debt_installments_due on debt_installments (due_date) where status = 'pendiente';

-- ----------------------------------------------------------------------------
-- 5. Movimientos de sobres (todo ingreso/egreso pasa por acá)
-- ----------------------------------------------------------------------------
create table if not exists envelope_transactions (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references envelopes(id) on delete cascade,
  amount numeric not null, -- positivo = ingreso, negativo = egreso
  type text not null check (type in ('income_distribution','expense_payment','debt_payment','withdrawal','adjustment')),
  description text,
  related_date date,
  related_type text, -- 'sale' | 'fixed_expense' | 'debt_installment' | 'withdrawal' | null
  related_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_envelope_tx_envelope on envelope_transactions (envelope_id);
create index if not exists idx_envelope_tx_related on envelope_transactions (related_type, related_id);

-- ----------------------------------------------------------------------------
-- 6. Gastos fijos mensuales
-- ----------------------------------------------------------------------------
create table if not exists fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists fixed_expense_payments (
  id uuid primary key default gen_random_uuid(),
  fixed_expense_id uuid not null references fixed_expenses(id) on delete cascade,
  period text not null, -- 'YYYY-MM'
  amount numeric not null,
  paid_at timestamptz not null default now(),
  unique (fixed_expense_id, period)
);

-- ----------------------------------------------------------------------------
-- 7. Retiro personal
-- ----------------------------------------------------------------------------
create table if not exists withdrawal_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  monthly_budget numeric not null default 0,
  sort_order int not null default 0,
  active boolean not null default true
);

create table if not exists withdrawals (
  id uuid primary key default gen_random_uuid(),
  withdrawal_category_id uuid references withdrawal_categories(id),
  payment_method_id uuid references payment_methods(id),
  amount numeric not null,
  description text,
  withdrawal_date date not null default current_date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 8. Gastos sueltos (del local o personales) y conteo de caja
-- ----------------------------------------------------------------------------
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  amount numeric not null,
  description text,
  origin text not null check (origin in ('local','personal')),
  payment_method_id uuid references payment_methods(id),
  expense_date date not null default current_date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists cash_counts (
  id uuid primary key default gen_random_uuid(),
  payment_method_id uuid not null references payment_methods(id),
  expected_amount numeric not null,
  counted_amount numeric not null,
  count_date date not null default current_date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 9. Costos y recetas
-- ----------------------------------------------------------------------------
create table if not exists ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null default 'kg' check (unit in ('kg','l','un')),
  price_per_unit numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sub_ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null default 'kg' check (unit in ('kg','l','un')),
  yield_quantity numeric not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sub_ingredient_items (
  id uuid primary key default gen_random_uuid(),
  sub_ingredient_id uuid not null references sub_ingredients(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  quantity numeric not null
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sale_price numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recipe_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  ingredient_id uuid references ingredients(id) on delete cascade,
  sub_ingredient_id uuid references sub_ingredients(id) on delete cascade,
  quantity numeric not null,
  constraint recipe_item_one_source check (
    (ingredient_id is not null and sub_ingredient_id is null) or
    (ingredient_id is null and sub_ingredient_id is not null)
  )
);

-- ----------------------------------------------------------------------------
-- 10. Configuración general (fila única)
-- ----------------------------------------------------------------------------
create table if not exists app_settings (
  id int primary key default 1,
  monthly_breakeven numeric not null default 5900000,
  insumos_cost_pct numeric not null default 33,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);

-- ============================================================================
-- Seguridad: solo usuarios autenticados (los 2 de la pastelería) pueden leer
-- y escribir. No hay acceso público ni anónimo a ninguna tabla.
-- ============================================================================
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'payment_methods','envelopes','sales_entries','debts','debt_installments',
    'envelope_transactions','fixed_expenses','fixed_expense_payments',
    'withdrawal_categories','withdrawals','expenses','cash_counts','ingredients',
    'sub_ingredients','sub_ingredient_items','products','recipe_items','app_settings'
  ])
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "authenticated_all" on %I;', t);
    execute format(
      'create policy "authenticated_all" on %I for all to authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;

-- ============================================================================
-- Datos precargados (solo se insertan si las tablas están vacías)
-- ============================================================================

insert into payment_methods (name, commission_pct, settlement_days, sort_order)
select * from (values
  ('Efectivo', 0, 0, 1),
  ('Alias MP Luz', 0, 0, 2),
  ('Alias MP Braian', 0, 0, 3),
  ('PosNET', 2.0, 2, 4),
  ('QR Cuenta DNI', 0, 0, 5)
) as v(name, commission_pct, settlement_days, sort_order)
where not exists (select 1 from payment_methods);

insert into envelopes (name, pct, description, is_profit, is_debt_envelope, is_fixed_expense_envelope, is_withdrawal_envelope, sort_order)
select * from (values
  ('Insumos y proveedores', 33, 'Ingredientes, envases, café', false, false, false, false, 1),
  ('Gastos fijos', 26, 'Alquiler, luz, sueldos, impuestos', false, false, true, false, 2),
  ('Retiro de nosotros', 26, 'Nuestro alquiler, comida, vida personal', true, false, false, true, 3),
  ('Reservas', 12, 'Aguinaldos, imprevistos, compras grandes', true, false, false, false, 4),
  ('Deudas y créditos', 3, 'Cuotas de préstamos y tarjetas', false, true, false, false, 5)
) as v(name, pct, description, is_profit, is_debt_envelope, is_fixed_expense_envelope, is_withdrawal_envelope, sort_order)
where not exists (select 1 from envelopes);

insert into fixed_expenses (name, amount, sort_order)
select * from (values
  ('Alquiler local', 941600, 1),
  ('Luz', 531074, 2),
  ('Sueldo Julieta (moza)', 800000, 3),
  ('Sueldo Alma (cocinera)', 500000, 4),
  ('Sueldo Sofi (bachera)', 240000, 5),
  ('Sueldo Bauti (cocinero junior)', 240000, 6),
  ('Expensas', 263876, 7),
  ('Monotributo Luz', 49527, 8),
  ('Monotributo Braian', 44527, 9),
  ('Contadora', 45000, 10),
  ('Tasa seguridad e higiene', 43270, 11)
) as v(name, amount, sort_order)
where not exists (select 1 from fixed_expenses);

insert into withdrawal_categories (name, monthly_budget, sort_order)
select * from (values
  ('Alquiler personal', 800000, 1),
  ('Comida', 0, 2),
  ('Ahorro personal', 0, 3),
  ('Otros', 0, 4)
) as v(name, monthly_budget, sort_order)
where not exists (select 1 from withdrawal_categories);

insert into app_settings (id, monthly_breakeven, insumos_cost_pct)
select 1, 5900000, 33
where not exists (select 1 from app_settings);

-- Crédito Banco Provincia: cuota $397.000, vence el 20 de cada mes, última
-- cuota 20/10/2026. Se precargan solo las cuotas que quedan pendientes desde
-- hoy en adelante (si ya pagaron cuotas anteriores de este crédito no afecta
-- ningún cálculo de la app, que solo mira cuotas pendientes/próximas).
insert into debts (name, debt_type, principal_amount, installments_count, installment_amount, first_installment_date, status, notes)
select 'Crédito Banco Provincia', 'prestamo_bancario', 794000, 2, 397000, '2026-09-20', 'activa',
       'Precargado: quedan 2 cuotas pendientes hasta la última el 20/10/2026.'
where not exists (select 1 from debts where name = 'Crédito Banco Provincia');

insert into debt_installments (debt_id, installment_number, due_date, amount, status)
select d.id, v.n, v.due, 397000, 'pendiente'
from debts d, (values (1, date '2026-09-20'), (2, date '2026-10-20')) as v(n, due)
where d.name = 'Crédito Banco Provincia'
  and not exists (select 1 from debt_installments where debt_id = d.id);
