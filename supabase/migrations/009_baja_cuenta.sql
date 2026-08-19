-- Migración: soporte para baja de cuenta de usuario
-- Agrega columna baja_solicitada_at a familias y cuidadores
-- y columna estado_previo_baja para poder reactivar

-- Familias
ALTER TABLE familias ADD COLUMN IF NOT EXISTS baja_solicitada_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE familias ADD COLUMN IF NOT EXISTS estado_previo_baja TEXT DEFAULT NULL;

-- Cuidadores
ALTER TABLE cuidadores ADD COLUMN IF NOT EXISTS baja_solicitada_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE cuidadores ADD COLUMN IF NOT EXISTS estado_previo_baja TEXT DEFAULT NULL;

-- Índices para la purga periódica (buscar cuentas con baja vencida)
CREATE INDEX IF NOT EXISTS idx_familias_baja ON familias(baja_solicitada_at) WHERE baja_solicitada_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cuidadores_baja ON cuidadores(baja_solicitada_at) WHERE baja_solicitada_at IS NOT NULL;
