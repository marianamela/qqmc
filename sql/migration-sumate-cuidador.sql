-- ============================================================
-- Cuidy · Migration: Sumate Cuidador (Camino A + B)
-- Fecha: 2026-07-10
-- ============================================================

-- 1. Tabla para solicitudes de recomendación (Camino A)
-- Cuando un cuidador pide que una familia lo recomiende
CREATE TABLE IF NOT EXISTS solicitudes_recomendacion (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cuidador_nombre TEXT NOT NULL,
  cuidador_telefono TEXT NOT NULL,
  familia_nombre TEXT NOT NULL,
  familia_telefono TEXT NOT NULL,
  tipo_servicio TEXT NOT NULL,
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviada', 'completada', 'expirada', 'rechazada')),
  ip_origen TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para solicitudes
CREATE INDEX IF NOT EXISTS idx_solicitudes_rec_cuidador_tel
  ON solicitudes_recomendacion (cuidador_telefono);
CREATE INDEX IF NOT EXISTS idx_solicitudes_rec_familia_tel
  ON solicitudes_recomendacion (familia_telefono);
CREATE INDEX IF NOT EXISTS idx_solicitudes_rec_estado
  ON solicitudes_recomendacion (estado)
  WHERE estado IN ('pendiente', 'enviada');

-- 2. Tabla para lista de espera de cuidadores (Camino B)
-- Cuidadores sin recomendación que dejan sus datos para evaluación manual
CREATE TABLE IF NOT EXISTS lista_espera_cuidadores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  telefono_verificado BOOLEAN DEFAULT FALSE,
  email TEXT NOT NULL,
  tipo_servicio TEXT NOT NULL,
  experiencia TEXT NOT NULL,
  provincia TEXT NOT NULL,
  localidad TEXT NOT NULL,
  referencias TEXT,
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_revision', 'aprobado', 'rechazado')),
  notas_admin TEXT,
  ip_origen TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para lista de espera
CREATE INDEX IF NOT EXISTS idx_lista_espera_telefono
  ON lista_espera_cuidadores (telefono);
CREATE INDEX IF NOT EXISTS idx_lista_espera_estado
  ON lista_espera_cuidadores (estado)
  WHERE estado IN ('pendiente', 'en_revision');

-- 3. RLS (Row Level Security)
ALTER TABLE solicitudes_recomendacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE lista_espera_cuidadores ENABLE ROW LEVEL SECURITY;

-- Policies: solo acceso vía service_role (backend)
CREATE POLICY "Service role full access solicitudes"
  ON solicitudes_recomendacion FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access lista_espera"
  ON lista_espera_cuidadores FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. Comentarios
COMMENT ON TABLE solicitudes_recomendacion IS 'Solicitudes de cuidadores pidiendo que una familia los recomiende (Camino A)';
COMMENT ON TABLE lista_espera_cuidadores IS 'Cuidadores sin recomendación que dejaron datos para evaluación manual (Camino B)';
COMMENT ON COLUMN solicitudes_recomendacion.estado IS 'pendiente=creada, enviada=WA enviado a familia, completada=familia completó rec, expirada=timeout, rechazada=familia rechazó';
COMMENT ON COLUMN lista_espera_cuidadores.estado IS 'pendiente=esperando revisión, en_revision=admin revisando, aprobado=habilitado, rechazado=no aceptado';
