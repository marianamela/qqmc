-- =============================================================
-- QQMC · Diario de Cuidado — Modelo de datos
-- Ejecutar en Supabase → SQL Editor → New Query → Run
-- =============================================================

-- 1. Contratos: relación activa entre familia y cuidador
CREATE TABLE IF NOT EXISTS contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES familias(id),
  cuidador_id UUID NOT NULL REFERENCES cuidadores(id),
  tipo_cuidado especialidad_cuidador NOT NULL,
  persona_cuidada TEXT,                     -- "Tomás (3 años)", "Mamá (78 años)"
  estado TEXT NOT NULL DEFAULT 'activo'     -- activo, pausado, finalizado
    CHECK (estado IN ('activo', 'pausado', 'finalizado')),
  fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin DATE,
  notas TEXT,                               -- instrucciones generales de la familia
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Categorías del diario: qué trackear según el contrato
-- La familia configura esto al inicio. Son los botones que ve el cuidador.
CREATE TABLE IF NOT EXISTS diario_categorias (
  id SERIAL PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,               -- "Comida", "Siesta", "Medicación"
  icono TEXT DEFAULT '📝',             -- emoji del botón
  tipo TEXT NOT NULL DEFAULT 'quick'  -- quick (1 tap), detail (pide más info), photo (pide foto)
    CHECK (tipo IN ('quick', 'detail', 'photo')),
  opciones_rapidas JSONB,             -- ["Todo bien", "Comió poco", "No quiso comer"]
  activa BOOLEAN DEFAULT true,
  orden INT DEFAULT 0
);

-- 3. Entradas del diario: cada registro del cuidador
CREATE TABLE IF NOT EXISTS diario_entradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  cuidador_id UUID NOT NULL REFERENCES cuidadores(id),
  categoria_id INT REFERENCES diario_categorias(id),
  tipo TEXT NOT NULL DEFAULT 'actividad'
    CHECK (tipo IN ('checkin', 'checkout', 'actividad', 'foto', 'nota', 'alerta', 'medicacion')),
  contenido TEXT,                     -- texto libre o selección rápida
  foto_url TEXT,                      -- URL de la foto si aplica
  metadata JSONB DEFAULT '{}',        -- datos extra: medicamento, dosis, temperatura, etc.
  lat DOUBLE PRECISION,               -- ubicación del check-in/out
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Reacciones de la familia a las entradas
CREATE TABLE IF NOT EXISTS diario_reacciones (
  id SERIAL PRIMARY KEY,
  entrada_id UUID NOT NULL REFERENCES diario_entradas(id) ON DELETE CASCADE,
  familia_id UUID NOT NULL REFERENCES familias(id),
  tipo TEXT NOT NULL DEFAULT 'corazon'   -- corazon, gracias, visto
    CHECK (tipo IN ('corazon', 'gracias', 'visto')),
  comentario TEXT,                       -- comentario opcional
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entrada_id, familia_id)         -- una reacción por familia por entrada
);

-- 5. Recordatorios programados (medicación a horario fijo, etc.)
CREATE TABLE IF NOT EXISTS diario_recordatorios (
  id SERIAL PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,                  -- "Medicación de la mañana"
  descripcion TEXT,                      -- "Losartán 50mg + Aspirineta"
  hora TIME NOT NULL,                    -- 08:00
  dias TEXT[] DEFAULT ARRAY['lun','mar','mie','jue','vie','sab','dom'],
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---- Índices para performance ----
CREATE INDEX IF NOT EXISTS idx_diario_entradas_contrato ON diario_entradas(contrato_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diario_entradas_cuidador ON diario_entradas(cuidador_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diario_categorias_contrato ON diario_categorias(contrato_id);
CREATE INDEX IF NOT EXISTS idx_contratos_familia ON contratos(familia_id);
CREATE INDEX IF NOT EXISTS idx_contratos_cuidador ON contratos(cuidador_id);

-- ---- RLS (Row Level Security) ----
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE diario_entradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE diario_reacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE diario_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE diario_recordatorios ENABLE ROW LEVEL SECURITY;

-- Política pública de lectura para entradas (la app filtra por contrato)
-- En producción se restringe por auth, pero por ahora permitimos lectura abierta
CREATE POLICY "Lectura pública diario_entradas" ON diario_entradas
  FOR SELECT USING (true);
CREATE POLICY "Inserción pública diario_entradas" ON diario_entradas
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Lectura pública contratos" ON contratos
  FOR SELECT USING (true);
CREATE POLICY "Inserción pública contratos" ON contratos
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Lectura pública diario_categorias" ON diario_categorias
  FOR SELECT USING (true);
CREATE POLICY "Inserción pública diario_categorias" ON diario_categorias
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Lectura pública diario_reacciones" ON diario_reacciones
  FOR SELECT USING (true);
CREATE POLICY "Inserción pública diario_reacciones" ON diario_reacciones
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Lectura pública diario_recordatorios" ON diario_recordatorios
  FOR SELECT USING (true);

-- =============================================================
-- Seed: Categorías por defecto según tipo de cuidado
-- Se copian al crear un contrato nuevo
-- =============================================================

-- Guardar templates en una tabla auxiliar
CREATE TABLE IF NOT EXISTS diario_categorias_template (
  id SERIAL PRIMARY KEY,
  tipo_cuidado especialidad_cuidador NOT NULL,
  nombre TEXT NOT NULL,
  icono TEXT DEFAULT '📝',
  tipo TEXT NOT NULL DEFAULT 'quick',
  opciones_rapidas JSONB,
  orden INT DEFAULT 0
);

INSERT INTO diario_categorias_template (tipo_cuidado, nombre, icono, tipo, opciones_rapidas, orden) VALUES
-- Niñera
('ninera', 'Comida', '🍽️', 'quick', '["Comió todo", "Comió poco", "No quiso comer"]', 1),
('ninera', 'Siesta', '😴', 'quick', '["Durmió bien", "Durmió poco", "No durmió"]', 2),
('ninera', 'Actividad', '🎨', 'detail', NULL, 3),
('ninera', 'Juegos', '🎲', 'quick', '["Jugó adentro", "Jugó afuera", "Juego tranquilo"]', 4),
('ninera', 'Estado de ánimo', '😊', 'quick', '["Contento/a", "Tranquilo/a", "Irritable", "Lloró un poco"]', 5),
('ninera', 'Pañal / Baño', '🧷', 'quick', '["Cambio de pañal", "Fue al baño solo/a", "Accidente"]', 6),
('ninera', 'Momento del día', '📸', 'photo', NULL, 7),

-- Adulto mayor
('adulto_mayor', 'Medicación', '💊', 'detail', '["Tomó todo", "Se olvidó una toma", "Se negó"]', 1),
('adulto_mayor', 'Comida', '🍽️', 'quick', '["Comió bien", "Comió poco", "No quiso comer", "Comió con ayuda"]', 2),
('adulto_mayor', 'Movilidad', '🚶', 'quick', '["Caminó bien", "Caminamos juntos", "Usó bastón/andador", "No quiso moverse"]', 3),
('adulto_mayor', 'Estado de ánimo', '🤍', 'quick', '["Tranquilo/a", "Conversador/a", "Confundido/a", "Irritable", "Triste"]', 4),
('adulto_mayor', 'Higiene', '🚿', 'quick', '["Se bañó solo/a", "Ayudé con el baño", "Cambio de ropa"]', 5),
('adulto_mayor', 'Signos vitales', '🩺', 'detail', NULL, 6),
('adulto_mayor', 'Momento del día', '📸', 'photo', NULL, 7),

-- Doméstica
('domestica', 'Limpieza', '🧹', 'quick', '["Limpieza general", "Limpieza profunda", "Solo habitaciones", "Solo cocina y baño"]', 1),
('domestica', 'Cocina', '🍳', 'quick', '["Preparé almuerzo", "Preparé cena", "Dejé comida lista"]', 2),
('domestica', 'Planchado', '👔', 'quick', '["Planchado completo", "Solo camisas", "Ropa doblada"]', 3),
('domestica', 'Compras', '🛒', 'detail', NULL, 4),
('domestica', 'Falta producto', '⚠️', 'detail', NULL, 5),
('domestica', 'Observación', '📝', 'detail', NULL, 6);
