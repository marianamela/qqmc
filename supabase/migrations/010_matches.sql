-- ============================================================
--  010 · Sistema de matches (confirmación mutua)
--  Reemplaza el flujo de solicitudes directas por un match
--  intermedio donde el cuidador confirma interés ANTES del pago.
-- ============================================================

-- Estado del match
do $$ begin
  create type estado_match as enum (
    'pendiente_cuidador',   -- familia expresó interés, esperando respuesta del cuidador
    'match',                -- cuidador aceptó, esperando pago de la familia (48hs)
    'desbloqueado',         -- familia pagó, contacto visible para ambos
    'rechazado',            -- cuidador rechazó
    'vencido',              -- pasaron 48hs sin pago de la familia
    'descartado'            -- familia descartó el match antes de pagar
  );
exception when duplicate_object then null; end $$;

-- Tabla de matches
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  familia_id uuid not null references public.familias(id) on delete cascade,
  cuidador_id uuid not null references public.cuidadores(id) on delete cascade,
  estado estado_match not null default 'pendiente_cuidador',

  -- Datos que ve el cuidador para decidir (copiados al crear, no cambian)
  familia_zona text,             -- zona/localidad de la familia
  familia_servicio text,         -- tipo de servicio que busca
  familia_horarios text,         -- disponibilidad que necesita
  familia_detalle text,          -- descripción breve de lo que necesita

  -- Respuesta del cuidador
  cuidador_respondio_at timestamptz,
  cuidador_motivo_rechazo text,

  -- Match y pago
  match_at timestamptz,          -- cuándo se produjo el match (cuidador aceptó)
  vence_at timestamptz,          -- match_at + 48hs
  desbloqueado_at timestamptz,   -- cuándo la familia pagó
  pago_id uuid,                  -- referencia al pago en tabla pagos (nullable)

  -- Metadata
  descartado_at timestamptz,
  vencido_at timestamptz,

  -- No permitir duplicados activos
  unique (familia_id, cuidador_id)
);

-- Índices
create index if not exists idx_matches_familia on public.matches (familia_id, estado);
create index if not exists idx_matches_cuidador on public.matches (cuidador_id, estado);
create index if not exists idx_matches_vence on public.matches (vence_at) where estado = 'match';

-- Trigger updated_at (reutiliza función existente)
drop trigger if exists trg_matches_touch on public.matches;
create trigger trg_matches_touch before update on public.matches
for each row execute function public.touch_updated_at();

-- RLS: solo service_role
alter table public.matches enable row level security;

-- ============================================================
--  Configuración de límites de match (configurable por admin)
-- ============================================================
create table if not exists public.match_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.match_config enable row level security;

-- Valores por defecto
insert into public.match_config (key, value) values
  ('max_matches_simultaneos', '3'),
  ('horas_vencimiento', '48')
on conflict (key) do nothing;
