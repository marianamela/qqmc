#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "fix: login limpia sesión vieja + cache headers Netlify

- login.html: borra sesión anterior antes de intentar login
- login.html: si falla, no queda acceso viejo al feed
- _headers: no-cache para HTML, sw.js, auth.js (fuerza versión fresca)
- sw.js: cache version 18
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
