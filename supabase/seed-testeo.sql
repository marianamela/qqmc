-- ============================================================
--  Cuidy · Seed de TESTEO COMPLETO
--  Ejecutar en la base DEV después de schema.sql y seed.sql
--
--  IMPORTANTE sobre login de familias:
--  Las familias se autentican vía Supabase Auth (email+password).
--  Este seed inserta los datos en la tabla `familias` pero NO crea
--  las cuentas en Supabase Auth. Para poder hacer login como familia:
--    Opción A: Registrate desde el formulario con los mismos emails/passwords
--    Opción B: Ejecutá el script setup-test-users.js (crea las cuentas Auth)
--
--  Las cuidadoras SÍ pueden hacer login directo porque usan hash propio.
--  Password de todas las cuidadoras: Test2026!
-- ============================================================


-- ===============================================================
--  0. PREÁMBULO DE SEGURIDAD
--     Asegura que los enum values, columnas y tablas necesarias
--     existan antes de insertar datos.
-- ===============================================================

-- Enum values que podrían no estar en el schema base
DO $$ BEGIN
  ALTER TYPE estado_candidatura ADD VALUE IF NOT EXISTS 'lista_espera' AFTER 'aprobado';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE estado_candidatura ADD VALUE IF NOT EXISTS 'identidad_aprobada' AFTER 'aprobado';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE estado_candidatura ADD VALUE IF NOT EXISTS 'perfil_completo' AFTER 'identidad_aprobada';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE estado_candidatura ADD VALUE IF NOT EXISTS 'baja_solicitada' AFTER 'lista_espera';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Columnas opcionales en cuidadores (pueden no existir en DEV)
ALTER TABLE public.cuidadores ADD COLUMN IF NOT EXISTS recomendado_por UUID;
ALTER TABLE public.cuidadores ADD COLUMN IF NOT EXISTS invitacion_codigo TEXT;

-- NOTA: cuidadores.email no tiene constraint UNIQUE en DEV,
-- así que los INSERTs de cuidadores usan WHERE NOT EXISTS en vez de ON CONFLICT.

-- Columnas opcionales en familias
ALTER TABLE public.familias ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'pendiente';

-- Tabla conexiones_familia (red de confianza)
CREATE TABLE IF NOT EXISTS public.conexiones_familia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES public.familias(id) ON DELETE CASCADE,
  conectada_id UUID NOT NULL REFERENCES public.familias(id) ON DELETE CASCADE,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'aceptada', 'rechazada', 'bloqueada')),
  mensaje TEXT,
  canal TEXT DEFAULT 'plataforma'
    CHECK (canal IN ('plataforma', 'whatsapp', 'email', 'link')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  aceptada_at TIMESTAMPTZ,
  UNIQUE(familia_id, conectada_id),
  CHECK (familia_id != conectada_id)
);

-- Tabla recomendaciones
CREATE TABLE IF NOT EXISTS public.recomendaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES public.familias(id) ON DELETE CASCADE,
  cuidador_id UUID REFERENCES public.cuidadores(id) ON DELETE SET NULL,
  cuidador_nombre TEXT,
  cuidador_telefono TEXT,
  cuidador_email TEXT,
  tipo_servicio TEXT NOT NULL,
  relacion TEXT,
  duracion_relacion TEXT,
  valoracion INTEGER CHECK (valoracion BETWEEN 1 AND 5),
  texto TEXT,
  estado TEXT NOT NULL DEFAULT 'activa'
    CHECK (estado IN ('activa', 'pendiente_registro', 'revocada')),
  ip_origen TEXT,
  fraud_score INTEGER DEFAULT 0,
  fraud_flags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla invitaciones (para ?inv= en registro)
CREATE TABLE IF NOT EXISTS public.invitaciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  familia_id UUID REFERENCES public.familias(id),
  familia_nombre TEXT,
  telefono_cuidador TEXT NOT NULL,
  nombre_cuidador TEXT,
  codigo TEXT NOT NULL UNIQUE,
  estado TEXT NOT NULL DEFAULT 'enviada'
    CHECK (estado IN ('enviada', 'abierta', 'completada', 'expirada')),
  mensaje TEXT,
  cuidador_id UUID REFERENCES public.cuidadores(id),
  opened_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla invitaciones_red (links compartibles entre familias)
CREATE TABLE IF NOT EXISTS public.invitaciones_red (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES public.familias(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL UNIQUE,
  canal TEXT DEFAULT 'link'
    CHECK (canal IN ('whatsapp', 'email', 'link')),
  usado_por UUID REFERENCES public.familias(id),
  usado_at TIMESTAMPTZ,
  expira_at TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla suscripciones (si no existe)
CREATE TABLE IF NOT EXISTS public.suscripciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES public.familias(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activa',
  contactos_usados INT DEFAULT 0,
  fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_fin TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla contactos_desbloqueados (si no existe)
CREATE TABLE IF NOT EXISTS public.contactos_desbloqueados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES public.familias(id) ON DELETE CASCADE,
  cuidador_id UUID NOT NULL REFERENCES public.cuidadores(id) ON DELETE CASCADE,
  suscripcion_id UUID REFERENCES public.suscripciones(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(familia_id, cuidador_id)
);
ALTER TABLE public.contactos_desbloqueados
  ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'activo';

-- Tabla contratos (si no existe)
CREATE TABLE IF NOT EXISTS public.contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES public.familias(id) ON DELETE CASCADE,
  cuidador_id UUID NOT NULL REFERENCES public.cuidadores(id) ON DELETE CASCADE,
  tipo_cuidado TEXT,
  persona_cuidada TEXT,
  estado TEXT NOT NULL DEFAULT 'activo',
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tablas diario (si no existen)
CREATE TABLE IF NOT EXISTS public.diario_categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  icono TEXT,
  tipo TEXT DEFAULT 'quick',
  opciones_rapidas JSONB,
  orden INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.diario_entradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  cuidador_id UUID NOT NULL REFERENCES public.cuidadores(id),
  categoria_id UUID REFERENCES public.diario_categorias(id),
  contenido JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ===============================================================
--  1. FAMILIAS DE PRUEBA (4 familias)
--     Password para Auth: Test2026!
-- ===============================================================

INSERT INTO public.familias (id, nombre, apellido, email, telefono, estado, zona, busqueda, preferencias)
VALUES
  -- FAM1: Ana Martínez — familia principal, red activa, suscripción
  ('a1000000-0000-0000-0000-000000000001',
   'Ana', 'Martínez', 'ana.test@cuidy.com.ar', '+54 11 4000-0001',
   'activa',
   '{"localidad":"Palermo","provincia":"caba"}'::jsonb,
   '{"tipo_cuidado":["ninera"],"modalidad":"part_time"}'::jsonb,
   '{"notificaciones":true}'::jsonb),

  -- FAM2: Laura Gómez — conectada con Ana, tiene recomendaciones
  ('a1000000-0000-0000-0000-000000000002',
   'Laura', 'Gómez', 'laura.test@cuidy.com.ar', '+54 11 4000-0002',
   'activa',
   '{"localidad":"Belgrano","provincia":"caba"}'::jsonb,
   '{"tipo_cuidado":["adulto_mayor"],"modalidad":"full_time"}'::jsonb,
   '{"notificaciones":true}'::jsonb),

  -- FAM3: Carolina Ruiz — conectada con Ana (nivel 2 para Laura)
  ('a1000000-0000-0000-0000-000000000003',
   'Carolina', 'Ruiz', 'caro.test@cuidy.com.ar', '+54 11 4000-0003',
   'activa',
   '{"localidad":"Recoleta","provincia":"caba"}'::jsonb,
   '{"tipo_cuidado":["domestica"],"modalidad":"part_time"}'::jsonb,
   '{"notificaciones":true}'::jsonb),

  -- FAM4: Valentina López — familia nueva, sin red (para probar feed vacío)
  ('a1000000-0000-0000-0000-000000000004',
   'Valentina', 'López', 'vale.test@cuidy.com.ar', '+54 11 4000-0004',
   'activa',
   '{"localidad":"Caballito","provincia":"caba"}'::jsonb,
   '{}'::jsonb,
   '{}'::jsonb)
ON CONFLICT (email) DO NOTHING;


-- ===============================================================
--  2. CUIDADORAS DE PRUEBA (5 cuidadoras con password_hash)
--     Password: Test2026!
--     Hash: SHA256("qqmc:Test2026!")
-- ===============================================================

-- CUID1: María Test — niñera aprobada, recomendada por Ana y Laura
INSERT INTO public.cuidadores
  (id, estado, nombre, apellido, dni, fecha_nacimiento, email, telefono, password_hash,
   provincia, localidad, lat, lng, especialidades, experiencia_anios, bio,
   disponibilidad, modalidades, zonas_trabajo, radio_km,
   foto_url, valoracion, resenas, verificado, valor_hora_min, valor_hora_max)
SELECT 'c1000000-0000-0000-0000-000000000001',
   'aprobado', 'María', 'Test', '20111111111', '1990-03-15'::date,
   'maria.cuid@cuidy.com.ar', '+54 11 5000-0001',
   '0f645abf739c016e386c720b51fa621219ff879592af3ea98d27fc22cb4f419d',
   'caba', 'Palermo', -34.5889, -58.4298,
   array['ninera']::especialidad_cuidador[], 8,
   'Niñera con experiencia en niños de 0 a 6 años. Maestra jardinera. RCP certificado.',
   '{"lun":{"m":true,"t":true},"mar":{"m":true,"t":true},"mie":{"m":true,"t":true},"jue":{"m":true,"t":true},"vie":{"m":true,"t":true}}'::jsonb,
   array['part_time','por_hora'], 'Palermo, Belgrano, Recoleta', 5,
   'https://i.pravatar.cc/200?img=1', 4.8, 24, true, 1500, 2500
WHERE NOT EXISTS (SELECT 1 FROM public.cuidadores WHERE email = 'maria.cuid@cuidy.com.ar');

-- CUID2: Susana Test — adulto mayor aprobada, recomendada por Laura
INSERT INTO public.cuidadores
  (id, estado, nombre, apellido, dni, fecha_nacimiento, email, telefono, password_hash,
   provincia, localidad, lat, lng, especialidades, experiencia_anios, bio,
   disponibilidad, modalidades, zonas_trabajo, radio_km,
   foto_url, valoracion, resenas, verificado, valor_hora_min, valor_hora_max)
SELECT 'c1000000-0000-0000-0000-000000000002',
   'aprobado', 'Susana', 'Test', '20222222222', '1975-08-22'::date,
   'susana.cuid@cuidy.com.ar', '+54 11 5000-0002',
   '0f645abf739c016e386c720b51fa621219ff879592af3ea98d27fc22cb4f419d',
   'caba', 'Belgrano', -34.5627, -58.4583,
   array['adulto_mayor']::especialidad_cuidador[], 15,
   'Auxiliar gerontológica con matrícula. Experiencia con pacientes con Alzheimer y Parkinson.',
   '{"lun":{"m":true,"t":true,"n":true},"mar":{"m":true,"t":true,"n":true},"mie":{"m":true,"t":true,"n":true},"jue":{"m":true,"t":true,"n":true},"vie":{"m":true,"t":true,"n":true},"sab":{"m":true,"t":true}}'::jsonb,
   array['full_time','con_cama'], 'Belgrano, Núñez, Vicente López', 8,
   'https://i.pravatar.cc/200?img=5', 4.9, 45, true, 2000, 3500
WHERE NOT EXISTS (SELECT 1 FROM public.cuidadores WHERE email = 'susana.cuid@cuidy.com.ar');

-- CUID3: Rosa Test — doméstica aprobada, recomendada por Carolina
INSERT INTO public.cuidadores
  (id, estado, nombre, apellido, dni, fecha_nacimiento, email, telefono, password_hash,
   provincia, localidad, lat, lng, especialidades, experiencia_anios, bio,
   disponibilidad, modalidades, zonas_trabajo, radio_km,
   foto_url, valoracion, resenas, verificado, valor_hora_min, valor_hora_max)
SELECT 'c1000000-0000-0000-0000-000000000003',
   'aprobado', 'Rosa', 'Test', '20333333333', '1982-11-10'::date,
   'rosa.cuid@cuidy.com.ar', '+54 11 5000-0003',
   '0f645abf739c016e386c720b51fa621219ff879592af3ea98d27fc22cb4f419d',
   'caba', 'Recoleta', -34.5875, -58.3935,
   array['domestica']::especialidad_cuidador[], 12,
   'Empleada doméstica con 12 años de experiencia. Limpieza, planchado y cocina.',
   '{"lun":{"m":true,"t":true},"mie":{"m":true,"t":true},"vie":{"m":true,"t":true}}'::jsonb,
   array['part_time'], 'Recoleta, Palermo, Barrio Norte', 4,
   'https://i.pravatar.cc/200?img=10', 4.6, 18, true, 1200, 1800
WHERE NOT EXISTS (SELECT 1 FROM public.cuidadores WHERE email = 'rosa.cuid@cuidy.com.ar');

-- CUID4: Julia Test — niñera, SIN recomendación (para probar perfil no visible)
INSERT INTO public.cuidadores
  (id, estado, nombre, apellido, dni, fecha_nacimiento, email, telefono, password_hash,
   provincia, localidad, lat, lng, especialidades, experiencia_anios, bio,
   disponibilidad, modalidades, zonas_trabajo, radio_km,
   foto_url, valoracion, resenas, verificado, valor_hora_min, valor_hora_max)
SELECT 'c1000000-0000-0000-0000-000000000004',
   'enviado', 'Julia', 'Test', '20444444444', '1995-06-28'::date,
   'julia.cuid@cuidy.com.ar', '+54 11 5000-0004',
   '0f645abf739c016e386c720b51fa621219ff879592af3ea98d27fc22cb4f419d',
   'caba', 'Caballito', -34.6190, -58.4406,
   array['ninera']::especialidad_cuidador[], 3,
   'Niñera. Estudiante de nutrición. Preparación de viandas saludables para niños.',
   '{"lun":{"m":true,"t":true},"mar":{"m":true,"t":true},"mie":{"m":true,"t":true},"jue":{"m":true,"t":true},"vie":{"m":true,"t":true}}'::jsonb,
   array['part_time','por_hora'], 'Caballito, Almagro, Flores', 5,
   'https://i.pravatar.cc/200?img=25', 0, 0, false, 1000, 1800
WHERE NOT EXISTS (SELECT 1 FROM public.cuidadores WHERE email = 'julia.cuid@cuidy.com.ar');

-- CUID5: Lucía Test — recién registrada, perfil incompleto (para probar completar-perfil)
INSERT INTO public.cuidadores
  (id, estado, nombre, apellido, dni, fecha_nacimiento, email, telefono, password_hash,
   provincia, localidad, lat, lng, especialidades, experiencia_anios, bio,
   disponibilidad, modalidades, zonas_trabajo, radio_km,
   foto_url, valoracion, resenas, verificado, valor_hora_min, valor_hora_max)
SELECT 'c1000000-0000-0000-0000-000000000005',
   'enviado', 'Lucía', 'Test', '20555555555', '1998-01-05'::date,
   'lucia.cuid@cuidy.com.ar', '+54 11 5000-0005',
   '0f645abf739c016e386c720b51fa621219ff879592af3ea98d27fc22cb4f419d',
   'caba', 'Villa Crespo', null, null,
   array['ninera']::especialidad_cuidador[], 0,
   null,
   '{}'::jsonb,
   array['por_hora'], 'Villa Crespo', null,
   null, 0, 0, false, null, null
WHERE NOT EXISTS (SELECT 1 FROM public.cuidadores WHERE email = 'lucia.cuid@cuidy.com.ar');


-- ===============================================================
--  3. CONEXIONES ENTRE FAMILIAS (grafo social)
-- ===============================================================

-- Ana ↔ Laura (aceptada)
INSERT INTO public.conexiones_familia (familia_id, conectada_id, estado, canal, aceptada_at)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
   'aceptada', 'plataforma', now() - interval '15 days')
ON CONFLICT (familia_id, conectada_id) DO NOTHING;

-- Ana ↔ Carolina (aceptada)
INSERT INTO public.conexiones_familia (familia_id, conectada_id, estado, canal, aceptada_at)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003',
   'aceptada', 'whatsapp', now() - interval '10 days')
ON CONFLICT (familia_id, conectada_id) DO NOTHING;

-- Laura ↔ Carolina (pendiente — para probar solicitud pendiente)
INSERT INTO public.conexiones_familia (familia_id, conectada_id, estado, canal, mensaje)
VALUES
  ('a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003',
   'pendiente', 'plataforma', 'Hola Caro, Ana me pasó tu contacto. ¿Nos conectamos?')
ON CONFLICT (familia_id, conectada_id) DO NOTHING;


-- ===============================================================
--  4. RECOMENDACIONES (familia → cuidadora)
-- ===============================================================

-- Ana recomienda a María (niñera)
INSERT INTO public.recomendaciones (familia_id, cuidador_id, tipo_servicio, relacion, duracion_relacion, valoracion, texto, estado)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'ninera', 'empleador_actual', '1a_3a', 5,
   'María cuida a mis hijos hace 2 años. Es responsable, cariñosa y muy profesional. Mis hijos la adoran.',
   'activa');

-- Laura también recomienda a María (niñera) — 2 recomendaciones para misma cuidadora
INSERT INTO public.recomendaciones (familia_id, cuidador_id, tipo_servicio, relacion, duracion_relacion, valoracion, texto, estado)
VALUES
  ('a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001',
   'ninera', 'empleador_anterior', '6m_1a', 4,
   'María cuidó a mi nena durante un año. Excelente trato, puntual y muy dedicada.',
   'activa');

-- Laura recomienda a Susana (adulto mayor)
INSERT INTO public.recomendaciones (familia_id, cuidador_id, tipo_servicio, relacion, duracion_relacion, valoracion, texto, estado)
VALUES
  ('a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002',
   'adulto_mayor', 'empleador_actual', 'mas_3a', 5,
   'Susana cuida a mi mamá desde hace 4 años. Es una profesional increíble, con mucha paciencia y conocimiento.',
   'activa');

-- Carolina recomienda a Rosa (doméstica)
INSERT INTO public.recomendaciones (familia_id, cuidador_id, tipo_servicio, relacion, duracion_relacion, valoracion, texto, estado)
VALUES
  ('a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003',
   'domestica', 'empleador_actual', '1a_3a', 5,
   'Rosa trabaja conmigo hace 2 años. Impecable, organizada y muy confiable.',
   'activa');


-- ===============================================================
--  5. INVITACIÓN PENDIENTE (para probar registro con ?inv=)
-- ===============================================================

INSERT INTO public.invitaciones (familia_id, familia_nombre, telefono_cuidador, nombre_cuidador, codigo, estado)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Ana Martínez',
   '+54 11 5000-9999', 'Romina Ejemplo', 'TEST-INV-001', 'enviada')
ON CONFLICT (codigo) DO NOTHING;


-- ===============================================================
--  6. INVITACIÓN A LA RED (link compartible entre familias)
-- ===============================================================

INSERT INTO public.invitaciones_red (familia_id, codigo, canal, expira_at)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'RED-ANA-TEST', 'link', now() + interval '30 days')
ON CONFLICT (codigo) DO NOTHING;


-- ===============================================================
--  7. SUSCRIPCIÓN ACTIVA (Ana tiene plan mensual)
-- ===============================================================

INSERT INTO public.suscripciones (id, familia_id, plan_id, estado, contactos_usados, fecha_inicio, fecha_fin)
VALUES
  ('a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001',
   'mensual', 'activa', 1,
   now() - interval '10 days',
   now() + interval '20 days')
ON CONFLICT (id) DO NOTHING;


-- ===============================================================
--  8. CONTACTO DESBLOQUEADO (Ana desbloqueó a María)
-- ===============================================================

INSERT INTO public.contactos_desbloqueados (familia_id, cuidador_id, suscripcion_id, estado)
VALUES
  ('a1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000001',
   'contratado')
ON CONFLICT (familia_id, cuidador_id) DO NOTHING;


-- ===============================================================
--  9. CONTRATO ACTIVO + CATEGORÍAS DIARIO (Ana ↔ María)
-- ===============================================================

INSERT INTO public.contratos (id, familia_id, cuidador_id, tipo_cuidado, persona_cuidada, estado, notas)
VALUES
  ('b3000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001',
   'ninera', 'Tomás (4 años)',
   'activo',
   'Alergia al maní. Siesta después del almuerzo. Hora de pantalla: máx 30 min.')
ON CONFLICT (id) DO NOTHING;

-- Categorías del diario para el contrato
INSERT INTO public.diario_categorias (contrato_id, nombre, icono, tipo, opciones_rapidas, orden)
VALUES
  ('b3000000-0000-0000-0000-000000000001', 'Comida', '🍽️', 'quick',
   '["Comió todo", "Comió poco", "No quiso comer"]', 1),
  ('b3000000-0000-0000-0000-000000000001', 'Siesta', '😴', 'quick',
   '["Durmió bien", "Durmió poco", "No durmió"]', 2),
  ('b3000000-0000-0000-0000-000000000001', 'Actividad', '🎨', 'detail', null, 3),
  ('b3000000-0000-0000-0000-000000000001', 'Estado de ánimo', '😊', 'quick',
   '["Contento", "Tranquilo", "Irritable", "Lloró un poco"]', 4),
  ('b3000000-0000-0000-0000-000000000001', 'Momento del día', '📸', 'photo', null, 5);


-- ===============================================================
--  10. ENTRADAS DE DIARIO DE EJEMPLO (últimos 3 días)
-- ===============================================================

INSERT INTO public.diario_entradas (contrato_id, cuidador_id, categoria_id, contenido, created_at)
SELECT
  'b3000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  dc.id,
  CASE dc.nombre
    WHEN 'Comida' THEN '{"opcion":"Comió todo","nota":"Almorzó fideos con salsa. Repitió."}'
    WHEN 'Siesta' THEN '{"opcion":"Durmió bien","nota":"Siesta de 14 a 15:30."}'
    WHEN 'Actividad' THEN '{"nota":"Pintamos con témperas y armamos un castillo con bloques."}'
    WHEN 'Estado de ánimo' THEN '{"opcion":"Contento"}'
  END::jsonb,
  now() - interval '1 day'
FROM public.diario_categorias dc
WHERE dc.contrato_id = 'b3000000-0000-0000-0000-000000000001'
  AND dc.nombre IN ('Comida', 'Siesta', 'Actividad', 'Estado de ánimo');

INSERT INTO public.diario_entradas (contrato_id, cuidador_id, categoria_id, contenido, created_at)
SELECT
  'b3000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  dc.id,
  CASE dc.nombre
    WHEN 'Comida' THEN '{"opcion":"Comió poco","nota":"No quiso la verdura pero comió el arroz."}'
    WHEN 'Siesta' THEN '{"opcion":"Durmió poco","nota":"Solo 40 minutos, estaba muy activo."}'
    WHEN 'Estado de ánimo' THEN '{"opcion":"Irritable","nota":"Estuvo un poco caprichoso a la tarde."}'
  END::jsonb,
  now() - interval '2 days'
FROM public.diario_categorias dc
WHERE dc.contrato_id = 'b3000000-0000-0000-0000-000000000001'
  AND dc.nombre IN ('Comida', 'Siesta', 'Estado de ánimo');


-- ===============================================================
--  FIN DEL SEED DE TESTEO
-- ===============================================================
