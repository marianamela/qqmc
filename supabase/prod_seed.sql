-- ============================================================
--  Cuidy · Seed de PRODUCCIÓN
--  Ejecutar DESPUÉS de prod_schema.sql
--  Solo datos de configuración — sin datos de prueba
-- ============================================================

-- ===============================================================
--  1. ADMIN SUPERADMIN (mariana)
--     Hash generado con scrypt para password: qqmc2026
-- ===============================================================

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

-- Password: qqmc2026 (hash scrypt copiado de la base DEV)
-- Recomendación: cambiar la contraseña después del primer login en PROD

-- ===============================================================
--  2. MATCH CONFIG
-- ===============================================================

insert into public.match_config (key, value) values
  ('max_matches_simultaneos', '3'),
  ('horas_vencimiento', '48')
on conflict (key) do nothing;

-- ===============================================================
--  3. PLANES DE SUSCRIPCIÓN
-- ===============================================================

insert into planes (id, nombre, descripcion, precio_ars, precio_usd, duracion_dias, contactos_incluidos, incluye_diario) values
  ('contacto_unico', 'Contacto único', 'Acceso a los datos de contacto de 1 cuidador', 4245.00, 3.00, 0, 1, false),
  ('mensual', 'Plan Mensual', '5 contactos + Diario de Cuidado', 11320.00, 8.00, 30, 5, true),
  ('trimestral', 'Plan 3 Meses', '15 contactos + Diario de Cuidado', 28300.00, 20.00, 90, 15, true),
  ('semestral', 'Plan 6 Meses', '30 contactos + Diario de Cuidado', 49525.00, 35.00, 180, 30, true),
  ('anual', 'Plan Anual', 'Contactos ilimitados + Diario de Cuidado', 77825.00, 55.00, 365, NULL, true)
on conflict (id) do update set
  precio_ars = excluded.precio_ars,
  precio_usd = excluded.precio_usd,
  contactos_incluidos = excluded.contactos_incluidos;

-- ===============================================================
--  4. DIARIO — CATEGORÍAS TEMPLATE
-- ===============================================================

insert into diario_categorias_template (tipo_cuidado, nombre, icono, tipo, opciones_rapidas, orden) values
-- Niñera
('ninera', 'Comida', '🍽️', 'quick', '["Comió todo", "Comió poco", "No quiso comer"]', 1),
('ninera', 'Siesta', '😴', 'quick', '["Durmió bien", "Durmió poco", "No durmió"]', 2),
('ninera', 'Actividad', '🎨', 'detail', NULL, 3),
('ninera', 'Juegos', '🎲', 'quick', '["Jugó adentro", "Jugó afuera", "Juego tranquilo"]', 4),
('ninera', 'Estado de ánimo', '😊', 'quick', '["Contento/a", "Tranquilo/a", "Irritable", "Lloró un poco"]', 5),
('ninera', 'Pañal / Baño', '🧷', 'quick', '["Cambio de pañal", "Fue al baño solo/a", "Accidente"]', 6),
('ninera', 'Momento del día', '📸', 'photo', NULL, 7),
-- Adulto mayor
('adulto_mayor', 'Medicación', '💊', 'detail', '["Tomó todo", "Se olvidó una toma", "Se negó"]', 1),
('adulto_mayor', 'Comida', '🍽️', 'quick', '["Comió bien", "Comió poco", "No quiso comer", "Comió con ayuda"]', 2),
('adulto_mayor', 'Movilidad', '🚶', 'quick', '["Caminó bien", "Caminamos juntos", "Usó bastón/andador", "No quiso moverse"]', 3),
('adulto_mayor', 'Estado de ánimo', '🤍', 'quick', '["Tranquilo/a", "Conversador/a", "Confundido/a", "Irritable", "Triste"]', 4),
('adulto_mayor', 'Higiene', '🚿', 'quick', '["Se bañó solo/a", "Ayudé con el baño", "Cambio de ropa"]', 5),
('adulto_mayor', 'Signos vitales', '🩺', 'detail', NULL, 6),
('adulto_mayor', 'Momento del día', '📸', 'photo', NULL, 7),
-- Doméstica
('domestica', 'Limpieza', '🧹', 'quick', '["Limpieza general", "Limpieza profunda", "Solo habitaciones", "Solo cocina y baño"]', 1),
('domestica', 'Cocina', '🍳', 'quick', '["Preparé almuerzo", "Preparé cena", "Dejé comida lista"]', 2),
('domestica', 'Planchado', '👔', 'quick', '["Planchado completo", "Solo camisas", "Ropa doblada"]', 3),
('domestica', 'Compras', '🛒', 'detail', NULL, 4),
('domestica', 'Falta producto', '⚠️', 'detail', NULL, 5),
('domestica', 'Observación', '📝', 'detail', NULL, 6);

-- ===============================================================
--  5. PREGUNTAS DE EVALUACIÓN (30 preguntas: 10 por categoría)
-- ===============================================================

-- === NIÑERA ===
insert into public.preguntas_evaluacion (categoria, pregunta, opciones, respuesta_correcta, es_critica) values
('ninera', 'Un niño de 2 años se mete un objeto pequeño en la boca. ¿Qué hacés primero?',
 '["Darle agua para que trague", "Intentar sacarlo con los dedos", "Ponerlo boca abajo y dar palmadas firmes entre los omóplatos", "Esperar a que lo escupa solo"]',
 2, true),
('ninera', '¿A qué temperatura se considera fiebre en un niño?',
 '["35°C", "36.5°C", "37°C", "38°C o más"]',
 3, false),
('ninera', '¿Cuál es la forma correcta de calentar un biberón?',
 '["En el microondas", "A baño maría o con calientabiberones", "Directamente al fuego", "No importa el método"]',
 1, false),
('ninera', 'Un niño de 4 años se cae y se golpea la cabeza. No pierde el conocimiento pero llora mucho. ¿Qué hacés?',
 '["Lo acuesto a dormir", "Aplico hielo envuelto en tela y observo síntomas durante 24hs", "Le doy un analgésico inmediatamente", "Solo lo consuelo y sigo con la actividad"]',
 1, true),
('ninera', '¿Cuántas horas de sueño necesita un niño de 3 años aproximadamente?',
 '["6-8 horas", "8-10 horas", "10-13 horas", "14-17 horas"]',
 2, false),
('ninera', '¿Qué alimentos NO se deben dar a un niño menor de 1 año?',
 '["Banana y palta", "Miel, frutos secos enteros y leche de vaca", "Zapallo y zanahoria", "Pan y galletitas"]',
 1, true),
('ninera', 'Estás en una plaza con un niño de 5 años. Un desconocido se acerca y le ofrece un caramelo. ¿Qué hacés?',
 '["Dejo que lo acepte si el niño quiere", "Intervengo, rechazo amablemente y me alejo con el niño", "Le pido al desconocido que se vaya", "No hago nada porque es una plaza pública"]',
 1, true),
('ninera', '¿Cada cuánto tiempo hay que cambiar el pañal de un bebé?',
 '["Cada 6 horas", "Solo cuando llora", "Cada 2-3 horas o cuando esté sucio", "Una vez por turno"]',
 2, false),
('ninera', '¿Qué hacés si un niño tiene una reacción alérgica con hinchazón en la cara?',
 '["Le doy agua y espero", "Llamo al SAME/emergencias inmediatamente", "Le doy un antihistamínico sin consultar", "Lo acuesto y espero que pase"]',
 1, true),
('ninera', '¿Cuál es la mejor forma de poner límites a un niño de 3 años?',
 '["Gritar para que entienda", "Ignorar la conducta siempre", "Explicar con calma, ser firme y consistente", "Castigar físicamente"]',
 2, false);

-- === ADULTO MAYOR ===
insert into public.preguntas_evaluacion (categoria, pregunta, opciones, respuesta_correcta, es_critica) values
('adulto_mayor', 'Una persona mayor se cae al piso. ¿Qué hacés primero?',
 '["La levanto rápidamente", "Verifico si está consciente y si tiene dolor antes de moverla", "La dejo en el piso y llamo a emergencias", "Le doy agua"]',
 1, true),
('adulto_mayor', '¿Podés administrar medicamentos a la persona que cuidás?',
 '["Sí, si me lo pide", "Sí, si son de venta libre", "No, solo puedo recordarle que los tome según la indicación médica", "Sí, si la familia me autoriza"]',
 2, true),
('adulto_mayor', 'La persona que cuidás se desorienta y no reconoce dónde está. ¿Qué hacés?',
 '["Le digo que está equivocada y la corrijo", "Mantengo la calma, le hablo suave y la ubico con referencias conocidas", "La ignoro hasta que se le pase", "Llamo a emergencias"]',
 1, false),
('adulto_mayor', '¿Cuál es un signo de alerta de un ACV (accidente cerebrovascular)?',
 '["Dolor de estómago", "Dificultad para hablar, debilidad en un lado del cuerpo", "Fiebre alta", "Dolor de rodilla"]',
 1, true),
('adulto_mayor', '¿Cómo ayudás a prevenir caídas en el hogar?',
 '["Pongo alfombras en todos lados para amortiguar", "Aseguro buena iluminación, quito obstáculos y uso alfombras antideslizantes", "Dejo que se mueva solo para que haga ejercicio", "Solo la acompaño al baño"]',
 1, false),
('adulto_mayor', '¿Qué hacés si la persona se atraganta con comida?',
 '["Le doy agua", "Aplico la maniobra de Heimlich (compresiones abdominales)", "Le doy palmadas en la espalda suavemente", "Espero a que tosa y lo resuelva"]',
 1, true),
('adulto_mayor', 'La persona tiene diabetes. ¿Qué signo indica hipoglucemia (azúcar baja)?',
 '["Sed excesiva", "Temblores, sudoración, confusión", "Dolor de cabeza leve", "Sueño profundo"]',
 1, true),
('adulto_mayor', '¿Es correcto dejar sola a una persona con deterioro cognitivo mientras salís a hacer compras?',
 '["Sí, si dejo la puerta con llave", "Sí, si es solo un rato", "No, nunca debe quedarse sola sin supervisión", "Depende de su humor ese día"]',
 2, true),
('adulto_mayor', '¿Cómo debés comunicarte con una persona con pérdida auditiva?',
 '["Gritarle desde lejos", "Hablarle de frente, claro, a ritmo pausado y con buena luz", "Escribirle todo en papel", "Hablar normalmente, si no escucha no es mi problema"]',
 1, false),
('adulto_mayor', '¿Qué actividades recreativas son beneficiosas para adultos mayores?',
 '["Solo ver televisión", "Juegos de mesa, lectura, caminatas cortas, música", "Actividad física intensa", "Ninguna, deben descansar"]',
 1, false);

-- === LIMPIEZA ===
insert into public.preguntas_evaluacion (categoria, pregunta, opciones, respuesta_correcta, es_critica) values
('limpieza', '¿Se pueden mezclar lavandina con detergente o amoníaco?',
 '["Sí, limpia mejor", "Sí, pero solo con agua caliente", "No, genera gases tóxicos peligrosos", "Solo si es poca cantidad"]',
 2, true),
('limpieza', '¿Qué producto usás para limpiar una mesada de mármol?',
 '["Lavandina pura", "Vinagre", "Jabón neutro con agua", "Ácido muriático"]',
 2, false),
('limpieza', '¿Cómo se lava correctamente una prenda que dice "lavar a mano"?',
 '["En el lavarropas en ciclo suave", "A mano con agua fría o tibia y jabón neutro", "Con agua caliente y lavandina", "No importa, todas las prendas se lavan igual"]',
 1, false),
('limpieza', 'Encontrás un producto de limpieza sin etiqueta debajo de la mesada. ¿Qué hacés?',
 '["Lo uso para limpiar el piso", "Lo huelo para identificarlo", "No lo uso y aviso a la familia", "Lo tiro a la basura"]',
 2, true),
('limpieza', '¿Cuál es el orden correcto para limpiar una habitación?',
 '["Piso, muebles, techo", "De arriba a abajo: techo/lámparas, muebles, piso", "Todo al mismo tiempo", "No hay orden, depende del día"]',
 1, false),
('limpieza', '¿Cómo guardás productos de limpieza si hay niños en la casa?',
 '["Debajo de la mesada", "En un lugar alto o con traba de seguridad, fuera del alcance", "En cualquier lugar cerrado", "En la heladera"]',
 1, true),
('limpieza', '¿Qué hacés si se te cae lavandina en una prenda de color?',
 '["La enjuago rápidamente con agua fría", "Nada, ya se arruinó", "Le pongo más lavandina para emparejar", "La meto en agua caliente"]',
 0, false),
('limpieza', '¿Cada cuánto hay que limpiar el filtro del lavarropas?',
 '["Nunca", "Una vez al mes", "Una vez al año", "Solo cuando falla"]',
 1, false),
('limpieza', '¿Con qué se limpia una tabla de madera para cortar alimentos?',
 '["Solo agua", "Agua, jabón y se puede desinfectar con limón o vinagre", "Lavandina concentrada", "No se limpia, se cambia"]',
 1, false),
('limpieza', '¿Qué hacés si al llegar a trabajar notás que hay una pérdida de gas?',
 '["Prendo la luz para ver mejor", "Abro todas las ventanas, no toco interruptores y aviso al propietario/emergencias", "Cierro las ventanas para que no entre más", "Sigo trabajando normalmente"]',
 1, true);

-- ============================================================
--  FIN DEL SEED DE PRODUCCIÓN
-- ============================================================
