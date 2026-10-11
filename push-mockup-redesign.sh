#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "fix: login validación + cache headers + redirect sesión

- login.html: redirige a feed si ya hay sesión activa
- _headers: Cache-Control no-cache para HTML, sw.js, auth.js
- sw.js: cache version 18
- auth.js: post-login redirige a /feed-familia.html
- feed-familia.html: banner verificación + sección Caro
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
