-- Agrega la categoría "Ahorro personal" a retiro personal (no la agrega si ya existe).
insert into withdrawal_categories (name, monthly_budget, sort_order)
select 'Ahorro personal', 0, 3
where not exists (select 1 from withdrawal_categories where name = 'Ahorro personal');
