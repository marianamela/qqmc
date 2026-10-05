-- ============================================================
--  Cuidy · Esquema consolidado para PRODUCCIÓN
--  Generado: 2026-10-04
--  Incluye: schema.sql + migraciones 003-011 + tablas sql/
--  Ejecutar en: Supabase PROD → SQL Editor → New query → Run
--  IMPORTANTE: ejecutar ANTES de prod_seed.sql
-- ============================================================

-- Extensiones
create extension if not exists "pgcrypto";
create extension if not exists "unaccent";

-- ===============================================================
--  ENUMS
-- ===============================================================

do $$ begin
  create type estado_candidatura as enum (
    'borrador',
    'enviado',
    'identidad_aprobada',
    'perfil_completo',
    'en_revision',
    'correcciones_pedidas',
    'entrevista_agendada',
    'aprobado',
    'lista_espera',
    'baja_solicitada',
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

do $$ begin
  create type rol_admin as enum ('superadmin', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_match as enum (
    'pendiente_cuidador',
    'match',
    'desbloqueado',
    'rechazado',
    'vencido',
    'descartado'
  );
exception when duplicate_object then null; end $$;

-- ===============================================================
--  FUNCIONES auxiliares
-- ===============================================================

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create or replace function update_admin_usuarios_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- ===============================================================
--  CUIDADORES
-- ===============================================================

create table if not exists public.cuidadores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  estado estado_candidatura not null default 'enviado',

  -- Identidad (DNI y fecha_nacimiento opcionales: Didit.me los extrae)
  nombre text not null,
  apellido text not null,
  dni text,
  fecha_nacimiento date,
  genero text,
  nacionalidad text,

  -- Contacto
  email text not null,
  telefono text not null,
  password_hash text,

  -- Domicilio
  provincia text,
  localidad text,
  direccion text,

  -- Geolocalización
  lat double precision,
  lng double precision,

  -- Especialidades
  especialidades especialidad_cuidador[] not null default '{}',

  -- Experiencia y bio
  experiencia_anios int not null default 0,
  valor_hora_min int,
  valor_hora_max int,
  bio text,
  empleos jsonb not null default '[]'::jsonb,

  -- Formación
  educacion text,
  certificaciones text[] not null default '{}',
  certificaciones_otras text,
  idiomas text,

  -- Disponibilidad
  disponibilidad jsonb not null default '{}'::jsonb,
  modalidades text[] not null default '{}',
  zonas_trabajo text,
  radio_km int,

  -- Antecedentes
  antecedentes_fecha date,
  antecedentes_vence date generated always as (antecedentes_fecha + interval '6 months') stored,

  -- Perfil público
  foto_url text,
  valoracion numeric(2,1),
  resenas int default 0,
  verificado boolean default false,

  -- Consentimientos
  consentimientos jsonb not null default '{}'::jsonb,

  -- Motivos/feedback
  motivo_rechazo text,
  feedback_correcciones text,

  -- Referidos (007)
  referred_by uuid,
  utm_source text,
  utm_campaign text,
  referral_code text unique,

  -- Invitaciones (docs/sql-invitaciones)
  recomendado_por uuid,
  invitacion_codigo text,

  -- Baja de cuenta (009)
  baja_solicitada_at timestamptz default null,
  estado_previo_baja text default null
);

create index if not exists idx_cuidadores_estado on public.cuidadores (estado);
create index if not exists idx_cuidadores_esp on public.cuidadores using gin (especialidades);
create index if not exists idx_cuidadores_email on public.cuidadores (email);
create index if not exists idx_cuidadores_antecedentes on public.cuidadores (antecedentes_vence);
create index if not exists idx_cuidadores_baja on cuidadores(baja_solicitada_at) where baja_solicitada_at is not null;

drop trigger if exists trg_cuidadores_touch on public.cuidadores;
create trigger trg_cuidadores_touch before update on public.cuidadores
for each row execute function public.touch_updated_at();

-- ===============================================================
--  DOCUMENTOS
-- ===============================================================

create table if not exists public.cuidador_documentos (
  id uuid primary key default gen_random_uuid(),
  cuidador_id uuid not null references public.cuidadores(id) on delete cascade,
  tipo text not null,
  file_name text not null,
  file_type text,
  file_size bigint,
  storage_path text,
  data_url text,
  uploaded_at timestamptz not null default now(),
  unique (cuidador_id, tipo)
);

create index if not exists idx_cuidador_docs on public.cuidador_documentos (cuidador_id);

-- ===============================================================
--  REFERENCIAS PERSONALES
-- ===============================================================

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

-- ===============================================================
--  TIMELINE DE EVENTOS
-- ===============================================================

create table if not exists public.cuidador_eventos (
  id uuid primary key default gen_random_uuid(),
  cuidador_id uuid not null references public.cuidadores(id) on delete cascade,
  tipo tipo_evento not null,
  detalle text,
  metadata jsonb default '{}'::jsonb,
  actor text,
  created_at timestamptz not null default now()
);

create index if not exists idx_eventos_cuidador on public.cuidador_eventos (cuidador_id, created_at desc);

-- ===============================================================
--  NOTAS INTERNAS
-- ===============================================================

create table if not exists public.cuidador_notas (
  id uuid primary key default gen_random_uuid(),
  cuidador_id uuid not null references public.cuidadores(id) on delete cascade,
  autor text not null,
  contenido text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_notas_cuidador on public.cuidador_notas (cuidador_id, created_at desc);

-- ===============================================================
--  FAMILIAS
-- ===============================================================

create table if not exists public.familias (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  nombre text not null,
  apellido text not null,
  email text not null unique,
  telefono text not null,
  fecha_nacimiento date,
  busqueda jsonb not null default '{}'::jsonb,
  detalle jsonb not null default '{}'::jsonb,
  zona jsonb not null default '{}'::jsonb,
  preferencias jsonb not null default '{}'::jsonb,

  -- Estado y verificación (011 + add_estado_familias)
  estado text default 'pendiente',
  motivo_rechazo text,
  password_hash text,

  -- Referidos (007)
  referred_by uuid,
  utm_source text,
  utm_campaign text,
  referral_code text unique,

  -- Baja de cuenta (009)
  baja_solicitada_at timestamptz default null,
  estado_previo_baja text default null
);

create index if not exists idx_familias_email on public.familias (email);
create index if not exists idx_familias_estado on familias(estado);
create index if not exists idx_familias_baja on familias(baja_solicitada_at) where baja_solicitada_at is not null;

-- ===============================================================
--  ADMIN SCHEDULE
-- ===============================================================

create table if not exists public.admin_schedule (
  admin_user text primary key,
  dias_habiles int[] not null default '{1,2,3,4,5}',
  hora_desde time not null default '09:00',
  hora_hasta time not null default '18:00',
  horarios jsonb not null default '{}'::jsonb,
  duracion_min int not null default 30,
  anticipacion_min_horas int not null default 24,
  horizonte_dias int not null default 30,
  updated_at timestamptz not null default now()
);

-- ===============================================================
--  ADMIN USUARIOS (003 + 004)
-- ===============================================================

create table if not exists admin_usuarios (
  id uuid primary key default gen_random_uuid(),
  usuario text unique not null,
  password_hash text,
  nombre text not null,
  email text,
  rol rol_admin not null default 'admin',
  activo boolean not null default true,
  setup_token text,
  setup_token_expires timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_usuarios_usuario on admin_usuarios (usuario);

drop trigger if exists trg_admin_usuarios_updated_at on admin_usuarios;
create trigger trg_admin_usuarios_updated_at
  before update on admin_usuarios
  for each row execute function update_admin_usuarios_updated_at();

-- ===============================================================
--  OTP CODES (teléfono verificación)
-- ===============================================================

create table if not exists public.otp_codes (
  id serial primary key,
  telefono text not null unique,
  code text not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- ===============================================================
--  ADMIN NOTIFICACIONES
-- ===============================================================

create table if not exists public.admin_notificaciones (
  id serial primary key,
  tipo text not null,
  titulo text not null,
  mensaje text,
  metadata jsonb default '{}'::jsonb,
  leida boolean not null default false,
  created_at timestamptz default now()
);

-- ===============================================================
--  REFERIDOS Y CAMPAÑAS (007)
-- ===============================================================

create table if not exists referidos (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid,
  referrer_tipo text check (referrer_tipo in ('familia', 'cuidador')),
  referrer_nombre text,
  codigo text unique not null,
  referee_id uuid,
  referee_tipo text check (referee_tipo in ('familia', 'cuidador')),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  estado text default 'pendiente' check (estado in ('pendiente', 'link_abierto', 'registrado', 'activo')),
  canal_compartido text,
  landing_page text,
  created_at timestamptz default now(),
  opened_at timestamptz,
  registered_at timestamptz
);

create index if not exists idx_referidos_codigo on referidos(codigo);
create index if not exists idx_referidos_referrer on referidos(referrer_id, referrer_tipo);
create index if not exists idx_referidos_estado on referidos(estado);
create index if not exists idx_referidos_utm on referidos(utm_source, utm_campaign);

-- Agregar FK a cuidadores y familias ahora que referidos existe
alter table cuidadores add constraint fk_cuidadores_referred_by
  foreign key (referred_by) references referidos(id);
alter table familias add constraint fk_familias_referred_by
  foreign key (referred_by) references referidos(id);

create table if not exists campana_metricas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landing_page text,
  links_generados int default 0,
  links_abiertos int default 0,
  registros_iniciados int default 0,
  registros_completados int default 0,
  registros_familia int default 0,
  registros_cuidador int default 0,
  unique(fecha, utm_source, utm_medium, utm_campaign, landing_page)
);

create index if not exists idx_campana_fecha on campana_metricas(fecha);

-- Función generar_codigo_referido
create or replace function generar_codigo_referido(nombre text)
returns text as $$
declare
  base text;
  sufijo text;
  codigo text;
  intentos int := 0;
begin
  base := lower(regexp_replace(unaccent(nombre), '[^a-z0-9]', '', 'g'));
  if length(base) > 10 then base := substring(base, 1, 10); end if;
  loop
    sufijo := substring(md5(random()::text), 1, 4);
    codigo := base || '-' || sufijo;
    exit when not exists (select 1 from referidos where referidos.codigo = codigo);
    intentos := intentos + 1;
    if intentos > 10 then
      codigo := base || '-' || substring(md5(random()::text), 1, 8);
      exit;
    end if;
  end loop;
  return codigo;
end;
$$ language plpgsql;

-- ===============================================================
--  INVITACIONES
-- ===============================================================

create table if not exists invitaciones (
  id uuid default gen_random_uuid() primary key,
  familia_id uuid references familias(id),
  familia_nombre text not null,
  telefono_cuidador text not null,
  nombre_cuidador text,
  codigo text not null unique,
  estado text not null default 'enviada'
    check (estado in ('enviada', 'abierta', 'completada', 'expirada')),
  mensaje text,
  cuidador_id uuid references cuidadores(id),
  opened_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  -- Recomendación rápida
  familia_email text,
  familia_telefono text,
  origen text default 'panel',
  -- Anti-fraude
  tipo_servicio text,
  duracion_relacion text,
  actualmente_trabaja boolean,
  telefono_verificado boolean default false,
  fraud_score integer default 0,
  fraud_flags jsonb default '[]'::jsonb,
  ip_origen text,
  requiere_revision boolean default false
);

create index if not exists idx_invitaciones_familia on invitaciones(familia_id);
create index if not exists idx_invitaciones_codigo on invitaciones(codigo);
create index if not exists idx_invitaciones_telefono on invitaciones(telefono_cuidador);
create index if not exists idx_cuidadores_recomendado on cuidadores(recomendado_por) where recomendado_por is not null;
create index if not exists idx_invitaciones_familia_telefono on invitaciones(familia_telefono);
create index if not exists idx_invitaciones_ip_origen on invitaciones(ip_origen) where ip_origen is not null;
create index if not exists idx_invitaciones_requiere_revision on invitaciones(requiere_revision) where requiere_revision = true;

-- FK recomendado_por → familias
alter table cuidadores add constraint fk_cuidadores_recomendado_por
  foreign key (recomendado_por) references familias(id);

-- ===============================================================
--  SOLICITUDES DE RECOMENDACIÓN (Camino A)
-- ===============================================================

create table if not exists solicitudes_recomendacion (
  id uuid default gen_random_uuid() primary key,
  cuidador_nombre text not null,
  cuidador_telefono text not null,
  familia_nombre text not null,
  familia_telefono text not null,
  tipo_servicio text not null,
  estado text default 'pendiente'
    check (estado in ('pendiente', 'enviada', 'completada', 'expirada', 'rechazada')),
  ip_origen text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_solicitudes_rec_cuidador_tel on solicitudes_recomendacion(cuidador_telefono);
create index if not exists idx_solicitudes_rec_familia_tel on solicitudes_recomendacion(familia_telefono);
create index if not exists idx_solicitudes_rec_estado on solicitudes_recomendacion(estado) where estado in ('pendiente', 'enviada');

-- ===============================================================
--  LISTA DE ESPERA CUIDADORES (Camino B)
-- ===============================================================

create table if not exists lista_espera_cuidadores (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  telefono text not null,
  telefono_verificado boolean default false,
  email text not null,
  tipo_servicio text not null,
  experiencia text not null,
  provincia text not null,
  localidad text not null,
  referencias text,
  estado text default 'pendiente'
    check (estado in ('pendiente', 'en_revision', 'aprobado', 'rechazado')),
  notas_admin text,
  ip_origen text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_lista_espera_telefono on lista_espera_cuidadores(telefono);
create index if not exists idx_lista_espera_estado on lista_espera_cuidadores(estado) where estado in ('pendiente', 'en_revision');

-- ===============================================================
--  SUSCRIPCIONES Y PAGOS
-- ===============================================================

create table if not exists planes (
  id text primary key,
  nombre text not null,
  descripcion text,
  precio_ars numeric(10,2) not null,
  precio_usd numeric(6,2) not null,
  duracion_dias int not null default 30,
  contactos_incluidos int,
  incluye_diario boolean default false,
  activo boolean default true,
  created_at timestamptz default now()
);

create table if not exists suscripciones (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references familias(id),
  plan_id text not null references planes(id),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'activa', 'vencida', 'cancelada')),
  contactos_usados int default 0,
  fecha_inicio timestamptz,
  fecha_fin timestamptz,
  mp_preference_id text,
  mp_payment_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_suscripciones_familia on suscripciones(familia_id, estado);
create index if not exists idx_suscripciones_mp on suscripciones(mp_preference_id);

create table if not exists contactos_desbloqueados (
  id serial primary key,
  familia_id uuid not null references familias(id),
  cuidador_id uuid not null references cuidadores(id),
  suscripcion_id uuid references suscripciones(id),
  desbloqueado_at timestamptz default now(),
  unique(familia_id, cuidador_id)
);

create index if not exists idx_contactos_desbloqueados_familia on contactos_desbloqueados(familia_id);

create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references familias(id),
  suscripcion_id uuid references suscripciones(id),
  monto_ars numeric(10,2) not null,
  monto_usd numeric(6,2),
  metodo text default 'mercadopago',
  mp_payment_id text,
  mp_status text,
  mp_status_detail text,
  created_at timestamptz default now()
);

create index if not exists idx_pagos_familia on pagos(familia_id);
create index if not exists idx_pagos_mp on pagos(mp_payment_id);

-- Función helper
create or replace function familia_puede_ver_contacto(p_familia_id uuid, p_cuidador_id uuid)
returns boolean as $$
declare
  ya_desbloqueado boolean;
  sub record;
begin
  select exists(
    select 1 from contactos_desbloqueados
    where familia_id = p_familia_id and cuidador_id = p_cuidador_id
  ) into ya_desbloqueado;
  if ya_desbloqueado then return true; end if;

  select * into sub from suscripciones
  where familia_id = p_familia_id
    and estado = 'activa'
    and (fecha_fin is null or fecha_fin > now())
  order by created_at desc limit 1;

  if sub is not null then
    if (select contactos_incluidos from planes where id = sub.plan_id) is null then
      return true;
    end if;
    if sub.contactos_usados < (select contactos_incluidos from planes where id = sub.plan_id) then
      return true;
    end if;
  end if;
  return false;
end;
$$ language plpgsql security definer;

-- ===============================================================
--  SOLICITUDES DE CONTACTO (legacy)
-- ===============================================================

create table if not exists solicitudes_contacto (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references familias(id),
  cuidador_id uuid not null references cuidadores(id),
  suscripcion_id uuid references suscripciones(id),
  mensaje text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aceptada', 'rechazada')),
  respuesta_cuidador text,
  created_at timestamptz default now(),
  respondido_at timestamptz,
  unique(familia_id, cuidador_id)
);

create index if not exists idx_solicitudes_cuidador on solicitudes_contacto(cuidador_id, estado);
create index if not exists idx_solicitudes_familia on solicitudes_contacto(familia_id);

-- ===============================================================
--  DIARIO DE CUIDADO
-- ===============================================================

create table if not exists contratos (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references familias(id),
  cuidador_id uuid not null references cuidadores(id),
  tipo_cuidado especialidad_cuidador not null,
  persona_cuidada text,
  personas jsonb default '[]',
  estado text not null default 'activo'
    check (estado in ('activo', 'pausado', 'finalizado')),
  fecha_inicio date not null default current_date,
  fecha_fin date,
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_contratos_familia on contratos(familia_id);
create index if not exists idx_contratos_cuidador on contratos(cuidador_id);

create table if not exists diario_categorias (
  id serial primary key,
  contrato_id uuid not null references contratos(id) on delete cascade,
  nombre text not null,
  icono text default '📝',
  tipo text not null default 'quick'
    check (tipo in ('quick', 'detail', 'photo')),
  opciones_rapidas jsonb,
  activa boolean default true,
  orden int default 0
);

create index if not exists idx_diario_categorias_contrato on diario_categorias(contrato_id);

create table if not exists diario_entradas (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  cuidador_id uuid not null references cuidadores(id),
  categoria_id int references diario_categorias(id),
  tipo text not null default 'actividad'
    check (tipo in ('checkin', 'checkout', 'actividad', 'foto', 'nota', 'alerta', 'medicacion')),
  contenido text,
  foto_url text,
  metadata jsonb default '{}',
  lat double precision,
  lng double precision,
  created_at timestamptz default now()
);

create index if not exists idx_diario_entradas_contrato on diario_entradas(contrato_id, created_at desc);
create index if not exists idx_diario_entradas_cuidador on diario_entradas(cuidador_id, created_at desc);

create table if not exists diario_reacciones (
  id serial primary key,
  entrada_id uuid not null references diario_entradas(id) on delete cascade,
  familia_id uuid not null references familias(id),
  tipo text not null default 'corazon'
    check (tipo in ('corazon', 'gracias', 'visto')),
  comentario text,
  created_at timestamptz default now(),
  unique(entrada_id, familia_id)
);

create table if not exists diario_recordatorios (
  id serial primary key,
  contrato_id uuid not null references contratos(id) on delete cascade,
  titulo text not null,
  descripcion text,
  hora time not null,
  dias text[] default array['lun','mar','mie','jue','vie','sab','dom'],
  activo boolean default true,
  created_at timestamptz default now()
);

create table if not exists diario_mensajes (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  familia_id uuid not null references familias(id),
  contenido text not null,
  prioridad text not null default 'normal'
    check (prioridad in ('normal', 'importante')),
  leido boolean default false,
  leido_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_mensajes_contrato on diario_mensajes(contrato_id, created_at desc);
create index if not exists idx_mensajes_no_leidos on diario_mensajes(contrato_id, leido) where leido = false;

create table if not exists diario_categorias_template (
  id serial primary key,
  tipo_cuidado especialidad_cuidador not null,
  nombre text not null,
  icono text default '📝',
  tipo text not null default 'quick',
  opciones_rapidas jsonb,
  orden int default 0
);

-- ===============================================================
--  PUSH SUSCRIPCIONES
-- ===============================================================

create table if not exists push_suscripciones (
  id serial primary key,
  usuario_tipo text not null check (usuario_tipo in ('cuidador', 'familia')),
  usuario_id uuid not null,
  endpoint text not null,
  keys jsonb not null,
  created_at timestamptz default now(),
  unique(endpoint)
);

create index if not exists idx_push_usuario on push_suscripciones(usuario_tipo, usuario_id);

-- ===============================================================
--  MATCHES (010)
-- ===============================================================

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  familia_id uuid not null references public.familias(id) on delete cascade,
  cuidador_id uuid not null references public.cuidadores(id) on delete cascade,
  estado estado_match not null default 'pendiente_cuidador',
  familia_zona text,
  familia_servicio text,
  familia_horarios text,
  familia_detalle text,
  cuidador_respondio_at timestamptz,
  cuidador_motivo_rechazo text,
  match_at timestamptz,
  vence_at timestamptz,
  desbloqueado_at timestamptz,
  pago_id uuid,
  descartado_at timestamptz,
  vencido_at timestamptz,
  unique (familia_id, cuidador_id)
);

create index if not exists idx_matches_familia on public.matches (familia_id, estado);
create index if not exists idx_matches_cuidador on public.matches (cuidador_id, estado);
create index if not exists idx_matches_vence on public.matches (vence_at) where estado = 'match';

drop trigger if exists trg_matches_touch on public.matches;
create trigger trg_matches_touch before update on public.matches
for each row execute function public.touch_updated_at();

create table if not exists public.match_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- ===============================================================
--  VERIFICACIONES (011 — Motor de Confianza)
-- ===============================================================

create table if not exists public.verificaciones (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tipo text not null check (tipo in ('cuidador', 'familia')),
  persona_id uuid not null,
  proveedor text not null default 'didit' check (proveedor in ('didit', 'manual')),
  session_id text,
  estado text not null default 'not_started' check (estado in (
    'not_started', 'in_progress', 'approved', 'declined', 'in_review', 'expired'
  )),
  resultado_raw jsonb,
  motivo_rechazo text,
  event_id text,
  resuelto_por text,
  resuelto_at timestamptz,
  vence_at timestamptz
);

create index if not exists idx_verificaciones_persona on public.verificaciones (tipo, persona_id);
create index if not exists idx_verificaciones_session on public.verificaciones (session_id) where session_id is not null;
create index if not exists idx_verificaciones_estado on public.verificaciones (estado) where estado = 'in_review';
create unique index if not exists idx_verificaciones_event on public.verificaciones (event_id) where event_id is not null;

drop trigger if exists trg_verificaciones_touch on public.verificaciones;
create trigger trg_verificaciones_touch before update on public.verificaciones
for each row execute function public.touch_updated_at();

-- ===============================================================
--  PREGUNTAS DE EVALUACIÓN (011)
-- ===============================================================

create table if not exists public.preguntas_evaluacion (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  categoria text not null check (categoria in ('ninera', 'adulto_mayor', 'limpieza')),
  pregunta text not null,
  opciones jsonb not null,
  respuesta_correcta int not null check (respuesta_correcta between 0 and 3),
  es_critica boolean not null default false,
  version text not null default 'v1',
  activa boolean not null default true
);

create index if not exists idx_preguntas_cat on public.preguntas_evaluacion (categoria, activa);

-- ===============================================================
--  EVALUACIONES (011)
-- ===============================================================

create table if not exists public.evaluaciones (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cuidador_id uuid not null references public.cuidadores(id) on delete cascade,
  categoria text not null check (categoria in ('ninera', 'adulto_mayor', 'limpieza')),
  puntaje int not null check (puntaje between 0 and 10),
  aprobado boolean not null default false,
  respuestas jsonb not null default '[]'::jsonb,
  intento_num int not null default 1,
  version_banco text not null default 'v1'
);

create index if not exists idx_evaluaciones_cuidador on public.evaluaciones (cuidador_id, categoria);

-- ===============================================================
--  ROW LEVEL SECURITY
-- ===============================================================

alter table public.cuidadores enable row level security;
alter table public.cuidador_documentos enable row level security;
alter table public.cuidador_referencias enable row level security;
alter table public.cuidador_eventos enable row level security;
alter table public.cuidador_notas enable row level security;
alter table public.familias enable row level security;
alter table public.admin_schedule enable row level security;
alter table admin_usuarios enable row level security;
alter table public.otp_codes enable row level security;
alter table public.admin_notificaciones enable row level security;
alter table referidos enable row level security;
alter table campana_metricas enable row level security;
alter table invitaciones enable row level security;
alter table solicitudes_recomendacion enable row level security;
alter table lista_espera_cuidadores enable row level security;
alter table planes enable row level security;
alter table suscripciones enable row level security;
alter table contactos_desbloqueados enable row level security;
alter table pagos enable row level security;
alter table solicitudes_contacto enable row level security;
alter table contratos enable row level security;
alter table diario_entradas enable row level security;
alter table diario_reacciones enable row level security;
alter table diario_categorias enable row level security;
alter table diario_recordatorios enable row level security;
alter table diario_mensajes enable row level security;
alter table diario_categorias_template enable row level security;
alter table push_suscripciones enable row level security;
alter table public.matches enable row level security;
alter table public.match_config enable row level security;
alter table public.verificaciones enable row level security;
alter table public.preguntas_evaluacion enable row level security;
alter table public.evaluaciones enable row level security;

-- ===============================================================
--  RLS POLICIES
-- ===============================================================

-- Cuidadores: lectura pública solo aprobados
drop policy if exists "cuidadores_publico_lectura" on public.cuidadores;
create policy "cuidadores_publico_lectura" on public.cuidadores for select
  to anon, authenticated using (estado = 'aprobado');

-- Solicitudes de contacto
create policy "Lectura pública solicitudes_contacto" on solicitudes_contacto for select using (true);
create policy "Inserción pública solicitudes_contacto" on solicitudes_contacto for insert with check (true);
create policy "Update pública solicitudes_contacto" on solicitudes_contacto for update using (true);

-- Planes
create policy "Lectura pública planes" on planes for select using (true);

-- Suscripciones
create policy "Lectura suscripciones propias" on suscripciones for select using (true);
create policy "Inserción suscripciones" on suscripciones for insert with check (true);
create policy "Update suscripciones" on suscripciones for update using (true);

-- Contactos desbloqueados
create policy "Lectura contactos_desbloqueados" on contactos_desbloqueados for select using (true);
create policy "Inserción contactos_desbloqueados" on contactos_desbloqueados for insert with check (true);

-- Pagos
create policy "Lectura pagos" on pagos for select using (true);
create policy "Inserción pagos" on pagos for insert with check (true);

-- Invitaciones
create policy "Acceso público invitaciones" on invitaciones for all using (true) with check (true);

-- Referidos y métricas
create policy "service_all_referidos" on referidos for all
  using (auth.role() = 'service_role');
create policy "service_all_metricas" on campana_metricas for all
  using (auth.role() = 'service_role');

-- Solicitudes recomendación y lista espera
create policy "Service role full access solicitudes" on solicitudes_recomendacion for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "Service role full access lista_espera" on lista_espera_cuidadores for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Push suscripciones
create policy "Lectura pública push_suscripciones" on push_suscripciones for select using (true);
create policy "Inserción pública push_suscripciones" on push_suscripciones for insert with check (true);
create policy "Delete pública push_suscripciones" on push_suscripciones for delete using (true);

-- Diario
create policy "Lectura pública diario_entradas" on diario_entradas for select using (true);
create policy "Inserción pública diario_entradas" on diario_entradas for insert with check (true);
create policy "Lectura pública contratos" on contratos for select using (true);
create policy "Inserción pública contratos" on contratos for insert with check (true);
create policy "Lectura pública diario_categorias" on diario_categorias for select using (true);
create policy "Inserción pública diario_categorias" on diario_categorias for insert with check (true);
create policy "Lectura pública diario_reacciones" on diario_reacciones for select using (true);
create policy "Inserción pública diario_reacciones" on diario_reacciones for insert with check (true);
create policy "Lectura pública diario_recordatorios" on diario_recordatorios for select using (true);
create policy "Lectura pública diario_mensajes" on diario_mensajes for select using (true);
create policy "Inserción pública diario_mensajes" on diario_mensajes for insert with check (true);
create policy "Update pública diario_mensajes" on diario_mensajes for update using (true);

-- ============================================================
--  FIN DEL ESQUEMA CONSOLIDADO
-- ============================================================
