# QQMC — Contexto del proyecto

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
- `netlify/functions/api.js` → backend serverless
- `server/index.js` → servidor local de referencia
- `.env` → variables de entorno locales (no sube a GitHub)
- `netlify.toml` → configuración de Netlify

## Variables de entorno
- `SUPABASE_URL` → URL del proyecto Supabase
- `SUPABASE_ANON_KEY` → clave pública de Supabase
- `PORT` → 3000 (local)

## URLs
- Local: http://localhost:8888
- Producción: https://qqmc.netlify.app
- API local: http://localhost:8888/.netlify/functions/api
- API producción: https://qqmc.netlify.app/.netlify/functions/api