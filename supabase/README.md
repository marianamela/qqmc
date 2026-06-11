# Supabase — Setup

## 1. Aplicar el esquema de base de datos

1. Abrí el panel de Supabase → [SQL Editor](https://supabase.com/dashboard/project/_/sql)
2. **New query** → pegá el contenido completo de `schema.sql`
3. **Run** (Cmd/Ctrl + Enter)

Se crean las tablas: `cuidadores`, `cuidador_documentos`, `cuidador_referencias`, `cuidador_eventos`, `cuidador_notas`, `familias`, más los enums y la política pública de lectura (solo cuidadores aprobados son visibles para la ANON key).

El SQL es idempotente — podés correrlo las veces que quieras.

## 2. Crear bucket de Storage (para documentos en el futuro)

Panel de Supabase → **Storage** → **New bucket**

- Nombre: `cuidadores-docs`
- Public: **NO** (privado)

Por ahora solo guardamos metadata; la subida real de archivos se va a hacer en una próxima etapa.

## 3. Obtener las claves necesarias

Panel de Supabase → **Project Settings** → **API**

Vas a necesitar:

| Variable | De dónde sale | Notas |
|----------|---------------|-------|
| `SUPABASE_URL` | Project URL | Ya la tenés |
| `SUPABASE_ANON_KEY` | Project API Keys → anon public | Ya la tenés |
| `SUPABASE_SERVICE_ROLE_KEY` | Project API Keys → service_role | **Secreta, nunca exponer al cliente** |

## 4. Configurar variables de entorno

### Local (`.env` de tu proyecto)

Agregá estas líneas al `.env`:

```
SUPABASE_SERVICE_ROLE_KEY=<pegar-la-clave-service-role>
ADMIN_USER=<usuario-admin>
ADMIN_PASSWORD=<contraseña-admin-fuerte>
SESSION_SECRET=<string-random-largo-para-firmar-cookies>
```

Para generar un `SESSION_SECRET` random podés usar en terminal:

```bash
openssl rand -hex 32
```

### En Netlify (para producción)

Site settings → **Environment variables** → Add variable (mismas claves que arriba).

## 5. Seed opcional (cargar cuidadores de prueba)

Si querés ver el backoffice con datos, podés cargar los 10 cuidadores mock directamente desde el SQL Editor ejecutando `seed.sql` (ver abajo).

---

## Estados del flujo de candidatura

```
borrador → enviado → en_revision ─┬─→ correcciones_pedidas ─→ en_revision
                                  ├─→ entrevista_agendada ─→ aprobado
                                  └─→ rechazado

aprobado ─→ suspendido  (acción manual del equipo)
aprobado ─→ vencido     (automático cuando vencen antecedentes)
```
