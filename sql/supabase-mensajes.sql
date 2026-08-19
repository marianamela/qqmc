-- =============================================================
-- QQMC · Mensajes familia → cuidador
-- Ejecutar en Supabase → SQL Editor → Run
-- =============================================================

CREATE TABLE IF NOT EXISTS diario_mensajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  familia_id UUID NOT NULL REFERENCES familias(id),
  contenido TEXT NOT NULL,
  prioridad TEXT NOT NULL DEFAULT 'normal'
    CHECK (prioridad IN ('normal', 'importante')),
  leido BOOLEAN DEFAULT false,
  leido_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mensajes_contrato ON diario_mensajes(contrato_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mensajes_no_leidos ON diario_mensajes(contrato_id, leido) WHERE leido = false;

ALTER TABLE diario_mensajes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública diario_mensajes" ON diario_mensajes
  FOR SELECT USING (true);
CREATE POLICY "Inserción pública diario_mensajes" ON diario_mensajes
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Update pública diario_mensajes" ON diario_mensajes
  FOR UPDATE USING (true);
