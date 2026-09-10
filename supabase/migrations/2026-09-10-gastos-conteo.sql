-- Migración incremental: gastos sueltos + conteo de caja.
-- Para un proyecto de Supabase que ya tenía el schema.sql anterior corrido.
-- Pegar en SQL Editor > New query > Run. Es seguro volver a ejecutarlo.

alter table withdrawals add column if not exists payment_method_id uuid references payment_methods(id);

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

do $$
declare
  t text;
begin
  for t in select unnest(array['expenses', 'cash_counts'])
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "authenticated_all" on %I;', t);
    execute format(
      'create policy "authenticated_all" on %I for all to authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;
