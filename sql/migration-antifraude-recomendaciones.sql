-- ============================================================
-- Cuidy · Migration: Anti-fraude en recomendaciones
-- Fecha: 2026-07-10
-- ============================================================

-- 1. Agregar columnas de contexto de relación (Capa 3)
ALTER TABLE invitaciones
  ADD COLUMN IF NOT EXISTS tipo_servicio TEXT,
  ADD COLUMN IF NOT EXISTS duracion_relacion TEXT,
  ADD COLUMN IF NOT EXISTS actualmente_trabaja BOOLEAN;

-- 2. Agregar columna de verificación OTP (Capa 1)
ALTER TABLE invitaciones
  ADD COLUMN IF NOT EXISTS telefono_verificado BOOLEAN DEFAULT FALSE;

-- 3. Agregar columnas de scoring anti-fraude (Capa 4)
ALTER TABLE invitaciones
  ADD COLUMN IF NOT EXISTS fraud_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fraud_flags JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ip_origen TEXT,
  ADD COLUMN IF NOT EXISTS requiere_revision BOOLEAN DEFAULT FALSE;

-- 4. Índice para buscar recomendaciones por teléfono de familia (Capa 2: límite de recomendaciones)
CREATE INDEX IF NOT EXISTS idx_invitaciones_familia_telefono
  ON invitaciones (familia_telefono);

-- 5. Índice para scoring: buscar por IP
CREATE INDEX IF NOT EXISTS idx_invitaciones_ip_origen
  ON invitaciones (ip_origen)
  WHERE ip_origen IS NOT NULL;

-- 6. Índice para admin: filtrar las que requieren revisión
CREATE INDEX IF NOT EXISTS idx_invitaciones_requiere_revision
  ON invitaciones (requiere_revision)
  WHERE requiere_revision = TRUE;

-- 7. Comentarios descriptivos
COMMENT ON COLUMN invitaciones.tipo_servicio IS 'Tipo de servicio: ninera, adulto_mayor, domestica, cocinera';
COMMENT ON COLUMN invitaciones.duracion_relacion IS 'Duración de la relación laboral: menos_6m, 6m_1a, 1a_3a, mas_3a';
COMMENT ON COLUMN invitaciones.actualmente_trabaja IS 'Si el cuidador actualmente trabaja con quien recomienda';
COMMENT ON COLUMN invitaciones.telefono_verificado IS 'Si el teléfono de quien recomienda fue verificado por OTP';
COMMENT ON COLUMN invitaciones.fraud_score IS 'Puntuación de riesgo de fraude (0=limpio, 100=muy sospechoso)';
COMMENT ON COLUMN invitaciones.fraud_flags IS 'Array JSON con flags de fraude detectados';
COMMENT ON COLUMN invitaciones.ip_origen IS 'IP desde donde se envió la recomendación';
COMMENT ON COLUMN invitaciones.requiere_revision IS 'Flag para revisión manual por el equipo admin';
