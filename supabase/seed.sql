-- ============================================================
--  QQMC · Seed de cuidadores aprobados
--  Ejecutar DESPUÉS de schema.sql si querés datos de prueba
--  para el mapa público y el backoffice.
-- ============================================================

-- Limpieza opcional (comentá si no querés borrar nada existente)
-- truncate public.cuidadores cascade;

insert into public.cuidadores
  (estado, nombre, apellido, dni, fecha_nacimiento, email, telefono,
   provincia, localidad, direccion, lat, lng,
   especialidades, experiencia_anios, bio,
   disponibilidad, modalidades, zonas_trabajo, radio_km,
   foto_url, valoracion, resenas, verificado,
   antecedentes_fecha)
values
  ('aprobado','María','González','28123456','1991-05-15','maria.g@example.com','+54 11 5555-1001',
   'caba','Palermo','Av Santa Fe 3000',-34.5889,-58.4298,
   array['ninera']::especialidad_cuidador[], 10,
   'Maestra jardinera con 10 años de experiencia cuidando niños de 0 a 6 años.',
   '{"lun":{"desde":"08:00","hasta":"17:00"},"mar":{"desde":"08:00","hasta":"17:00"},"mie":{"desde":"08:00","hasta":"17:00"},"jue":{"desde":"08:00","hasta":"17:00"},"vie":{"desde":"08:00","hasta":"17:00"}}'::jsonb,
   array['full_time'], 'Palermo, Recoleta, Belgrano', 5,
   'https://i.pravatar.cc/200?img=1', 4.8, 42, true, current_date - interval '2 months'),

  ('aprobado','Laura','Pérez','23456789','1973-02-10','laura.p@example.com','+54 11 5555-1002',
   'caba','Belgrano','Juramento 2500',-34.5627,-58.4583,
   array['adulto_mayor']::especialidad_cuidador[], 20,
   'Enfermera geriátrica. Acompañamiento y cuidados básicos de adultos mayores.',
   '{"lun":{"desde":"07:00","hasta":"22:00"},"mar":{"desde":"07:00","hasta":"22:00"},"mie":{"desde":"07:00","hasta":"22:00"},"jue":{"desde":"07:00","hasta":"22:00"},"vie":{"desde":"07:00","hasta":"22:00"},"sab":{"desde":"08:00","hasta":"18:00"},"dom":{"desde":"08:00","hasta":"18:00"}}'::jsonb,
   array['full_time','con_cama'], 'Belgrano, Núñez, Colegiales', 5,
   'https://i.pravatar.cc/200?img=5', 4.9, 87, true, current_date - interval '1 month'),

  ('aprobado','Sofía','Ramírez','35678910','1997-09-20','sofia.r@example.com','+54 11 5555-1003',
   'caba','Caballito','Rivadavia 5000',-34.6190,-58.4406,
   array['ninera']::especialidad_cuidador[], 5,
   'Estudiante de Psicopedagogía, experiencia en cuidado de niños en edad escolar.',
   '{"lun":{"desde":"13:00","hasta":"20:00"},"mar":{"desde":"13:00","hasta":"20:00"},"mie":{"desde":"13:00","hasta":"20:00"},"jue":{"desde":"13:00","hasta":"20:00"},"vie":{"desde":"13:00","hasta":"20:00"},"sab":{"desde":"09:00","hasta":"18:00"},"dom":{"desde":"09:00","hasta":"18:00"}}'::jsonb,
   array['part_time','por_hora'], 'Caballito, Almagro, Flores', 5,
   'https://i.pravatar.cc/200?img=9', 4.6, 18, true, current_date - interval '3 months'),

  ('aprobado','Carolina','Díaz','27890123','1979-07-08','carolina.d@example.com','+54 11 5555-1004',
   'caba','Villa Urquiza','Triunvirato 4200',-34.5734,-58.4874,
   array['domestica']::especialidad_cuidador[], 15,
   'Empleada doméstica registrada. Tareas generales y limpieza profunda.',
   '{"lun":{"desde":"08:00","hasta":"12:00"},"mie":{"desde":"08:00","hasta":"12:00"},"vie":{"desde":"08:00","hasta":"12:00"}}'::jsonb,
   array['part_time'], 'Villa Urquiza, Villa Pueyrredón', 3,
   'https://i.pravatar.cc/200?img=10', 4.7, 56, true, current_date - interval '2 months'),

  ('aprobado','Ana','Torres','29012345','1986-12-01','ana.t@example.com','+54 11 5555-1005',
   'bsas','Vicente López','Av Maipú 1500',-34.5264,-58.4810,
   array['domestica']::especialidad_cuidador[], 12,
   'Tareas del hogar, planchado y cocina. Referencias comprobables.',
   '{"lun":{"desde":"08:00","hasta":"17:00"},"mar":{"desde":"08:00","hasta":"17:00"},"mie":{"desde":"08:00","hasta":"17:00"},"jue":{"desde":"08:00","hasta":"17:00"},"vie":{"desde":"08:00","hasta":"17:00"}}'::jsonb,
   array['full_time'], 'Vicente López, Olivos, Florida', 5,
   'https://i.pravatar.cc/200?img=12', 4.5, 31, false, current_date - interval '4 months'),

  ('aprobado','Patricia','López','19876543','1967-04-22','patricia.l@example.com','+54 11 5555-1006',
   'caba','Núñez','Av Libertador 7000',-34.5447,-58.4618,
   array['adulto_mayor']::especialidad_cuidador[], 25,
   'Auxiliar gerontológica matriculada. Manejo de pacientes con Alzheimer.',
   '{"lun":{"desde":"06:00","hasta":"23:00"},"mar":{"desde":"06:00","hasta":"23:00"},"mie":{"desde":"06:00","hasta":"23:00"},"jue":{"desde":"06:00","hasta":"23:00"},"vie":{"desde":"06:00","hasta":"23:00"},"sab":{"desde":"06:00","hasta":"23:00"},"dom":{"desde":"06:00","hasta":"23:00"}}'::jsonb,
   array['full_time','con_cama'], 'Núñez, Belgrano, Vicente López', 10,
   'https://i.pravatar.cc/200?img=20', 5.0, 104, true, current_date - interval '1 month'),

  ('aprobado','Julieta','Fernández','40123456','2000-06-14','julieta.f@example.com','+54 11 5555-1007',
   'caba','Almagro','Av Corrientes 4500',-34.6095,-58.4205,
   array['ninera']::especialidad_cuidador[], 3,
   'Profesora de nivel inicial. Estimulación temprana y apoyo escolar.',
   '{"lun":{"desde":"08:00","hasta":"16:00"},"mar":{"desde":"08:00","hasta":"16:00"},"mie":{"desde":"08:00","hasta":"16:00"},"jue":{"desde":"08:00","hasta":"16:00"},"vie":{"desde":"08:00","hasta":"16:00"}}'::jsonb,
   array['part_time','por_hora'], 'Almagro, Caballito, Balvanera', 3,
   'https://i.pravatar.cc/200?img=25', 4.4, 12, true, current_date - interval '3 months'),

  ('aprobado','Roxana','Álvarez','26543210','1978-11-30','roxana.a@example.com','+54 11 5555-1008',
   'bsas','San Isidro','Av del Libertador 15000',-34.4708,-58.5127,
   array['domestica']::especialidad_cuidador[], 18,
   'Experiencia en casas grandes. Limpieza, cocina y planchado.',
   '{"mar":{"desde":"08:00","hasta":"17:00"},"jue":{"desde":"08:00","hasta":"17:00"}}'::jsonb,
   array['part_time'], 'San Isidro, Martínez, Acassuso', 5,
   'https://i.pravatar.cc/200?img=32', 4.8, 64, true, current_date - interval '5 months'),

  ('aprobado','Mónica','Ruiz','25432101','1975-08-17','monica.r@example.com','+54 11 5555-1009',
   'caba','Flores','Av Rivadavia 7500',-34.6377,-58.4638,
   array['adulto_mayor']::especialidad_cuidador[], 22,
   'Acompañante terapéutica. Experiencia con pacientes oncológicos.',
   '{"lun":{"desde":"14:00","hasta":"23:00"},"mar":{"desde":"14:00","hasta":"23:00"},"mie":{"desde":"14:00","hasta":"23:00"},"jue":{"desde":"14:00","hasta":"23:00"},"vie":{"desde":"14:00","hasta":"23:00"},"sab":{"desde":"14:00","hasta":"23:00"}}'::jsonb,
   array['part_time','por_hora'], 'Flores, Caballito, Villa Crespo', 5,
   'https://i.pravatar.cc/200?img=16', 4.7, 48, true, current_date - interval '2 months'),

  ('aprobado','Valeria','Castro','32109876','1994-03-05','valeria.c@example.com','+54 11 5555-1010',
   'bsas','Tigre','Av Cazón 1500',-34.4265,-58.5796,
   array['ninera']::especialidad_cuidador[], 7,
   'Niñera con RCP certificado. Cuidado de bebés y niños pequeños.',
   '{"lun":{"desde":"07:00","hasta":"16:00"},"mar":{"desde":"07:00","hasta":"16:00"},"mie":{"desde":"07:00","hasta":"16:00"},"jue":{"desde":"07:00","hasta":"16:00"},"vie":{"desde":"07:00","hasta":"16:00"}}'::jsonb,
   array['full_time'], 'Tigre, San Fernando, Don Torcuato', 10,
   'https://i.pravatar.cc/200?img=47', 4.9, 29, true, current_date - interval '1 month'),

  -- Candidaturas en distintos estados (para probar backoffice)
  ('enviado','Silvina','Méndez','30456789','1984-01-20','silvina.m@example.com','+54 11 5555-2001',
   'caba','Caballito','Acoyte 800', null, null,
   array['ninera']::especialidad_cuidador[], 6,
   'Maestra jardinera recién recibida, con vocación por el cuidado infantil. Disponible en horarios de mañana y tarde.',
   '{"lun":{"desde":"08:00","hasta":"17:00"},"mar":{"desde":"08:00","hasta":"17:00"}}'::jsonb,
   array['part_time'], 'Caballito, Almagro', 3,
   null, null, 0, false, current_date - interval '1 month'),

  ('en_revision','Roberto','Suárez','31567890','1985-05-10','roberto.s@example.com','+54 11 5555-2002',
   'caba','Boedo','San Juan 3500', null, null,
   array['adulto_mayor']::especialidad_cuidador[], 8,
   'Enfermero profesional con experiencia en cuidados domiciliarios y hospitalarios. Manejo medicación y curaciones.',
   '{"lun":{"desde":"07:00","hasta":"22:00"},"mar":{"desde":"07:00","hasta":"22:00"},"mie":{"desde":"07:00","hasta":"22:00"},"jue":{"desde":"07:00","hasta":"22:00"}}'::jsonb,
   array['full_time','por_hora'], 'Boedo, San Cristóbal, Constitución', 5,
   null, null, 0, false, current_date - interval '2 months'),

  ('entrevista_agendada','Gabriela','Ortiz','29678901','1982-07-25','gabriela.o@example.com','+54 11 5555-2003',
   'bsas','Quilmes','Mitre 100', null, null,
   array['ninera','domestica']::especialidad_cuidador[], 12,
   'Experiencia mixta en cuidado de niños y tareas del hogar. Referencias de familias del sur del conurbano.',
   '{"lun":{"desde":"08:00","hasta":"17:00"},"mar":{"desde":"08:00","hasta":"17:00"},"mie":{"desde":"08:00","hasta":"17:00"},"jue":{"desde":"08:00","hasta":"17:00"},"vie":{"desde":"08:00","hasta":"17:00"}}'::jsonb,
   array['full_time'], 'Quilmes, Bernal, Avellaneda', 10,
   null, null, 0, false, current_date - interval '3 months');

-- Referencias de ejemplo para las candidaturas no aprobadas
insert into public.cuidador_referencias (cuidador_id, nombre, relacion, telefono)
select id, 'Familia Romero', 'Ex empleadora', '+54 11 5555-9001' from public.cuidadores where email = 'silvina.m@example.com';
insert into public.cuidador_referencias (cuidador_id, nombre, relacion, telefono)
select id, 'Hospital Italiano', 'Supervisor', '+54 11 5555-9002' from public.cuidadores where email = 'roberto.s@example.com';
insert into public.cuidador_referencias (cuidador_id, nombre, relacion, telefono)
select id, 'Familia Gutiérrez', 'Ex empleadora', '+54 11 5555-9003' from public.cuidadores where email = 'gabriela.o@example.com';

-- Documentos de ejemplo (solo metadata; no hay archivos reales aún)
insert into public.cuidador_documentos (cuidador_id, tipo, file_name, file_type, file_size)
select c.id, t.tipo, t.tipo || '.pdf', 'application/pdf', 204800
from public.cuidadores c
cross join (values ('dni_frente'),('dni_dorso'),('selfie_dni'),('antecedentes')) as t(tipo)
where c.email in ('silvina.m@example.com','roberto.s@example.com','gabriela.o@example.com')
on conflict do nothing;

-- Evento inicial de cada candidatura
insert into public.cuidador_eventos (cuidador_id, tipo, detalle, actor)
select id, 'registrada', 'Candidatura recibida', 'sistema' from public.cuidadores
on conflict do nothing;

-- Evento específico para la que ya tiene entrevista agendada
insert into public.cuidador_eventos (cuidador_id, tipo, detalle, metadata, actor)
select id, 'entrevista_agendada',
  'Entrevista virtual confirmada',
  jsonb_build_object('fecha', (now() + interval '3 days')::text, 'link', 'https://meet.jit.si/qqmc-gabriela'),
  'admin:mariana'
from public.cuidadores where email = 'gabriela.o@example.com';
