-- =============================================================
-- Cuidy · Sistema de referidos y tracking de campañas
-- =============================================================

-- Tabla principal de referidos
CREATE TABLE IF NOT EXISTS referidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Quien refiere
  referrer_id UUID,
  referrer_tipo TEXT CHECK (referrer_tipo IN ('familia', 'cuidador')),
  referrer_nombre TEXT,
  -- Código único de referido
  codigo TEXT UNIQUE NOT NULL,
  -- Quien fue referido (se llena cuando se registra)
  referee_id UUID,
  referee_tipo TEXT CHECK (referee_tipo IN ('familia', 'cuidador')),
  -- Tracking de campaña
  utm_source TEXT,       -- whatsapp, instagram, facebook, google, directo
  utm_medium TEXT,       -- referral, cpc, social, organic
  utm_campaign TEXT,     -- familia_invita_cuidador, cuidador_invita_familia, etc.
  -- Estado del referido
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'link_abierto', 'registrado', 'activo')),
  -- Metadata extra
  canal_compartido TEXT, -- whatsapp, copiar_link, email
  landing_page TEXT,     -- invita-cuidador, invita-familia
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_referidos_codigo ON referidos(codigo);
CREATE INDEX IF NOT EXISTS idx_referidos_referrer ON referidos(referrer_id, referrer_tipo);
CREATE INDEX IF NOT EXISTS idx_referidos_estado ON referidos(estado);
CREATE INDEX IF NOT EXISTS idx_referidos_utm ON referidos(utm_source, utm_campaign);

-- Tabla de métricas agregadas por campaña (se actualiza con triggers o cron)
CREATE TABLE IF NOT EXISTS campana_metricas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  landing_page TEXT,
  -- Contadores
  links_generados INT DEFAULT 0,
  links_abiertos INT DEFAULT 0,
  registros_iniciados INT DEFAULT 0,
  registros_completados INT DEFAULT 0,
  -- Por tipo
  registros_familia INT DEFAULT 0,
  registros_cuidador INT DEFAULT 0,
  -- Unique constraint para upsert diario
  UNIQUE(fecha, utm_source, utm_medium, utm_campaign, landing_page)
);

CREATE INDEX IF NOT EXISTS idx_campana_fecha ON campana_metricas(fecha);

-- Agregar columnas de tracking a tablas existentes
ALTER TABLE cuidadores ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES referidos(id);
ALTER TABLE cuidadores ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE cuidadores ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE cuidadores ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

ALTER TABLE familias ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES referidos(id);
ALTER TABLE familias ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE familias ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE familias ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- Función para generar códigos de referido legibles
-- Formato: nombre-XXXX (ej: maria-a3f2)
CREATE OR REPLACE FUNCTION generar_codigo_referido(nombre TEXT)
RETURNS TEXT AS $$
DECLARE
  base TEXT;
  sufijo TEXT;
  codigo TEXT;
  intentos INT := 0;
BEGIN
  base := lower(regexp_replace(unaccent(nombre), '[^a-z0-9]', '', 'g'));
  IF length(base) > 10 THEN base := substring(base, 1, 10); END IF;
  LOOP
    sufijo := substring(md5(random()::text), 1, 4);
    codigo := base || '-' || sufijo;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM referidos WHERE referidos.codigo = codigo);
    intentos := intentos + 1;
    IF intentos > 10 THEN
      codigo := base || '-' || substring(md5(random()::text), 1, 8);
      EXIT;
    END IF;
  END LOOP;
  RETURN codigo;
END;
$$ LANGUAGE plpgsql;

-- RLS
ALTER TABLE referidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE campana_metricas ENABLE ROW LEVEL SECURITY;

-- Políticas: servicio puede todo, anon solo lectura de su propio referido
CREATE POLICY "service_all_referidos" ON referidos FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_all_metricas" ON campana_metricas FOR ALL
  USING (auth.role() = 'service_role');
