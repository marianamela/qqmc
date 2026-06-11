-- =============================================================
-- QQMC · Solicitudes de Contacto (capa de seguridad)
-- La familia envía un mensaje al cuidador por la plataforma.
-- Si el cuidador acepta, se intercambian datos de contacto.
-- Ejecutar en Supabase → SQL Editor → Run
-- =============================================================

CREATE TABLE IF NOT EXISTS solicitudes_contacto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES familias(id),
  cuidador_id UUID NOT NULL REFERENCES cuidadores(id),
  suscripcion_id UUID REFERENCES suscripciones(id),
  mensaje TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'aceptada', 'rechazada')),
  respuesta_cuidador TEXT,               -- mensaje opcional del cuidador al responder
  created_at TIMESTAMPTZ DEFAULT now(),
  respondido_at TIMESTAMPTZ,
  UNIQUE(familia_id, cuidador_id)        -- solo una solicitud activa por par
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_cuidador ON solicitudes_contacto(cuidador_id, estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_familia ON solicitudes_contacto(familia_id);

ALTER TABLE solicitudes_contacto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública solicitudes_contacto" ON solicitudes_contacto FOR SELECT USING (true);
CREATE POLICY "Inserción pública solicitudes_contacto" ON solicitudes_contacto FOR INSERT WITH CHECK (true);
CREATE POLICY "Update pública solicitudes_contacto" ON solicitudes_contacto FOR UPDATE USING (true);
