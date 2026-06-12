-- ============================================================
--  Cuidy · Agregar token de activación a admin_usuarios
--  Para el flujo de alta donde el superadmin crea el usuario
--  y el nuevo usuario configura su propia contraseña via email.
-- ============================================================

alter table admin_usuarios
  add column if not exists setup_token text,
  add column if not exists setup_token_expires timestamptz;

-- El password_hash deja de ser NOT NULL porque al crear un usuario
-- nuevo todavía no tiene contraseña (la configura por email)
alter table admin_usuarios
  alter column password_hash drop not null;
