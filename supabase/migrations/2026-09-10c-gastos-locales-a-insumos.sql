-- Los gastos "del local" ahora se descuentan del sobre "Insumos y proveedores"
-- (antes salían, junto con los personales, del sobre de Retiro).
alter table envelopes add column if not exists is_supplies_envelope boolean not null default false;

update envelopes set is_supplies_envelope = true where name = 'Insumos y proveedores';
