-- ============================================================
--  Cuidy · Tabla admin_usuarios
--  Sistema de autenticación de admin basado en base de datos
--  Aplicar en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- Enum de roles admin
do $$ begin
  create type rol_admin as enum ('superadmin', 'admin');
exception when duplicate_object then null; end $$;

-- Tabla de usuarios admin
create table if not exists admin_usuarios (
  id            uuid primary key default gen_random_uuid(),
  usuario       text unique not null,
  password_hash text not null,          -- scrypt hash (formato: salt:hash en hex)
  nombre        text not null,
  email         text,
  rol           rol_admin not null default 'admin',
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Índice para login rápido
create index if not exists idx_admin_usuarios_usuario on admin_usuarios (usuario);

-- Trigger para updated_at
create or replace function update_admin_usuarios_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_admin_usuarios_updated_at on admin_usuarios;
create trigger trg_admin_usuarios_updated_at
  before update on admin_usuarios
  for each row execute function update_admin_usuarios_updated_at();

-- RLS: solo accesible con service_role key (backend)
alter table admin_usuarios enable row level security;
-- No crear políticas públicas = solo service_role puede acceder
