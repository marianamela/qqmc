-- ============================================================
-- Seed: usuarios de prueba para testing
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. FAMILIA DE PRUEBA
-- Email: familia.test@cuidy.com.ar  |  Password: Test1234!

-- Crear usuario en auth.users (Supabase Auth)
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  role,
  aud,
  confirmation_token
) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  '00000000-0000-0000-0000-000000000000',
  'familia.test@cuidy.com.ar',
  crypt('Test1234!', gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{"nombre": "Laura", "apellido": "García"}',
  now(),
  now(),
  'authenticated',
  'authenticated',
  ''
) ON CONFLICT (id) DO NOTHING;

-- Crear identidad en auth.identities
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  jsonb_build_object('sub', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'email', 'familia.test@cuidy.com.ar'),
  'email',
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  now(),
  now(),
  now()
) ON CONFLICT (provider, provider_id) DO NOTHING;

-- Crear registro en tabla familias
INSERT INTO familias (
  id, nombre, apellido, email, telefono, estado,
  zona, busqueda
) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'Laura',
  'García',
  'familia.test@cuidy.com.ar',
  '5491155001234',
  'aprobada',
  '{"provincia": "Buenos Aires", "localidad": "Palermo"}',
  '{}'
) ON CONFLICT (id) DO NOTHING;


-- 2. CUIDADOR/A DE PRUEBA
-- Email: cuidadora.test@cuidy.com.ar  |  Password: Test1234!
-- Hash: sha256("SESSION_SECRET:Test1234!")

INSERT INTO cuidadores (
  nombre, apellido, email, telefono, password_hash,
  dni, fecha_nacimiento, genero,
  estado, especialidades, experiencia_anios,
  provincia, localidad, bio,
  disponibilidad, modalidades,
  verificado, foto_url
) VALUES (
  'María', 'López', 'cuidadora.test@cuidy.com.ar', '5491155005678',
  '4dd218be7c94f00f42b2cc844c3e1215a22390d04b7f0b17e420a6e72569213b',
  '30123456', '1990-05-15', 'femenino',
  'aprobado',
  ARRAY['ninera', 'adulto_mayor']::especialidad_cuidador[],
  5,
  'Buenos Aires', 'Palermo',
  'Cuidadora profesional con 5 años de experiencia en niños y adultos mayores. Paciente, responsable y cariñosa.',
  '{"lun":{"manana":true,"tarde":true},"mar":{"manana":true,"tarde":true},"mie":{"manana":true,"tarde":true},"jue":{"manana":true,"tarde":true},"vie":{"manana":true,"tarde":true}}',
  ARRAY['con_retiro', 'sin_retiro'],
  true,
  'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&q=80'
) ON CONFLICT DO NOTHING;
