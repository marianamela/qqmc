-- ============================================================
--  QQMC · Esquema base
--  Aplicar en: Supabase → SQL Editor → New query → Run
--  Seguro de correr varias veces (usa IF NOT EXISTS).
-- ============================================================

-- Extensión para UUIDs
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
--  ENUMS
-- ---------------------------------------------------------------
do $$ begin
  create type estado_candidatura as enum (
    'borrador',
    'enviado',
    'en_revision',
    'correcciones_pedidas',
    'entrevista_agendada',
    'aprobado',
    'rechazado',
    'suspendido',
    'vencido'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type especialidad_cuidador as enum ('ninera', 'adulto_mayor', 'domestica');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_evento as enum (
    'registrada',
    'correccion_pedida',
    'correccion_recibida',
    'entrevista_agendada',
    'entrevista_realizada',
    'aprobada',
    'rechazada',
    'suspendida',
    'nota_interna',
    'antecedentes_actualizados'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------
--  CUIDADORES (candidatura + perfil aprobado)
-- ---------------------------------------------------------------
create table if not exists public.cuidadores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Estado del flujo de revisión
  estado estado_candidatura not null default 'enviado',

  -- Identidad
  nombre text not null,
  apellido text not null,
  dni text not null,
  fecha_nacimiento date not null,
  genero text,
  nacionalidad text,

  -- Contacto
  email text not null,
  telefono text not null,
  password_hash text,  -- reservado para cuando implementemos auth del cuidador

  -- Domicilio
  provincia text,
  localidad text,
  direccion text,

  -- Geolocalización (para mapa)
  lat double precision,
  lng double precision,

  -- Especialidades (multi)
  especialidades especialidad_cuidador[] not null default '{}',

  -- Experiencia y bio
  experiencia_anios int not null default 0,
  tarifa_hora int,
  bio text,
  empleos jsonb not null default '[]'::jsonb,  -- [{familia, duracion, tareas}]

  -- Formación
  educacion text,
  certificaciones text[] not null default '{}',
  certificaciones_otras text,
  idiomas text,

  -- Disponibilidad
  disponibilidad jsonb not null default '{}'::jsonb, -- { lun:['manana'], ... }
  modalidades text[] not null default '{}',
  zonas_trabajo text,
  radio_km int,

  -- Antecedentes (control de vigencia)
  antecedentes_fecha date,
  antecedentes_vence date generated always as (antecedentes_fecha + interval '6 months') stored,

  -- Perfil público (completado al aprobar)
  foto_url text,
  valoracion numeric(2,1),
  resenas int default 0,
  verificado boolean default false,

  -- Consentimientos al momento del registro
  consentimientos jsonb not null default '{}'::jsonb,

  -- Motivos/feedback
  motivo_rechazo text,
  feedback_correcciones text
);

create index if not exists idx_cuidadores_estado on public.cuidadores (estado);
create index if not exists idx_cuidadores_esp on public.cuidadores using gin (especialidades);
create index if not exists idx_cuidadores_email on public.cuidadores (email);
create index if not exists idx_cuidadores_antecedentes on public.cuidadores (antecedentes_vence);

-- Trigger updated_at
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_cuidadores_touch on public.cuidadores;
create trigger trg_cuidadores_touch before update on public.cuidadores
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
--  DOCUMENTOS (metadata; archivos reales en Storage)
-- ---------------------------------------------------------------
create table if not exists public.cuidador_documentos (
  id uuid primary key default gen_random_uuid(),
  cuidador_id uuid not null references public.cuidadores(id) on delete cascade,
  tipo text not null,           -- dni_frente | dni_dorso | selfie_dni | antecedentes | cert_rcp | cert_otros | cv
  file_name text not null,
  file_type text,
  file_size bigint,
  storage_path text,            -- path en bucket 'cuidadores-docs' (si pasamos a Storage)
  data_url text,                -- dataURL base64 (mientras no usemos Storage) para preview
  uploaded_at timestamptz not null default now(),
  unique (cuidador_id, tipo)
);

-- Migración: agregar columna si la tabla ya existía
alter table public.cuidador_documentos
  add column if not exists data_url text;

create index if not exists idx_cuidador_docs on public.cuidador_documentos (cuidador_id);

-- ---------------------------------------------------------------
--  REFERENCIAS PERSONALES
-- ---------------------------------------------------------------
create table if not exists public.cuidador_referencias (
  id uuid primary key default gen_random_uuid(),
  cuidador_id uuid not null references public.cuidadores(id) on delete cascade,
  nombre text not null,
  relacion text,
  telefono text not null,
  verificada boolean default false,
  verificada_en timestamptz,
  verificada_por text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ref_cuidador on public.cuidador_referencias (cuidador_id);

-- ---------------------------------------------------------------
--  TIMELINE DE EVENTOS
-- ---------------------------------------------------------------
create table if not exists public.cuidador_eventos (
  id uuid primary key default gen_random_uuid(),
  cuidador_id uuid not null references public.cuidadores(id) on delete cascade,
  tipo tipo_evento not null,
  detalle text,                 -- mensaje / motivo / comentario
  metadata jsonb default '{}'::jsonb,   -- ej: {fecha_entrevista, link, hora}
  actor text,                   -- quién disparó el evento (ej: admin:mariana)
  created_at timestamptz not null default now()
);
create index if not exists idx_eventos_cuidador on public.cuidador_eventos (cuidador_id, created_at desc);

-- ---------------------------------------------------------------
--  NOTAS INTERNAS (solo equipo QqmC)
-- ---------------------------------------------------------------
create table if not exists public.cuidador_notas (
  id uuid primary key default gen_random_uuid(),
  cuidador_id uuid not null references public.cuidadores(id) on delete cascade,
  autor text not null,
  contenido text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_notas_cuidador on public.cuidador_notas (cuidador_id, created_at desc);

-- ---------------------------------------------------------------
--  FAMILIAS (registro simple por ahora)
-- ---------------------------------------------------------------
create table if not exists public.familias (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nombre text not null,
  apellido text not null,
  email text not null unique,
  telefono text not null,
  fecha_nacimiento date,
  busqueda jsonb not null default '{}'::jsonb,   -- { tipos, modalidad, frecuencia }
  detalle jsonb not null default '{}'::jsonb,    -- { ninera:{...}, adulto_mayor:{...}, ... }
  zona jsonb not null default '{}'::jsonb,       -- { provincia, localidad, direccion, depto, cp }
  preferencias jsonb not null default '{}'::jsonb
);
create index if not exists idx_familias_email on public.familias (email);

-- ---------------------------------------------------------------
--  RLS (Row Level Security)
--  Política: todo pasa por el service_role desde Netlify Functions.
--  Mantenemos RLS habilitado y SIN políticas públicas → solo el service_role
--  key (usada en el backend) puede leer/escribir. La ANON key no ve nada.
-- ---------------------------------------------------------------
alter table public.cuidadores enable row level security;
alter table public.cuidador_documentos enable row level security;
alter table public.cuidador_referencias enable row level security;
alter table public.cuidador_eventos enable row level security;
alter table public.cuidador_notas enable row level security;
alter table public.familias enable row level security;

-- Política pública de solo-lectura para cuidadores APROBADOS
-- (para que el mapa/búsqueda pública funcione con ANON key)
drop policy if exists "cuidadores_publico_lectura" on public.cuidadores;
create policy "cuidadores_publico_lectura"
on public.cuidadores for select
to anon, authenticated
using (estado = 'aprobado');

-- ---------------------------------------------------------------
--  AGENDA DEL ADMIN (disponibilidad para entrevistas)
--  Config por usuario del backend: qué días/horas acepta entrevistas.
--  El calendario cruza esta config con las entrevistas ya agendadas
--  (cuidador_eventos tipo='entrevista_agendada') para mostrar slots libres.
-- ---------------------------------------------------------------
create table if not exists public.admin_schedule (
  admin_user text primary key,
  dias_habiles int[] not null default '{1,2,3,4,5}',  -- 0=dom ... 6=sab (ISO: 1=lun) — legado
  hora_desde time not null default '09:00',           -- legado (franja única)
  hora_hasta time not null default '18:00',           -- legado (franja única)
  horarios jsonb not null default '{}'::jsonb,        -- franjas por día: { "1": {"desde":"09:00","hasta":"18:00"}, "2": {...} }
  duracion_min int not null default 30,               -- duración de cada slot
  anticipacion_min_horas int not null default 24,     -- no permitir agendar con menos anticipación
  horizonte_dias int not null default 30,             -- hasta cuántos días hacia adelante
  updated_at timestamptz not null default now()
);

-- Migración: si la tabla ya existía sin la columna horarios, la agregamos
alter table public.admin_schedule
  add column if not exists horarios jsonb not null default '{}'::jsonb;

-- RLS: solo service_role (sin políticas, como el resto)
alter table public.admin_schedule enable row level security;

-- ============================================================
--  BUCKETS DE STORAGE (ejecutar aparte si no existe)
--  En Supabase → Storage → New bucket → nombre: cuidadores-docs
--  → Public: NO  (privado; accedemos desde backend)
-- ============================================================
