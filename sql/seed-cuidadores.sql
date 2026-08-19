-- =============================================================E
-- QQMC · Seed de cuidadores de prueba (estado = aprobado)
-- Ejecutar en Supabase → SQL Editor → New Query → Run
-- =============================================================

INSERT INTO cuidadores (
  estado, nombre, apellido, dni, fecha_nacimiento, genero, email, telefono,
  password_hash, provincia, localidad, direccion, lat, lng,
  especialidades, experiencia_anios, bio, disponibilidad,
  zonas_trabajo, verificado, valoracion, resenas, foto_url
) VALUES

-- 1. Niñera verificada en Palermo
('aprobado', 'María', 'López', '32456789', '1991-03-15', 'femenino',
 'maria.lopez@test.com', '1155001001', 'seed_hash_01',
 'CABA', 'Palermo', 'Honduras 4500', -34.5875, -58.4270,
 ARRAY['ninera']::especialidad_cuidador[], 6,
 'Soy niñera profesional con más de 6 años de experiencia cuidando bebés y niños hasta 10 años. Tengo formación en primeros auxilios pediátricos y estimulación temprana. Me apasiona acompañar el crecimiento de los chicos con juegos, creatividad y mucho cariño.',
 '{"lun":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}},"mar":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}},"mie":{"manana":{"desde":"06:00","hasta":"13:00"}},"jue":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}},"vie":{"manana":{"desde":"06:00","hasta":"13:00"}}}',
 'Palermo, Belgrano, Colegiales, Villa Crespo',
 true, 4.8, 12, NULL),

-- 2. Niñera en Belgrano
('aprobado', 'Carolina', 'García', '33567890', '1997-08-22', 'femenino',
 'carolina.garcia@test.com', '1155002002', 'seed_hash_02',
 'CABA', 'Belgrano', 'Cabildo 1200', -34.5594, -58.4561,
 ARRAY['ninera']::especialidad_cuidador[], 3,
 'Estudié psicopedagogía y me especialicé en el cuidado de niños con necesidades especiales. Tengo experiencia con chicos de todas las edades y soy muy paciente y organizada. Me encanta enseñarles cosas nuevas mientras se divierten.',
 '{"lun":{"tarde":{"desde":"13:00","hasta":"21:00"}},"mar":{"tarde":{"desde":"13:00","hasta":"21:00"}},"mie":{"tarde":{"desde":"13:00","hasta":"21:00"}},"jue":{"tarde":{"desde":"13:00","hasta":"21:00"}},"vie":{"tarde":{"desde":"13:00","hasta":"21:00"}}}',
 'Belgrano, Núñez, Coghlan, Palermo',
 false, 4.5, 8, NULL),

-- 3. Cuidado adulto mayor en Recoleta
('aprobado', 'Susana', 'Martínez', '28123456', '1980-01-10', 'femenino',
 'susana.martinez@test.com', '1155003003', 'seed_hash_03',
 'CABA', 'Recoleta', 'Av. Callao 1500', -34.5955, -58.3925,
 ARRAY['adulto_mayor']::especialidad_cuidador[], 10,
 'Enfermera recibida con 10 años de experiencia en cuidado de adultos mayores. Manejo medicación, control de signos vitales, rehabilitación básica y acompañamiento diario. Trabajé en geriátricos y a domicilio. Soy responsable, empática y muy comprometida con el bienestar de mis pacientes.',
 '{"lun":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"},"noche":{"desde":"21:00","hasta":"06:00"}},"mar":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}},"mie":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"},"noche":{"desde":"21:00","hasta":"06:00"}},"jue":{"manana":{"desde":"06:00","hasta":"13:00"}},"vie":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}},"sab":{"manana":{"desde":"06:00","hasta":"13:00"}},"dom":{"manana":{"desde":"06:00","hasta":"13:00"}}}',
 'Recoleta, Barrio Norte, Retiro, Palermo',
 true, 4.9, 23, NULL),

-- 4. Empleada doméstica en Caballito
('aprobado', 'Rosa', 'Fernández', '30789012', '1985-06-30', 'femenino',
 'rosa.fernandez@test.com', '1155004004', 'seed_hash_04',
 'CABA', 'Caballito', 'Av. Rivadavia 5200', -34.6186, -58.4374,
 ARRAY['domestica']::especialidad_cuidador[], 8,
 'Tengo 8 años de experiencia en limpieza y organización del hogar. Soy detallista, puntual y muy prolija. Manejo productos especiales para diferentes superficies, organizo placares y cocinas. También cocino comidas caseras saludables si la familia lo necesita.',
 '{"lun":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}},"mar":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}},"mie":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}},"jue":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}},"vie":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}}}',
 'Caballito, Almagro, Flores, Parque Centenario',
 true, 4.7, 15, NULL),

-- 5. Niñera y cuidado adulto mayor en Villa Urquiza
('aprobado', 'Lucía', 'Romero', '35678901', '1999-11-05', 'femenino',
 'lucia.romero@test.com', '1155005005', 'seed_hash_05',
 'CABA', 'Villa Urquiza', 'Av. Triunvirato 4800', -34.5731, -58.4893,
 ARRAY['ninera','adulto_mayor']::especialidad_cuidador[], 2,
 'Soy estudiante de enfermería y trabajo como cuidadora para costear mis estudios. Tengo experiencia tanto con niños como con adultos mayores. Soy alegre, responsable y siempre dispuesta a aprender. Me adapto rápido a las necesidades de cada familia.',
 '{"lun":{"tarde":{"desde":"13:00","hasta":"21:00"}},"mie":{"tarde":{"desde":"13:00","hasta":"21:00"}},"vie":{"tarde":{"desde":"13:00","hasta":"21:00"}},"sab":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"},"noche":{"desde":"21:00","hasta":"06:00"}},"dom":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}}}',
 'Villa Urquiza, Belgrano, Coghlan, Saavedra',
 false, 4.2, 5, NULL),

-- 6. Empleada doméstica en San Isidro (GBA)
('aprobado', 'Patricia', 'Álvarez', '29345678', '1982-04-18', 'femenino',
 'patricia.alvarez@test.com', '1155006006', 'seed_hash_06',
 'Buenos Aires', 'San Isidro', 'Av. Centenario 900', -34.4710, -58.5278,
 ARRAY['domestica']::especialidad_cuidador[], 12,
 'Más de 12 años trabajando en casas de familia en zona norte. Me especializo en limpieza profunda, planchado impecable y organización general del hogar. Tengo referencias comprobables de todas las familias con las que trabajé. Soy confiable, discreta y muy trabajadora.',
 '{"lun":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}},"mar":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}},"mie":{"manana":{"desde":"06:00","hasta":"13:00"}},"jue":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}},"vie":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}}}',
 'San Isidro, Martínez, Acassuso, Beccar, Vicente López',
 true, 4.6, 18, NULL),

-- 7. Cuidado adulto mayor en Flores
('aprobado', 'Jorge', 'Mendoza', '27890123', '1978-09-12', 'masculino',
 'jorge.mendoza@test.com', '1155007007', 'seed_hash_07',
 'CABA', 'Flores', 'Av. Rivadavia 7100', -34.6283, -58.4631,
 ARRAY['adulto_mayor']::especialidad_cuidador[], 15,
 'Enfermero profesional con 15 años de experiencia en cuidado geriátrico. Me especializo en pacientes con Alzheimer y demencia. Manejo medicación compleja, rehabilitación motriz y acompañamiento emocional. Trabajo con dedicación y mucho respeto por la dignidad de cada persona.',
 '{"lun":{"noche":{"desde":"21:00","hasta":"06:00"}},"mar":{"noche":{"desde":"21:00","hasta":"06:00"}},"mie":{"noche":{"desde":"21:00","hasta":"06:00"}},"jue":{"noche":{"desde":"21:00","hasta":"06:00"}},"vie":{"noche":{"desde":"21:00","hasta":"06:00"}},"sab":{"noche":{"desde":"21:00","hasta":"06:00"}},"dom":{"noche":{"desde":"21:00","hasta":"06:00"}}}',
 'Flores, Floresta, Caballito, Parque Chacabuco',
 true, 4.9, 31, NULL),

-- 8. Niñera en Vicente López (GBA)
('aprobado', 'Valentina', 'Sosa', '36789012', '2000-02-28', 'femenino',
 'valentina.sosa@test.com', '1155008008', 'seed_hash_08',
 'Buenos Aires', 'Vicente López', 'Av. Maipú 1500', -34.5252, -58.4850,
 ARRAY['ninera']::especialidad_cuidador[], 1,
 'Recién recibida de maestra jardinera, busco trabajo como niñera para ganar experiencia mientras sigo capacitándome. Amo trabajar con chicos, soy super creativa y siempre propongo actividades educativas y divertidas. Tengo todas las vacunas al día y certificado de buena conducta.',
 '{"lun":{"manana":{"desde":"06:00","hasta":"13:00"}},"mar":{"manana":{"desde":"06:00","hasta":"13:00"}},"mie":{"manana":{"desde":"06:00","hasta":"13:00"}},"jue":{"manana":{"desde":"06:00","hasta":"13:00"}},"vie":{"manana":{"desde":"06:00","hasta":"13:00"}},"sab":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}}}',
 'Vicente López, Olivos, Florida, Munro',
 false, 0, 0, NULL),

-- 9. Empleada doméstica y niñera en Devoto
('aprobado', 'Graciela', 'Torres', '31234567', '1988-12-03', 'femenino',
 'graciela.torres@test.com', '1155009009', 'seed_hash_09',
 'CABA', 'Villa Devoto', 'Av. Salvador María del Carril 3800', -34.5983, -58.5142,
 ARRAY['domestica','ninera']::especialidad_cuidador[], 7,
 'Trabajo hace 7 años en casas de familia haciendo limpieza y también cuidando chicos. Puedo hacer las dos cosas a la vez o por separado según lo que necesite la familia. Cocino rico, soy ordenada y me llevo muy bien con los nenes. Tengo referencias de todas las casas donde trabajé.',
 '{"lun":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}},"mar":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}},"mie":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}},"jue":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}},"vie":{"manana":{"desde":"06:00","hasta":"13:00"}}}',
 'Villa Devoto, Villa del Parque, Monte Castro, Agronomía',
 true, 4.4, 9, NULL),

-- 10. Cuidado adulto mayor en Quilmes (GBA Sur)
('aprobado', 'Marta', 'Gutiérrez', '28567890', '1979-07-20', 'femenino',
 'marta.gutierrez@test.com', '1155010010', 'seed_hash_10',
 'Buenos Aires', 'Quilmes', 'Av. Mitre 600', -34.7243, -58.2535,
 ARRAY['adulto_mayor']::especialidad_cuidador[], 9,
 'Auxiliar de enfermería con 9 años de experiencia exclusiva en cuidado de adultos mayores a domicilio. Me especializo en acompañamiento nocturno, asistencia en higiene personal y administración de medicamentos. Soy paciente, cariñosa y muy comprometida con cada paciente.',
 '{"lun":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"},"noche":{"desde":"21:00","hasta":"06:00"}},"mar":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"},"noche":{"desde":"21:00","hasta":"06:00"}},"mie":{"manana":{"desde":"06:00","hasta":"13:00"}},"jue":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"},"noche":{"desde":"21:00","hasta":"06:00"}},"vie":{"manana":{"desde":"06:00","hasta":"13:00"},"tarde":{"desde":"13:00","hasta":"21:00"}},"sab":{"manana":{"desde":"06:00","hasta":"13:00"}},"dom":{"noche":{"desde":"21:00","hasta":"06:00"}}}',
 'Quilmes, Bernal, Berazategui, Avellaneda',
 true, 4.7, 20, NULL);
