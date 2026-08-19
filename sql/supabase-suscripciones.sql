-- =============================================================
-- QQMC · Modelo de Suscripciones y Pagos
-- Ejecutar en Supabase → SQL Editor → Run
-- Referencia: USD 1 = ARS 1.415 (BNA mayo 2026)
-- =============================================================

-- 1. Planes disponibles
CREATE TABLE IF NOT EXISTS planes (
  id TEXT PRIMARY KEY,                    -- 'contacto_unico', 'mensual', 'trimestral', 'semestral', 'anual'
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio_ars NUMERIC(10,2) NOT NULL,
  precio_usd NUMERIC(6,2) NOT NULL,
  duracion_dias INT NOT NULL DEFAULT 30,  -- 0 = pago único (contacto)
  contactos_incluidos INT,                -- NULL = ilimitados
  incluye_diario BOOLEAN DEFAULT false,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insertar planes
INSERT INTO planes (id, nombre, descripcion, precio_ars, precio_usd, duracion_dias, contactos_incluidos, incluye_diario) VALUES
  ('contacto_unico', 'Contacto único', 'Acceso a los datos de contacto de 1 cuidador', 4245.00, 3.00, 0, 1, false),
  ('mensual', 'Plan Mensual', '5 contactos + Diario de Cuidado', 11320.00, 8.00, 30, 5, true),
  ('trimestral', 'Plan 3 Meses', '15 contactos + Diario de Cuidado', 28300.00, 20.00, 90, 15, true),
  ('semestral', 'Plan 6 Meses', '30 contactos + Diario de Cuidado', 49525.00, 35.00, 180, 30, true),
  ('anual', 'Plan Anual', 'Contactos ilimitados + Diario de Cuidado', 77825.00, 55.00, 365, NULL, true)
ON CONFLICT (id) DO UPDATE SET
  precio_ars = EXCLUDED.precio_ars,
  precio_usd = EXCLUDED.precio_usd,
  contactos_incluidos = EXCLUDED.contactos_incluidos;

-- 2. Suscripciones activas de familias
CREATE TABLE IF NOT EXISTS suscripciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES familias(id),
  plan_id TEXT NOT NULL REFERENCES planes(id),
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'activa', 'vencida', 'cancelada')),
  contactos_usados INT DEFAULT 0,
  fecha_inicio TIMESTAMPTZ,
  fecha_fin TIMESTAMPTZ,
  mp_preference_id TEXT,                  -- ID de MercadoPago
  mp_payment_id TEXT,                     -- ID del pago confirmado
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suscripciones_familia ON suscripciones(familia_id, estado);
CREATE INDEX IF NOT EXISTS idx_suscripciones_mp ON suscripciones(mp_preference_id);

-- 3. Registro de contactos desbloqueados
CREATE TABLE IF NOT EXISTS contactos_desbloqueados (
  id SERIAL PRIMARY KEY,
  familia_id UUID NOT NULL REFERENCES familias(id),
  cuidador_id UUID NOT NULL REFERENCES cuidadores(id),
  suscripcion_id UUID REFERENCES suscripciones(id),  -- NULL si fue contacto_unico sin suscripción
  desbloqueado_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(familia_id, cuidador_id)         -- una familia solo desbloquea una vez a cada cuidador
);

CREATE INDEX IF NOT EXISTS idx_contactos_desbloqueados_familia ON contactos_desbloqueados(familia_id);

-- 4. Historial de pagos (log de todas las transacciones)
CREATE TABLE IF NOT EXISTS pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES familias(id),
  suscripcion_id UUID REFERENCES suscripciones(id),
  monto_ars NUMERIC(10,2) NOT NULL,
  monto_usd NUMERIC(6,2),
  metodo TEXT DEFAULT 'mercadopago',      -- 'mercadopago', 'transferencia', etc.
  mp_payment_id TEXT,
  mp_status TEXT,                         -- 'approved', 'pending', 'rejected'
  mp_status_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_familia ON pagos(familia_id);
CREATE INDEX IF NOT EXISTS idx_pagos_mp ON pagos(mp_payment_id);

-- ---- RLS ----
ALTER TABLE planes ENABLE ROW LEVEL SECURITY;
ALTER TABLE suscripciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE contactos_desbloqueados ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;

-- Planes: lectura pública
CREATE POLICY "Lectura pública planes" ON planes FOR SELECT USING (true);

-- Suscripciones: la familia ve las suyas
CREATE POLICY "Lectura suscripciones propias" ON suscripciones FOR SELECT USING (true);
CREATE POLICY "Inserción suscripciones" ON suscripciones FOR INSERT WITH CHECK (true);
CREATE POLICY "Update suscripciones" ON suscripciones FOR UPDATE USING (true);

-- Contactos desbloqueados
CREATE POLICY "Lectura contactos_desbloqueados" ON contactos_desbloqueados FOR SELECT USING (true);
CREATE POLICY "Inserción contactos_desbloqueados" ON contactos_desbloqueados FOR INSERT WITH CHECK (true);

-- Pagos
CREATE POLICY "Lectura pagos" ON pagos FOR SELECT USING (true);
CREATE POLICY "Inserción pagos" ON pagos FOR INSERT WITH CHECK (true);

-- ---- Función helper: verificar acceso a contacto ----
CREATE OR REPLACE FUNCTION familia_puede_ver_contacto(p_familia_id UUID, p_cuidador_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  ya_desbloqueado BOOLEAN;
  sub RECORD;
BEGIN
  -- 1. ¿Ya desbloqueó este contacto antes?
  SELECT EXISTS(
    SELECT 1 FROM contactos_desbloqueados
    WHERE familia_id = p_familia_id AND cuidador_id = p_cuidador_id
  ) INTO ya_desbloqueado;

  IF ya_desbloqueado THEN RETURN true; END IF;

  -- 2. ¿Tiene suscripción activa con contactos disponibles?
  SELECT * INTO sub FROM suscripciones
  WHERE familia_id = p_familia_id
    AND estado = 'activa'
    AND (fecha_fin IS NULL OR fecha_fin > now())
  ORDER BY created_at DESC LIMIT 1;

  IF sub IS NOT NULL THEN
    -- Plan anual = contactos ilimitados (contactos_incluidos IS NULL en planes)
    IF (SELECT contactos_incluidos FROM planes WHERE id = sub.plan_id) IS NULL THEN
      RETURN true;
    END IF;
    -- Otros planes: verificar que no excedió el límite
    IF sub.contactos_usados < (SELECT contactos_incluidos FROM planes WHERE id = sub.plan_id) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
