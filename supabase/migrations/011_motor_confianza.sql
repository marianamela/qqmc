-- ============================================================
--  011 · Motor de Confianza
--  Tablas para verificación automatizada (Didit.me),
--  evaluación de conocimientos y badges de perfil.
-- ============================================================

-- ---------------------------------------------------------------
--  VERIFICACIONES (identidad automatizada vía Didit.me)
-- ---------------------------------------------------------------
create table if not exists public.verificaciones (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A quién pertenece
  tipo text not null check (tipo in ('cuidador', 'familia')),
  persona_id uuid not null,

  -- Proveedor
  proveedor text not null default 'didit' check (proveedor in ('didit', 'manual')),
  session_id text,                -- ID de sesión de Didit.me

  -- Estado
  estado text not null default 'not_started' check (estado in (
    'not_started', 'in_progress', 'approved', 'declined', 'in_review', 'expired'
  )),

  -- Resultado
  resultado_raw jsonb,            -- Payload completo del webhook (auditoría)
  motivo_rechazo text,            -- Motivo legible si fue declined
  event_id text,                  -- Para idempotencia de webhooks

  -- Resolución manual (solo para in_review)
  resuelto_por text,              -- Usuario admin que resolvió
  resuelto_at timestamptz,

  -- Vigencia
  vence_at timestamptz            -- Fecha de vencimiento (identidad: 12 meses)
);

create index if not exists idx_verificaciones_persona on public.verificaciones (tipo, persona_id);
create index if not exists idx_verificaciones_session on public.verificaciones (session_id) where session_id is not null;
create index if not exists idx_verificaciones_estado on public.verificaciones (estado) where estado = 'in_review';
create unique index if not exists idx_verificaciones_event on public.verificaciones (event_id) where event_id is not null;

-- Trigger updated_at (reutiliza función existente)
drop trigger if exists trg_verificaciones_touch on public.verificaciones;
create trigger trg_verificaciones_touch before update on public.verificaciones
for each row execute function public.touch_updated_at();

-- RLS: solo service_role
alter table public.verificaciones enable row level security;

-- ---------------------------------------------------------------
--  PREGUNTAS DE EVALUACIÓN (banco de preguntas por categoría)
-- ---------------------------------------------------------------
create table if not exists public.preguntas_evaluacion (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  categoria text not null check (categoria in ('ninera', 'adulto_mayor', 'limpieza')),
  pregunta text not null,
  opciones jsonb not null,          -- Array de 4 strings
  respuesta_correcta int not null check (respuesta_correcta between 0 and 3),
  es_critica boolean not null default false,
  version text not null default 'v1',
  activa boolean not null default true
);

create index if not exists idx_preguntas_cat on public.preguntas_evaluacion (categoria, activa);

alter table public.preguntas_evaluacion enable row level security;

-- ---------------------------------------------------------------
--  EVALUACIONES (intentos de quiz por cuidador)
-- ---------------------------------------------------------------
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

alter table public.evaluaciones enable row level security;

-- ---------------------------------------------------------------
--  NUEVOS ESTADOS para cuidadores
--  Agregar 'identidad_aprobada' y 'perfil_completo' al enum
-- ---------------------------------------------------------------
do $$ begin
  alter type estado_candidatura add value if not exists 'identidad_aprobada' after 'enviado';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type estado_candidatura add value if not exists 'perfil_completo' after 'identidad_aprobada';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type estado_candidatura add value if not exists 'lista_espera' after 'aprobado';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type estado_candidatura add value if not exists 'baja_solicitada' after 'lista_espera';
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------
--  HACER DNI y FECHA_NACIMIENTO opcionales en cuidadores
--  (Didit.me los extrae del documento de identidad)
-- ---------------------------------------------------------------
alter table public.cuidadores alter column dni drop not null;
alter table public.cuidadores alter column fecha_nacimiento drop not null;

-- ---------------------------------------------------------------
--  COLUMNAS NUEVAS en familias (estado y verificación)
-- ---------------------------------------------------------------
alter table public.familias add column if not exists estado text default 'pendiente';
alter table public.familias add column if not exists password_hash text;
alter table public.familias add column if not exists updated_at timestamptz default now();

-- ---------------------------------------------------------------
--  MIGRACIÓN: cuidadores existentes aprobados → verificación manual
-- ---------------------------------------------------------------
insert into public.verificaciones (tipo, persona_id, proveedor, estado, vence_at)
select
  'cuidador',
  id,
  'manual',
  'approved',
  now() + interval '12 months'
from public.cuidadores
where estado in ('aprobado', 'identidad_aprobada', 'perfil_completo', 'entrevista_agendada', 'en_revision')
  and not exists (
    select 1 from public.verificaciones v
    where v.persona_id = cuidadores.id and v.tipo = 'cuidador'
  );

-- Familias aprobadas → verificación manual
insert into public.verificaciones (tipo, persona_id, proveedor, estado, vence_at)
select
  'familia',
  id,
  'manual',
  'approved',
  now() + interval '12 months'
from public.familias
where estado = 'aprobada'
  and not exists (
    select 1 from public.verificaciones v
    where v.persona_id = familias.id and v.tipo = 'familia'
  );

-- ---------------------------------------------------------------
--  BANCO INICIAL DE PREGUNTAS (10 por categoría)
-- ---------------------------------------------------------------

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
