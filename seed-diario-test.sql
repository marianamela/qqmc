-- =============================================================
-- QQMC · Seed de prueba para el Diario de Cuidado
-- Ejecutar en Supabase → SQL Editor → New Query → Run
-- DESPUÉS de haber ejecutado seed-cuidadores.sql y supabase-diario.sql
-- =============================================================

-- 1. Crear una familia de prueba
INSERT INTO familias (nombre, apellido, email, telefono, busqueda, zona)
VALUES (
  'Laura', 'Rodríguez',
  'laura.rodriguez@test.com', '1155551234',
  '{"tipos": ["ninera"]}',
  '{"provincia": "CABA", "localidad": "Palermo"}'
)
ON CONFLICT DO NOTHING;

-- 2. Crear un contrato entre la familia y una cuidadora (María López, la niñera de Palermo)
-- Primero obtenemos los IDs
DO $$
DECLARE
  v_familia_id UUID;
  v_cuidador_id UUID;
  v_contrato_id UUID;
BEGIN
  -- Buscar la familia
  SELECT id INTO v_familia_id FROM familias WHERE email = 'laura.rodriguez@test.com' LIMIT 1;
  -- Buscar la cuidadora (María López)
  SELECT id INTO v_cuidador_id FROM cuidadores WHERE email = 'maria.lopez@test.com' LIMIT 1;

  IF v_familia_id IS NULL THEN
    RAISE NOTICE 'No se encontró la familia de prueba';
    RETURN;
  END IF;
  IF v_cuidador_id IS NULL THEN
    RAISE NOTICE 'No se encontró la cuidadora. ¿Ejecutaste seed-cuidadores.sql?';
    RETURN;
  END IF;

  -- Crear contrato
  INSERT INTO contratos (familia_id, cuidador_id, tipo_cuidado, persona_cuidada, notas)
  VALUES (v_familia_id, v_cuidador_id, 'ninera', 'Tomás (3 años) y Sofía (6 años)',
          'Tomás es alérgico al maní. Sofía tiene tarea de lengua los martes.')
  RETURNING id INTO v_contrato_id;

  -- Copiar categorías template de niñera al contrato
  INSERT INTO diario_categorias (contrato_id, nombre, icono, tipo, opciones_rapidas, orden)
  SELECT v_contrato_id, nombre, icono, tipo, opciones_rapidas, orden
  FROM diario_categorias_template
  WHERE tipo_cuidado = 'ninera'
  ORDER BY orden;

  -- Crear un recordatorio de prueba
  INSERT INTO diario_recordatorios (contrato_id, titulo, descripcion, hora, dias)
  VALUES (v_contrato_id, 'Merienda de Tomás', 'Sin maní ni frutos secos (alergia)', '16:00',
          ARRAY['lun','mar','mie','jue','vie']);

  -- Mostrar los datos para armar las URLs
  RAISE NOTICE '========================================';
  RAISE NOTICE 'DATOS PARA PROBAR:';
  RAISE NOTICE 'contrato_id: %', v_contrato_id;
  RAISE NOTICE 'cuidador_id: %', v_cuidador_id;
  RAISE NOTICE 'familia_id:  %', v_familia_id;
  RAISE NOTICE '========================================';
  RAISE NOTICE 'URL CUIDADOR: /diario-cuidador.html?contrato=%&cuidador=%', v_contrato_id, v_cuidador_id;
  RAISE NOTICE 'URL FAMILIA:  /diario-familia.html?contrato=%&familia=%', v_contrato_id, v_familia_id;
  RAISE NOTICE '========================================';
END $$;
