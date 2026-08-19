-- Agregar campo estado a la tabla familias
-- Ejecutar en Supabase SQL Editor

ALTER TABLE familias ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'pendiente';
ALTER TABLE familias ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;

-- Actualizar familias existentes como aprobadas (ya estaban operando)
UPDATE familias SET estado = 'aprobada' WHERE estado IS NULL OR estado = 'pendiente';

-- Índice para filtrar por estado en admin
CREATE INDEX IF NOT EXISTS idx_familias_estado ON familias(estado);
