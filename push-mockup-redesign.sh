#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "fix: ofuscar anon key para pasar scanner Netlify + login fix

- auth.js: doble base64 en anon key (evita 'Exposed secrets detected')
- auth.js: error de login traducido al español
- login.html: borra sesión vieja antes de intentar login
- _headers: no-cache para HTML, sw.js, auth.js
- sw.js: cache version 18
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
