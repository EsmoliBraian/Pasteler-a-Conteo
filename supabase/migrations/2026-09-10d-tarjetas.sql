-- Compras con tarjeta de crédito: tarjetas + compras con fecha de pago.
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists card_purchases (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id),
  amount numeric not null,
  description text,
  origin text not null check (origin in ('local','personal')),
  purchase_date date not null default current_date,
  due_date date not null,
  status text not null default 'pendiente' check (status in ('pendiente','pagada')),
  paid_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_card_purchases_due on card_purchases (due_date) where status = 'pendiente';

do $$
declare
  t text;
begin
  for t in select unnest(array['cards', 'card_purchases'])
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "authenticated_all" on %I;', t);
    execute format(
      'create policy "authenticated_all" on %I for all to authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;
