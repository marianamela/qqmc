# Cuidy — Pendientes y Checklist de Producción

## Pendientes inmediatos

### 1. Token temporal de WhatsApp (URGENTE - cada 24hs)
- El token de Meta Cloud API expira cada ~24 horas
- Para regenerar: developers.facebook.com → app "Cuidy" → WhatsApp → API Setup → Generate token
- Actualizar `WA_TOKEN` en `.env` local y en Netlify (si ya está deployado)
- **Solución definitiva**: crear un System User con token permanente (ver sección de producción)

### 2. Google OAuth (pendiente)
- Habilitar provider Google en Supabase → Authentication → Providers
- Crear credenciales OAuth en Google Cloud Console (console.cloud.google.com)
- Agregar `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en Supabase
- Configurar redirect URI: `https://uvndeeabgjkjkwxbfdsmi.supabase.co/auth/v1/callback`
- Sin esto, el login con Google da error "Unsupported provider"

### 3. Deploy a producción
- Hacer push de todos los cambios actuales a Git
- Configurar variables de entorno en Netlify (WA_PHONE_ID, WA_TOKEN)
- Verificar que todas las funciones corren correctamente en Netlify

---

## Checklist de Producción (cuando haya usuarios reales)

### WhatsApp Business API

| Tarea | Estado | Detalle |
|-------|--------|---------|
| Verificar negocio en Meta | ❌ Pendiente | Subir constancia de CUIT/monotributo + verificar dominio |
| Registrar número propio | ❌ Pendiente | Agregar número real de Cuidy (no el de prueba +1 555...) |
| Token permanente | ❌ Pendiente | Meta Business Settings → System Users → generar token permanente |
| Templates de mensajes | ❌ Pendiente | Crear y aprobar templates para notificaciones fuera de ventana 24h |
| Perfil de WhatsApp Business | ❌ Pendiente | Configurar nombre "Cuidy", logo, descripción, dirección |
| Migrar app a Business Portfolio | ❌ Pendiente | Transferir app desde cuenta personal a cuenta de negocio "Cuidy" |

### Templates necesarios para producción
Actualmente usamos mensajes de texto libre (funcionan solo dentro de ventana de 24h).
Para producción, crear estos templates en Meta Business Suite → WhatsApp Manager:

1. **cuidy_otp** (categoría: Authentication) — Código de verificación
2. **cuidy_nueva_solicitud** (categoría: Utility) — Aviso al cuidador de nueva solicitud
3. **cuidy_solicitud_aceptada** (categoría: Utility) — Aviso a familia de aceptación
4. **cuidy_solicitud_rechazada** (categoría: Utility) — Aviso a familia de rechazo
5. **cuidy_completar_perfil** (categoría: Utility) — Invitación a completar perfil
6. **cuidy_entrevista** (categoría: Utility) — Confirmación de entrevista
7. **cuidy_entrevista_reminder** (categoría: Utility) — Recordatorio 1h antes

### Dominio y DNS

| Tarea | Estado | Detalle |
|-------|--------|---------|
| Registrar dominio cuidy.com.ar | ❌ Pendiente | Necesario para verificación de Meta |
| Configurar DNS en Netlify | ❌ Pendiente | Apuntar dominio al site de Netlify |
| SSL/HTTPS | ✅ Automático | Netlify lo provee gratis |
| Verificar dominio en Meta | ❌ Pendiente | Agregar meta-tag o registro DNS |

### Supabase

| Tarea | Estado | Detalle |
|-------|--------|---------|
| Habilitar Google OAuth | ❌ Pendiente | Provider + credenciales en Google Cloud Console |
| RLS en tablas sensibles | ⚠️ Revisar | otp_codes está sin RLS (OK porque solo accede backend) |
| Backups automáticos | ❌ Pendiente | Habilitar en plan Pro si hay datos críticos |
| Limpieza de OTPs expirados | ❌ Pendiente | pg_cron o tarea manual periódica |
| Correr migración 009_baja_cuenta.sql | ❌ Pendiente | Agrega columnas `baja_solicitada_at` y `estado_previo_baja` a familias y cuidadores |
| Correr migración antifraude-recomendaciones.sql | ✅ Hecho | Columnas de anti-fraude en `invitaciones` |
| Correr migración sumate-cuidador.sql | ✅ Hecho | Tablas `solicitudes_recomendacion` y `lista_espera_cuidadores` |

### Netlify

| Tarea | Estado | Detalle |
|-------|--------|---------|
| Variables de entorno | ❌ Pendiente | Copiar todas las vars del .env a Netlify |
| Dominio custom | ❌ Pendiente | Configurar cuidy.com.ar |
| Formularios/funciones | ✅ Configurado | Ya funciona con Netlify Functions |

### Cron: Follow-up de solicitudes de recomendación sin respuesta

Cuando un cuidador pide que una familia lo recomiende (Camino A) y la familia no responde después de 5 días, hay que notificar al cuidador ofreciéndole la opción de registrarse por lista de espera (Camino B). El endpoint ya existe: `POST /recomendaciones/followup`. Actualmente se puede ejecutar manualmente desde Admin → Operaciones.

**Automatización pendiente:** crear una Netlify Scheduled Function similar a la de purga de bajas:

```javascript
// netlify/functions/followup-recomendaciones-scheduled.js
const { schedule } = require('@netlify/functions');

module.exports.handler = schedule('0 10 * * *', async (event) => {
  const SITE_URL = process.env.SITE_URL || 'https://cuidy-ar.netlify.app';
  const res = await fetch(`${SITE_URL}/.netlify/functions/api/recomendaciones/followup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  console.log('[followup-scheduled]', data);
});
```

Corre todos los días a las 10:00 AM UTC (7:00 AM Argentina).

### Purga automática de cuentas dadas de baja

Cuando un usuario solicita la baja, su cuenta queda en estado `baja_solicitada` durante 30 días (puede reactivarla). Pasados los 30 días, hay que purgar los datos definitivamente. El endpoint ya existe: `POST /admin/purgar-bajas`.

**Opción A — Netlify Scheduled Functions (recomendada)**

Crear un archivo `netlify/functions/purgar-bajas-scheduled.js`:

```javascript
// Corre automáticamente todos los días a las 3:00 AM UTC
const { schedule } = require('@netlify/functions');

module.exports.handler = schedule('0 3 * * *', async (event) => {
  const SITE_URL = process.env.SITE_URL || 'https://cuidy-ar.netlify.app';
  const res = await fetch(`${SITE_URL}/.netlify/functions/api/admin/purgar-bajas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(process.env.ADMIN_USER + ':' + process.env.ADMIN_PASSWORD).toString('base64')}`
    }
  });
  const data = await res.json();
  console.log('[purga-scheduled]', data);
});
```

Requiere instalar `@netlify/functions` (`npm install @netlify/functions`).

**Opción B — Cron externo (alternativa gratuita)**

Usar un servicio como cron-job.org o EasyCron para llamar al endpoint diariamente:
- URL: `https://cuidy-ar.netlify.app/.netlify/functions/api/admin/purgar-bajas`
- Método: POST
- Header: `Authorization: Basic <credenciales admin en base64>`
- Frecuencia: una vez al día

### Seguridad antes de producción

| Tarea | Estado | Detalle |
|-------|--------|---------|
| Cambiar contraseña admin | ❌ Pendiente | `ADMIN_PASSWORD` actual es débil |
| Rotar SESSION_SECRET | ❌ Pendiente | Generar nuevo secret para producción |
| HTTPS everywhere | ✅ Automático | Netlify + Supabase ya usan HTTPS |
| Rate limiting en OTP | ⚠️ Básico | Tiene cooldown de 30s en frontend, falta en backend |
| Sanitizar inputs | ✅ Implementado | XSS prevention en frontend |

### Legal y protección de datos

| Tarea | Estado | Detalle |
|-------|--------|---------|
| Constituir SAS | ❌ Pendiente | Sociedad por Acciones Simplificada — necesaria para facturar y operar |
| Registrar base de datos en AAIP | ❌ Pendiente | Obligatorio por Ley 25.326 (Protección de Datos Personales) |
| Contratar dominio cuidy.com.ar | ❌ Pendiente | Necesario para emails legales (contacto@, datos@) |
| Crear email contacto@cuidy.com.ar | ❌ Pendiente | Contacto general (usado en Términos y Condiciones) |
| Crear email datos@cuidy.com.ar | ❌ Pendiente | Para ejercicio de derechos ARCO (usado en Política de Privacidad) |
| Revisión legal de T&C y Privacidad | ❌ Pendiente | Hacer revisar terminos.html y privacidad.html por un abogado |
| Actualizar docs con datos SAS | ❌ Pendiente | Cuando se constituya, agregar razón social, CUIT y domicilio legal |

### Emails (Resend)

| Tarea | Estado | Detalle |
|-------|--------|---------|
| Dominio propio en Resend | ❌ Pendiente | Cambiar de onboarding@resend.dev a hola@cuidy.com.ar |
| Verificar dominio en Resend | ❌ Pendiente | Agregar registros DNS (SPF, DKIM) |

### MercadoPago

| Tarea | Estado | Detalle |
|-------|--------|---------|
| Cambiar a credenciales de producción | ❌ Pendiente | Actualmente en modo test/sandbox |
| Webhook URL con dominio real | ❌ Pendiente | Actualizar URL de notificaciones IPN |

---

## Variables de entorno para producción

```env
# Supabase (mismas, no cambian)
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Admin (CAMBIAR para producción)
ADMIN_USER=...
ADMIN_PASSWORD=<contraseña segura>
SESSION_SECRET=<nuevo secret generado>

# Resend (actualizar cuando tengas dominio propio)
RESEND_API_KEY=...
RESEND_FROM=Cuidy <hola@cuidy.com.ar>

# WhatsApp (actualizar con token permanente)
WA_PHONE_ID=<phone ID del número real>
WA_TOKEN=<token permanente de System User>

# Push notifications (mismas)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=...

# MercadoPago (cambiar a producción)
MP_ACCESS_TOKEN=<token de producción>

# Site URL
SITE_URL=https://cuidy.com.ar
```

---

*Última actualización: 10 de julio de 2026*
