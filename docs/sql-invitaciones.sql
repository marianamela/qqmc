-- =============================================
-- SISTEMA DE INVITACIONES - Cuidy
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- 1. Nuevas columnas en cuidadores
ALTER TABLE cuidadores ADD COLUMN IF NOT EXISTS recomendado_por uuid REFERENCES familias(id);
ALTER TABLE cuidadores ADD COLUMN IF NOT EXISTS invitacion_codigo text;

-- 2. Tabla de invitaciones
CREATE TABLE IF NOT EXISTS invitaciones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  familia_id uuid NOT NULL REFERENCES familias(id),
  familia_nombre text NOT NULL,
  telefono_cuidador text NOT NULL,
  nombre_cuidador text,
  codigo text NOT NULL UNIQUE,
  estado text NOT NULL DEFAULT 'enviada' CHECK (estado IN ('enviada', 'abierta', 'completada', 'expirada')),
  mensaje text,
  cuidador_id uuid REFERENCES cuidadores(id),
  opened_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_invitaciones_familia ON invitaciones(familia_id);
CREATE INDEX IF NOT EXISTS idx_invitaciones_codigo ON invitaciones(codigo);
CREATE INDEX IF NOT EXISTS idx_invitaciones_telefono ON invitaciones(telefono_cuidador);
CREATE INDEX IF NOT EXISTS idx_cuidadores_recomendado ON cuidadores(recomendado_por) WHERE recomendado_por IS NOT NULL;

-- 3. RLS
ALTER TABLE invitaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso público invitaciones" ON invitaciones
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- MIGRACIÓN: Soporte recomendación rápida (sin cuenta)
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- Permitir familia_id nulo (recomendaciones desde landing sin cuenta)
ALTER TABLE invitaciones ALTER COLUMN familia_id DROP NOT NULL;

-- Nuevas columnas para recomendación rápida
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS familia_email text;
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS familia_telefono text;
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS origen text DEFAULT 'panel';
