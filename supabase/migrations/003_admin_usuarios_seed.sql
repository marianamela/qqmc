-- ============================================================
--  Cuidy · Seed usuario superadmin inicial
--  Ejecutar DESPUÉS de 003_admin_usuarios.sql
--  Usuario: mariana / Password: qqmc2026
-- ============================================================

insert into admin_usuarios (usuario, password_hash, nombre, email, rol, activo)
values (
  'mariana',
  'a7b71ee128655e0ca23a57e36831d3be:c2c6fe0be6c5c8b13c2b1c9efb8fa80b79e7fc3aba40be8b9af0f44258ee48644e12fb8f281720a2f3762888621e5e26653a0e3ca7f78f3524dae987637b6631',
  'Mariana',
  'mariana.mela@gmail.com',
  'superadmin',
  true
)
on conflict (usuario) do nothing;
