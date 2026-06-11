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
- Deploy: Netlify (automático desde rama `main`)
- Repo: https://github.com/marianamela/qqmc

## Reglas de desarrollo
- Todo el desarrollo va en la rama `dev`
- Las pruebas se corren en localhost con `netlify dev` (puerto 8888)
- Solo se pushea a `main` cuando se indica explícitamente
- Para publicar a producción: merge de `dev` a `main` y push

## Estructura
- `client/` → frontend estático
- `client/admin/` → panel interno del equipo Cuidy
- `client/invita-cuidador.html` → landing campaña para cuidadores (llegan por recomendación de familia)
- `client/invita-familia.html` → landing campaña para familias (llegan por campaña de WhatsApp)
- `client/registro-cuidador.html` → registro simplificado en 3 pasos (datos + identidad + enviar)
- `client/registro-familia.html` → registro de familias
- `client/completar-perfil.html` → segundo paso del registro de cuidador (después de aprobación de identidad)
- `client/cuidador-enviado.html` → página post-registro con timeline de 5 pasos
- `client/index.html` → home con chat asistente Caro
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
- `ADMIN_USER` / `ADMIN_PASSWORD` → credenciales del panel interno
- `SESSION_SECRET` → random hex para firmar cookies (generar con `openssl rand -hex 32`)
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

## Funcionalidades principales
- **Chat asistente Caro**: búsqueda guiada de cuidadores por tipo, zona, disponibilidad
- **Verificación de identidad**: DNI + selfie para cuidadores y familias
- **Sistema de referidos**: códigos únicos, tracking de invitaciones entre familias y cuidadores
- **Diario de cuidado**: registro diario con fotos/notas del cuidador, timeline para familias
- **Solicitudes de contacto**: familias piden contacto, cuidadores aceptan/rechazan
- **Suscripciones**: MercadoPago Checkout Pro, paywall para contacto
- **PWA**: manifest.json, service worker, notificaciones push
- **Panel admin**: gestión de cuidadores, estados, eventos, aprobaciones
- **GA4**: tracking de eventos de conversión personalizados
- **UTM tracking**: captura de origen y campaña en sessionStorage

## Campaña de lanzamiento
- Lema: "Que se ponga de moda cuidar bien. Porque cuidar bien merece más oportunidades."
- Hashtag: #CuidarBien
- Landing cuidadores: llegan por recomendación de una familia (`invita-cuidador.html?ref=CODIGO`)
- Landing familias: llegan por campaña de WhatsApp (`invita-familia.html?utm_source=whatsapp`)
- UTM defaults familias: source=whatsapp, medium=campaign, campaign=lanzamiento_familias
