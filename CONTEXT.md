# Cuidy — Contexto del proyecto

## Qué es Cuidy
Plataforma que conecta familias con cuidadores de confianza verificados: niñeras, acompañantes lúdicos de adultos mayores, cocineros y empleadas domésticas. Campaña de lanzamiento: **#CuidarBien** — "Que se ponga de moda cuidar bien. Porque cuidar bien merece más oportunidades."

## Marca
- Nombre: Cuidy (antes QQMC)
- Paleta: teal #006D77, coral #FF6B6B, noche #1F2933, marfil #F8F7F3
- Fuentes: Montserrat (títulos) + Inter (UI/body)
- Logo: isotipo libre (arco teal + círculo coral) + wordmark vectorizado en `client/assets/logo.svg`
- GA4 Measurement ID: G-HL4493CBEG

## Stack
- Frontend: HTML/CSS/JS vanilla → carpeta `client/`
- Backend: Node.js con Netlify Functions → carpeta `netlify/functions/`
- Base de datos: Supabase (dos proyectos: DEV y PROD)
- Deploy: Netlify (automático desde GitHub, con variables de entorno por branch)
- Repo: https://github.com/marianamela/qqmc

## Git y deploy

### Ramas
- `dev` → rama de desarrollo. Todos los cambios se commitean acá primero.
- `main` → rama de producción. Solo recibe merges desde `dev` cuando los cambios están probados.

### URLs de Netlify
- **Producción** (main): `cuidy-ar.netlify.app` → será `cuidy.com.ar` cuando se registre el dominio
- **Preview** (dev): `dev--cuidy-ar.netlify.app` → para probar cambios antes de promover a producción

### Flujo de trabajo
1. Desarrollar en la rama `dev`
2. Probar localmente con `netlify dev` (puerto 8888)
3. Commitear y pushear a `dev`: `git add -A && git commit -m "..." && git push`
4. Verificar en `dev--cuidy-ar.netlify.app`
5. Cuando esté OK, promover a producción: `git checkout main && git merge dev && git push`
6. Verificar en `cuidy-ar.netlify.app`
7. Volver a dev para seguir trabajando: `git checkout dev`

### Service Worker (cache)
- El archivo `client/sw.js` tiene un `CACHE_VERSION` que debe incrementarse cada vez que se hacen cambios significativos en archivos estáticos (HTML, CSS, JS). Si no se incrementa, los usuarios pueden ver versiones cacheadas viejas.
- Versión actual: 6

## Estructura
- `client/` → frontend estático
- `client/admin/` → panel interno del equipo Cuidy
- `client/invita-cuidador.html` → landing campaña para cuidadores (llegan por recomendación de familia)
- `client/recomendar-cuidador.html` → landing campaña para familias (llegan por campaña de WhatsApp, pueden recomendar un cuidador)
- `client/registro-cuidador.html` → registro simplificado en 3 pasos (datos + identidad + enviar)
- `client/registro-familia.html` → registro de familias
- `client/completar-perfil.html` → segundo paso del registro de cuidador (después de aprobación de identidad)
- `client/cuidador-enviado.html` → página post-registro con timeline de 5 pasos
- `client/index.html` → home con chat asistente Caro
- `client/verificar-identidad.html` → verificación de identidad de familias (DNI + selfie)
- `client/panel-cuidador.html` → panel del cuidador logueado
- `client/reactivar.html` → reactivación de cuenta tras solicitud de baja
- `client/login.html` → login de usuarios
- `client/auth-callback.html` → callback de Google SSO
- `client/diario-cuidador.html` → diario de cuidado (vista cuidador)
- `client/diario-familia.html` → diario de cuidado (vista familia)
- `netlify/functions/api.js` → backend serverless (único entrypoint)
- `supabase/` → esquema y seeds de la base de datos
- `.env` → variables de entorno locales (no sube a GitHub)
- `netlify.toml` → configuración de Netlify

## Variables de entorno
- `SUPABASE_URL` → URL del proyecto Supabase
- `SUPABASE_ANON_KEY` → clave pública (usada por el cliente y para GETs públicos)
- `SUPABASE_SERVICE_ROLE_KEY` → clave privada (usada por el backend; bypassea RLS)
- `SESSION_SECRET` → random hex para firmar cookies (generar con `openssl rand -hex 32`)
- **Ya no se usan** `ADMIN_USER` / `ADMIN_PASSWORD` → migrado a tabla `admin_usuarios` en Supabase
- `DIDIT_API_KEY` → API key de Didit.me (business.didit.me)
- `DIDIT_WEBHOOK_SECRET` → secret para validar firma HMAC-SHA256 de webhooks de Didit
- `DIDIT_WORKFLOW_ID` → ID del workflow KYC configurado en Didit.me
- `PORT` → 3000 (local)

## Ambientes (DEV / PROD)

### Separación de bases de datos
- **DEV** (Supabase "Cuidadores"): `uyndeeabgikiwxbfdsmi.supabase.co` — datos de prueba, desarrollo
- **PROD** (Supabase nuevo): `dhmpygvjrnpndivcyejg.supabase.co` — solo datos de configuración y datos reales

### Esquema de producción
- `supabase/prod_schema.sql` → esquema consolidado (todas las tablas, índices, RLS, funciones)
- `supabase/prod_seed.sql` → datos de configuración (admin, planes, match_config, preguntas evaluación, templates diario)
- Ejecutar en orden: primero `prod_schema.sql`, luego `prod_seed.sql` en el SQL Editor del proyecto PROD

### Variables de entorno en Netlify (por branch)
Netlify permite configurar variables de entorno con alcance por deploy context. Configurar en Netlify → Site settings → Environment variables:

| Variable | Branch `dev` | Branch `main` (producción) |
|---|---|---|
| `SUPABASE_URL` | `https://uyndeeabgikiwxbfdsmi.supabase.co` | `https://dhmpygvjrnpndivcyejg.supabase.co` |
| `SUPABASE_ANON_KEY` | (key del proyecto DEV) | (key del proyecto PROD) |
| `SUPABASE_SERVICE_ROLE_KEY` | (service_role del proyecto DEV) | (service_role del proyecto PROD) |
| `SESSION_SECRET` | (compartido o separado) | (compartido o separado) |
| `DIDIT_API_KEY` | (sandbox/test) | (producción) |
| `DIDIT_WEBHOOK_SECRET` | (sandbox/test) | (producción) |
| `DIDIT_WORKFLOW_ID` | (sandbox/test) | (producción) |

**Pasos para configurar en Netlify:**
1. Ir a Site settings → Environment variables
2. Para cada variable, hacer click en "Add a variable"
3. En "Scopes", seleccionar el deploy context:
   - "Branch deploys" + branch `dev` → valor de DEV
   - "Production" → valor de PROD
4. Si una variable tiene el mismo valor para ambos, dejarla con scope "All"

### Archivo `.env` local
El archivo `.env` local apunta a DEV por defecto (para `netlify dev`). No se sube a GitHub.

## URLs
- Local: http://localhost:8888
- Producción: https://cuidy-ar.netlify.app
- Panel admin: /admin/login.html
- API local: http://localhost:8888/.netlify/functions/api
- API producción: https://cuidy-ar.netlify.app/.netlify/functions/api

## Motor de Confianza (verificación automatizada)

### Principio de diseño
"Verificar rápido, publicar rápido, enriquecer después." Solo la verificación de identidad es bloqueante. Todo lo demás (evaluación de conocimientos, antecedentes, ubicación) es opcional y otorga badges.

### Proveedor de verificación
- **Didit.me**: verificación de identidad automatizada (documento + liveness)
- Pricing: $0.33/check, 500 gratis/mes, sandbox ilimitado
- Integración: SDK embebido vía iframe en el registro
- Webhook: POST /webhooks/didit con firma HMAC-SHA256 (X-Signature-V2)
- Variables de entorno: `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_WORKFLOW_ID`

### Tablas nuevas (migración `011_motor_confianza.sql`)
- `verificaciones`: registro de cada verificación (tipo, persona_id, proveedor, session_id, estado, resultado_raw)
- `preguntas_evaluacion`: banco de preguntas por categoría (ninera, adulto_mayor, limpieza) con flag es_critica
- `evaluaciones`: intentos de quiz por cuidador (puntaje, aprobado, respuestas)

### Endpoints de verificación
- `POST /verificacion/iniciar` → crea sesión en Didit.me, devuelve URL para iframe
- `POST /webhooks/didit` → recibe resultado de Didit, actualiza estado
- `GET /verificacion/estado/:id` → consulta estado de verificación
- `GET /admin/excepciones` → lista verificaciones en estado in_review
- `PATCH /admin/excepciones/:id` → resolver excepción manualmente

### Endpoints de evaluación de conocimientos
- `POST /evaluacion/iniciar` → genera quiz de 10 preguntas aleatorias por categoría
- `POST /evaluacion/enviar` → calcula puntaje (aprobado: >=8/10 + no fallar críticas)

## Flujo de registro del cuidador (dos fases)

### Fase 1 — Registro optimizado (`registro-cuidador.html`)
1. Paso 0: Datos básicos (6 campos: nombre, apellido, email, WhatsApp+OTP, password, especialidades)
2. POST /cuidadores → fila con `estado='enviado'` y `registro_simplificado=true`
3. Paso 1: Verificación de identidad vía Didit.me embebido (~90 seg)
4. Paso 2: Confirmación y envío
5. Redirige a `cuidador-enviado.html` con timeline de progreso
6. DNI y fecha_nacimiento son extraídos automáticamente por Didit (no los ingresa el usuario)

### Fase 2 — Completar perfil (`completar-perfil.html`)
1. Webhook de Didit aprueba identidad → `estado='identidad_aprobada'`
2. Se envía notificación al cuidador con link a completar-perfil.html
3. El cuidador completa: experiencia, disponibilidad, ubicación, referencias, descripción
4. PATCH /cuidadores/:id → `estado='perfil_completo'`
5. Tu perfil se publica y empezás a recibir contactos de familias

### Fase 3 (opcional) — Enriquecimiento
- Evaluación de conocimientos por categoría → badge "Evaluado"
- Verificación de antecedentes → badge "Antecedentes"
- Cada badge suma visibilidad en los resultados de búsqueda

### Estados del cuidador
`enviado` → `identidad_aprobada` → `perfil_completo` → `aprobado`

Otros estados posibles: `lista_espera`, `en_revision`, `entrevista_agendada`, `rechazado`, `suspendido`, `vencido`, `baja_solicitada`, `correcciones_pedidas`

## Flujo de registro de la familia
### Fase 1 — Registro rápido (`registro-familia.html`)
1. Datos básicos: nombre, apellido, email, teléfono
2. POST /familias → fila con `estado='pendiente'`
3. La familia puede loguearse, buscar cuidadores y navegar perfiles, pero NO puede contactar cuidadores

### Fase 2 — Verificación de identidad (`verificar-identidad.html`)
1. La familia accede voluntariamente desde el banner de verificación o el menú
2. Sube foto de DNI + selfie
3. PATCH /familias/:id → `estado='pendiente_verificacion'`
4. El equipo revisa desde `/admin/familias.html` y aprueba o rechaza
5. Si aprueba → `estado='aprobada'` → la familia puede contactar cuidadores
6. Si rechaza → `estado='rechazada'` + motivo

### Estados de la familia
`pendiente` → `pendiente_verificacion` → `aprobada`

| Estado | Significado | Puede buscar | Puede contactar |
|--------|-------------|:---:|:---:|
| `pendiente` | Cuenta creada, identidad no verificada | Sí | No |
| `pendiente_verificacion` | Envió DNI/selfie, esperando revisión del equipo | Sí | No |
| `aprobada` | Identidad verificada | Sí | Sí |
| `rechazada` | Verificación rechazada (con motivo) | Sí | No |
| `baja_solicitada` | Pidió eliminar cuenta (30 días de gracia) | No | No |

### Acciones del admin sobre familias
- **Sin verificar** (`pendiente`): puede enviar recordatorio por WhatsApp con link a verificar-identidad.html
- **En revisión** (`pendiente_verificacion`): puede aprobar o rechazar la identidad (revisa DNI + selfie)
- **Aprobada/Rechazada**: sin acciones adicionales

## Sistema de match (confirmación mutua)

### Flujo
1. La familia busca cuidadores y ve perfiles (gratis)
2. Toca **"Me interesa"** en un perfil (gratis, sin pago)
3. El cuidador recibe notificación (push + WhatsApp) con datos básicos: zona, tipo de servicio, horarios. Sin datos personales de la familia
4. El cuidador **acepta** o **rechaza**
5. Si acepta → **match**. La familia recibe notificación
6. La familia **paga** para desbloquear los datos de contacto del cuidador
7. Ambos se conectan por WhatsApp

### Reglas
- Máximo 3 matches simultáneos por familia (configurable en `match_config`)
- El match vence a las 48 horas si la familia no paga (configurable)
- Si el cuidador no responde en 48hs, el interés también vence
- La familia puede descartar un match antes de pagar

### Estados del match
`pendiente_cuidador` → `match` → `desbloqueado`

Otros estados: `rechazado`, `vencido`, `descartado`

### Endpoints
- `POST /matches/interes` → familia expresa interés (gratis)
- `GET /matches?familia_id=...` o `?cuidador_id=...` → listar matches
- `PATCH /matches/:id` → cuidador acepta/rechaza (body: `{accion: "aceptar"|"rechazar"}`)
- `POST /matches/:id/desbloquear` → familia paga para desbloquear contacto
- `POST /matches/expirar` → cron para vencer matches pasados de 48hs

### Tabla `matches`
- `familia_id`, `cuidador_id`, `estado` (enum `estado_match`)
- Datos anónimos para el cuidador: `familia_zona`, `familia_servicio`, `familia_horarios`, `familia_detalle`
- Timestamps: `match_at`, `vence_at`, `desbloqueado_at`
- Configuración en tabla `match_config` (key/value)

### Migración
- SQL: `supabase/migrations/010_matches.sql`
- SQL: `supabase/migrations/011_motor_confianza.sql` (verificaciones, preguntas, evaluaciones + nuevos estados)
- SQL consolidado PROD: `supabase/prod_schema.sql` + `supabase/prod_seed.sql`
- Ejecutar en Supabase SQL Editor antes de deployar

## Funcionalidades principales
- **Chat asistente Caro**: búsqueda guiada de cuidadores por tipo, zona, disponibilidad
- **Motor de Confianza**: verificación de identidad automatizada vía Didit.me + evaluación de conocimientos opcional + badges de perfil
- **Sistema de referidos**: códigos únicos, tracking de invitaciones entre familias y cuidadores
- **Diario de cuidado**: registro diario con fotos/notas del cuidador, timeline para familias
- **Matches**: familias expresan interés → cuidador acepta/rechaza → familia paga para desbloquear contacto
- **Solicitudes de contacto** (legacy): familias piden contacto directo, cuidadores aceptan/rechazan
- **Suscripciones**: MercadoPago Checkout Pro, paywall para desbloqueo de contacto post-match
- **PWA**: manifest.json, service worker, notificaciones push
- **Baja de cuenta**: familia o cuidador solicita baja → 30 días de gracia → purga automática. Endpoint de reactivación dentro del plazo.
- **Panel admin**: gestión de cuidadores y familias (estados, verificación de identidad, recordatorios, aprobaciones)
- **Usuarios admin en DB**: tabla `admin_usuarios` con roles `superadmin` y `admin`, passwords hasheados con scrypt. Superadmin puede crear/editar/desactivar usuarios admin via endpoints `/admin/usuarios`
- **GA4**: tracking de eventos de conversión personalizados
- **UTM tracking**: captura de origen y campaña en sessionStorage

## Mensaje y campaña
- Mensaje central: "Volvé a confiar" — la primera plataforma donde cuidadores y familias se verifican mutuamente
- Diferenciales clave: verificación bilateral, match con consentimiento mutuo, evaluación de conocimientos, diario de cuidado
- Tono: directo, empático, sin marketing vacío. Nombrar el problema real ("buscar a ciegas", "mensajes de desconocidos") y mostrar cómo Cuidy lo resuelve
- Landing cuidadores: llegan por recomendación de una familia (`invita-cuidador.html?ref=CODIGO`)
- Landing familias: llegan por campaña de WhatsApp (`recomendar-cuidador.html?utm_source=whatsapp`)
- UTM defaults familias: source=whatsapp, medium=campaign, campaign=lanzamiento_familias
