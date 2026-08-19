-- =============================================================
-- QQMC · Suscripciones Push
-- Ejecutar en Supabase → SQL Editor → Run
-- =============================================================

CREATE TABLE IF NOT EXISTS push_suscripciones (
  id SERIAL PRIMARY KEY,
  usuario_tipo TEXT NOT NULL CHECK (usuario_tipo IN ('cuidador', 'familia')),
  usuario_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  keys JSONB NOT NULL,           -- { p256dh, auth }
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(endpoint)               -- evitar duplicados del mismo navegador
);

CREATE INDEX IF NOT EXISTS idx_push_usuario ON push_suscripciones(usuario_tipo, usuario_id);

ALTER TABLE push_suscripciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública push_suscripciones" ON push_suscripciones
  FOR SELECT USING (true);
CREATE POLICY "Inserción pública push_suscripciones" ON push_suscripciones
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Delete pública push_suscripciones" ON push_suscripciones
  FOR DELETE USING (true);
