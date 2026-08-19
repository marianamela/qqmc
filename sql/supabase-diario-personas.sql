-- =============================================================
-- QQMC · Agregar campo "personas" a contratos
-- Permite identificar a quién se refiere cada entrada del diario
-- Ejecutar en Supabase → SQL Editor → Run
-- =============================================================

-- Agregar columna JSONB con los nombres de las personas cuidadas
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS personas JSONB DEFAULT '[]';

-- Actualizar el contrato de prueba con los nombres de los niños
UPDATE contratos
SET personas = '[{"nombre": "Tomás", "detalle": "3 años, alérgico al maní"}, {"nombre": "Sofía", "detalle": "6 años"}]'
WHERE persona_cuidada LIKE '%Tomás%';
