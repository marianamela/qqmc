-- Reemplazar tarifa_hora por rango min/max
alter table cuidadores
  add column if not exists valor_hora_min int,
  add column if not exists valor_hora_max int;

-- Migrar datos existentes (si hay tarifa_hora cargada, usarla como ambos valores)
update cuidadores
  set valor_hora_min = tarifa_hora,
      valor_hora_max = tarifa_hora
  where tarifa_hora is not null
    and valor_hora_min is null;

-- Eliminar columna vieja
alter table cuidadores drop column if exists tarifa_hora;
