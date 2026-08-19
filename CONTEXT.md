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
- Base de datos: Supabase
- Deploy: Netlify (automático desde GitHub)
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
- Versión actual: 3

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
- `PORT` → 3000 (local)

## URLs
- Local: http://localhost:8888
- Producción: https://cuidy-ar.netlify.app
- Panel admin: /admin/login.html
- API local: http://localhost:8888/.netlify/functions/api
- API producción: https://cuidy-ar.netlify.app/.netlify/functions/api

## Flujo de registro del cuidador (dos fases)
### Fase 1 — Registro simplificado (`registro-cuidador.html`)
1. Paso 0: Datos personales (nombre, DNI, email, teléfono, password, ubicación, especialidades)
2. Paso 1: Verificación de identidad (foto DNI frente + selfie sosteniendo DNI)
3. Paso 2: Confirmación y envío
4. POST /cuidadores → fila con `estado='enviado'` y `registro_simplificado=true`
5. Redirige a `cuidador-enviado.html` con timeline de progreso

### Fase 2 — Completar perfil (`completar-perfil.html`)
1. El equipo revisa identidad desde `/admin` y aprueba → `estado='identidad_aprobada'`
2. Se envía email al cuidador con link a completar-perfil.html
3. El cuidador completa: experiencia, disponibilidad, referencias, descripción
4. PATCH /cuidadores/:id → `estado='perfil_completo'`
5. Se agenda entrevista virtual → `estado='entrevista_agendada'`
6. Si aprueba → `estado='aprobado'` → perfil visible públicamente

### Estados del cuidador
`enviado` → `identidad_aprobada` → `perfil_completo` → `en_revision` → `entrevista_agendada` → `aprobado`

Otros estados posibles: `lista_espera`, `rechazado`, `suspendido`, `vencido`, `baja_solicitada`, `correcciones_pedidas`

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

## Funcionalidades principales
- **Chat asistente Caro**: búsqueda guiada de cuidadores por tipo, zona, disponibilidad
- **Verificación de identidad**: DNI + selfie para cuidadores y familias
- **Sistema de referidos**: códigos únicos, tracking de invitaciones entre familias y cuidadores
- **Diario de cuidado**: registro diario con fotos/notas del cuidador, timeline para familias
- **Solicitudes de contacto**: familias piden contacto, cuidadores aceptan/rechazan
- **Suscripciones**: MercadoPago Checkout Pro, paywall para contacto
- **PWA**: manifest.json, service worker, notificaciones push
- **Baja de cuenta**: familia o cuidador solicita baja → 30 días de gracia → purga automática. Endpoint de reactivación dentro del plazo.
- **Panel admin**: gestión de cuidadores y familias (estados, verificación de identidad, recordatorios, aprobaciones)
- **Usuarios admin en DB**: tabla `admin_usuarios` con roles `superadmin` y `admin`, passwords hasheados con scrypt. Superadmin puede crear/editar/desactivar usuarios admin via endpoints `/admin/usuarios`
- **GA4**: tracking de eventos de conversión personalizados
- **UTM tracking**: captura de origen y campaña en sessionStorage

## Campaña de lanzamiento
- Lema: "Que se ponga de moda cuidar bien. Porque cuidar bien merece más oportunidades."
- Hashtag: #CuidarBien
- Landing cuidadores: llegan por recomendación de una familia (`invita-cuidador.html?ref=CODIGO`)
- Landing familias: llegan por campaña de WhatsApp (`recomendar-cuidador.html?utm_source=whatsapp`)
- UTM defaults familias: source=whatsapp, medium=campaign, campaign=lanzamiento_familias
