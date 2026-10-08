-- ============================================================
-- Cuidy · Migration: Red de Confianza
-- Fecha: 2026-10-07
--
-- Nuevas tablas para el modelo de red de confianza:
-- 1. conexiones_familia: grafo social familia ↔ familia
-- 2. recomendaciones: familia recomienda cuidador
-- 3. Modifica contactos_desbloqueados (ya existe) para agregar estado
-- 4. Funciones de consulta por red (profundidad 1-2)
-- ============================================================

-- ---------------------------------------------------------------
--  1. CONEXIONES FAMILIA ↔ FAMILIA (grafo social)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conexiones_familia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES public.familias(id) ON DELETE CASCADE,
  conectada_id UUID NOT NULL REFERENCES public.familias(id) ON DELETE CASCADE,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'aceptada', 'rechazada', 'bloqueada')),
  mensaje TEXT,                           -- mensaje opcional al invitar
  canal TEXT DEFAULT 'plataforma'         -- 'plataforma', 'whatsapp', 'email', 'link'
    CHECK (canal IN ('plataforma', 'whatsapp', 'email', 'link')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  aceptada_at TIMESTAMPTZ,
  UNIQUE(familia_id, conectada_id),       -- solo una conexión por par
  CHECK (familia_id != conectada_id)      -- no conectarse consigo misma
);

CREATE INDEX IF NOT EXISTS idx_conexiones_familia_id ON public.conexiones_familia(familia_id, estado);
CREATE INDEX IF NOT EXISTS idx_conexiones_conectada_id ON public.conexiones_familia(conectada_id, estado);

COMMENT ON TABLE public.conexiones_familia IS 'Grafo social: conexiones entre familias. Bidireccional una vez aceptada.';

-- ---------------------------------------------------------------
--  2. RECOMENDACIONES (familia → cuidador)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recomendaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES public.familias(id) ON DELETE CASCADE,
  cuidador_id UUID REFERENCES public.cuidadores(id) ON DELETE SET NULL,
  -- Si el cuidador no está registrado aún:
  cuidador_nombre TEXT,
  cuidador_telefono TEXT,
  cuidador_email TEXT,
  -- Datos de la recomendación
  tipo_servicio TEXT NOT NULL,            -- ninera, adulto_mayor, domestica, cocinera
  relacion TEXT,                          -- 'empleador_actual', 'empleador_anterior', 'conocido'
  duracion_relacion TEXT,                 -- 'menos_6m', '6m_1a', '1a_3a', 'mas_3a'
  valoracion INTEGER CHECK (valoracion BETWEEN 1 AND 5),
  texto TEXT,                             -- texto libre de la recomendación
  -- Estado
  estado TEXT NOT NULL DEFAULT 'activa'
    CHECK (estado IN ('activa', 'pendiente_registro', 'revocada')),
  -- Metadata anti-fraude
  ip_origen TEXT,
  fraud_score INTEGER DEFAULT 0,
  fraud_flags JSONB DEFAULT '[]'::jsonb,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recomendaciones_familia ON public.recomendaciones(familia_id);
CREATE INDEX IF NOT EXISTS idx_recomendaciones_cuidador ON public.recomendaciones(cuidador_id);
CREATE INDEX IF NOT EXISTS idx_recomendaciones_telefono ON public.recomendaciones(cuidador_telefono);
CREATE INDEX IF NOT EXISTS idx_recomendaciones_estado ON public.recomendaciones(estado) WHERE estado = 'activa';

COMMENT ON TABLE public.recomendaciones IS 'Recomendaciones de familias hacia cuidadores. Un cuidador solo es visible si tiene al menos una recomendación activa.';

-- ---------------------------------------------------------------
--  3. MODIFICAR contactos_desbloqueados (agregar campos)
-- ---------------------------------------------------------------
-- La tabla ya existe (supabase-suscripciones.sql). Agregamos columnas.

ALTER TABLE public.contactos_desbloqueados
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activo'
    CHECK (estado IN ('activo', 'pendiente_confirmacion', 'contratado', 'no_disponible')),
  ADD COLUMN IF NOT EXISTS confirmado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS diario_activo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cuidador_snapshot JSONB;  -- snapshot del perfil si el cuidador se da de baja

COMMENT ON COLUMN public.contactos_desbloqueados.estado IS 'activo=desbloqueado, pendiente_confirmacion=esperando confirmar contratación, contratado=diario activo, no_disponible=cuidador se dio de baja';
COMMENT ON COLUMN public.contactos_desbloqueados.cuidador_snapshot IS 'Copia de los datos del cuidador al momento de darse de baja, para preservar historial';

-- ---------------------------------------------------------------
--  4. INVITACIONES A LA RED (links compartibles)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invitaciones_red (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES public.familias(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL UNIQUE,            -- código corto para URL compartible
  canal TEXT DEFAULT 'link'
    CHECK (canal IN ('whatsapp', 'email', 'link')),
  usado_por UUID REFERENCES public.familias(id),
  usado_at TIMESTAMPTZ,
  expira_at TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitaciones_red_codigo ON public.invitaciones_red(codigo);
CREATE INDEX IF NOT EXISTS idx_invitaciones_red_familia ON public.invitaciones_red(familia_id);

-- ---------------------------------------------------------------
--  5. FUNCIONES DE CONSULTA POR RED
-- ---------------------------------------------------------------

-- 5a. Obtener IDs de familias conectadas (nivel 1 = directas)
CREATE OR REPLACE FUNCTION public.familias_conectadas(p_familia_id UUID)
RETURNS TABLE(familia_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT c.conectada_id AS familia_id
  FROM public.conexiones_familia c
  WHERE c.familia_id = p_familia_id AND c.estado = 'aceptada'
  UNION
  SELECT c.familia_id AS familia_id
  FROM public.conexiones_familia c
  WHERE c.conectada_id = p_familia_id AND c.estado = 'aceptada';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 5b. Obtener IDs de familias en la red extendida (nivel 1 + nivel 2)
CREATE OR REPLACE FUNCTION public.red_extendida(p_familia_id UUID)
RETURNS TABLE(familia_id UUID, nivel INTEGER) AS $$
BEGIN
  -- Nivel 1: conexiones directas
  RETURN QUERY
  SELECT fc.familia_id, 1 AS nivel
  FROM public.familias_conectadas(p_familia_id) fc;

  -- Nivel 2: conexiones de mis conexiones (excluyendo las directas y a mí)
  RETURN QUERY
  SELECT DISTINCT fc2.familia_id, 2 AS nivel
  FROM public.familias_conectadas(p_familia_id) fc1
  CROSS JOIN LATERAL public.familias_conectadas(fc1.familia_id) fc2
  WHERE fc2.familia_id != p_familia_id
    AND fc2.familia_id NOT IN (
      SELECT fc3.familia_id FROM public.familias_conectadas(p_familia_id) fc3
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 5c. Buscar cuidadores visibles para una familia (filtrados por red)
CREATE OR REPLACE FUNCTION public.cuidadores_en_red(
  p_familia_id UUID,
  p_especialidad TEXT DEFAULT NULL,
  p_zona TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  cuidador_id UUID,
  nombre TEXT,
  apellido TEXT,
  especialidades especialidad_cuidador[],
  foto_url TEXT,
  valoracion NUMERIC,
  experiencia_anios INTEGER,
  localidad TEXT,
  provincia TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  disponibilidad JSONB,
  nivel_confianza INTEGER,       -- 1 = recomendado por conexión directa, 2 = nivel 2
  total_recomendaciones BIGINT,
  familias_que_recomiendan TEXT  -- nombres de familias que recomiendan (para cadena de confianza)
) AS $$
BEGIN
  RETURN QUERY
  WITH mi_red AS (
    -- Mi familia + nivel 1 + nivel 2
    SELECT p_familia_id AS fam_id, 0 AS niv
    UNION ALL
    SELECT re.familia_id AS fam_id, re.nivel AS niv
    FROM public.red_extendida(p_familia_id) re
  ),
  cuidadores_recomendados AS (
    SELECT
      r.cuidador_id,
      MIN(mr.niv) AS nivel_confianza,
      COUNT(DISTINCT r.id) AS total_recs,
      STRING_AGG(DISTINCT f.nombre || ' ' || LEFT(f.apellido, 1) || '.', ', ' ORDER BY f.nombre || ' ' || LEFT(f.apellido, 1) || '.') AS fams_rec
    FROM public.recomendaciones r
    INNER JOIN mi_red mr ON r.familia_id = mr.fam_id
    INNER JOIN public.familias f ON r.familia_id = f.id
    WHERE r.estado = 'activa'
      AND r.cuidador_id IS NOT NULL
    GROUP BY r.cuidador_id
  )
  SELECT
    c.id AS cuidador_id,
    c.nombre,
    c.apellido,
    c.especialidades,
    c.foto_url,
    c.valoracion,
    c.experiencia_anios,
    c.localidad,
    c.provincia,
    c.lat,
    c.lng,
    c.disponibilidad,
    cr.nivel_confianza::INTEGER,
    cr.total_recs AS total_recomendaciones,
    cr.fams_rec AS familias_que_recomiendan
  FROM cuidadores_recomendados cr
  INNER JOIN public.cuidadores c ON cr.cuidador_id = c.id
  WHERE c.estado = 'aprobado'
    AND (p_especialidad IS NULL OR p_especialidad::especialidad_cuidador = ANY(c.especialidades))
    AND (p_zona IS NULL OR c.localidad ILIKE '%' || p_zona || '%' OR c.provincia ILIKE '%' || p_zona || '%')
  ORDER BY cr.nivel_confianza ASC, cr.total_recs DESC, c.valoracion DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 5d. Contar cuidadores en la red de una familia
CREATE OR REPLACE FUNCTION public.contar_cuidadores_en_red(p_familia_id UUID)
RETURNS TABLE(total BIGINT, nivel_1 BIGINT, nivel_2 BIGINT) AS $$
BEGIN
  RETURN QUERY
  WITH mi_red AS (
    SELECT p_familia_id AS fam_id, 0 AS niv
    UNION ALL
    SELECT re.familia_id, re.nivel
    FROM public.red_extendida(p_familia_id) re
  ),
  por_nivel AS (
    SELECT
      r.cuidador_id,
      MIN(mr.niv) AS mejor_nivel
    FROM public.recomendaciones r
    INNER JOIN mi_red mr ON r.familia_id = mr.fam_id
    WHERE r.estado = 'activa' AND r.cuidador_id IS NOT NULL
    GROUP BY r.cuidador_id
  )
  SELECT
    COUNT(*)::BIGINT AS total,
    COUNT(*) FILTER (WHERE mejor_nivel <= 1)::BIGINT AS nivel_1,
    COUNT(*) FILTER (WHERE mejor_nivel = 2)::BIGINT AS nivel_2
  FROM por_nivel;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ---------------------------------------------------------------
--  6. RLS
-- ---------------------------------------------------------------
ALTER TABLE public.conexiones_familia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recomendaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitaciones_red ENABLE ROW LEVEL SECURITY;

-- Policies: acceso vía service_role (backend maneja toda la lógica)
-- Lectura pública para las que necesitan el frontend

-- Conexiones: lectura pública (filtrado por backend)
CREATE POLICY "Lectura conexiones" ON public.conexiones_familia FOR SELECT USING (true);
CREATE POLICY "Insert conexiones" ON public.conexiones_familia FOR INSERT WITH CHECK (true);
CREATE POLICY "Update conexiones" ON public.conexiones_familia FOR UPDATE USING (true);

-- Recomendaciones: lectura pública
CREATE POLICY "Lectura recomendaciones" ON public.recomendaciones FOR SELECT USING (true);
CREATE POLICY "Insert recomendaciones" ON public.recomendaciones FOR INSERT WITH CHECK (true);
CREATE POLICY "Update recomendaciones" ON public.recomendaciones FOR UPDATE USING (true);

-- Invitaciones red
CREATE POLICY "Lectura invitaciones_red" ON public.invitaciones_red FOR SELECT USING (true);
CREATE POLICY "Insert invitaciones_red" ON public.invitaciones_red FOR INSERT WITH CHECK (true);
CREATE POLICY "Update invitaciones_red" ON public.invitaciones_red FOR UPDATE USING (true);

-- ---------------------------------------------------------------
--  7. TRIGGERS
-- ---------------------------------------------------------------

-- Trigger: cuando un cuidador se da de baja, guardar snapshot en contactos
CREATE OR REPLACE FUNCTION public.on_cuidador_baja()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'suspendido' AND OLD.estado != 'suspendido' THEN
    UPDATE public.contactos_desbloqueados
    SET estado = 'no_disponible',
        cuidador_snapshot = jsonb_build_object(
          'nombre', OLD.nombre,
          'apellido', OLD.apellido,
          'especialidades', to_jsonb(OLD.especialidades),
          'localidad', OLD.localidad,
          'foto_url', OLD.foto_url,
          'valoracion', OLD.valoracion,
          'snapshot_at', now()
        )
    WHERE cuidador_id = NEW.id AND estado IN ('activo', 'contratado');
  END IF;

  -- Si vuelve a estar aprobado, reactivar contactos
  IF NEW.estado = 'aprobado' AND OLD.estado = 'suspendido' THEN
    UPDATE public.contactos_desbloqueados
    SET estado = 'activo',
        cuidador_snapshot = NULL
    WHERE cuidador_id = NEW.id AND estado = 'no_disponible';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cuidador_baja ON public.cuidadores;
CREATE TRIGGER trg_cuidador_baja
  AFTER UPDATE OF estado ON public.cuidadores
  FOR EACH ROW EXECUTE FUNCTION public.on_cuidador_baja();

-- Trigger: updated_at en recomendaciones
DROP TRIGGER IF EXISTS trg_recomendaciones_touch ON public.recomendaciones;
CREATE TRIGGER trg_recomendaciones_touch
  BEFORE UPDATE ON public.recomendaciones
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
