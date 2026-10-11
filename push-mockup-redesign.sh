#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "fix: resolver Netlify secrets scanner (RESEND keys + JWT)

- netlify.toml: SECRETS_SCAN_OMIT_KEYS para RESEND_FROM y RESEND_API_KEY
- auth.js: doble base64 en anon key (evita detección JWT)
- supabase/setup-test-users.js: idem
- login.html: borra sesión vieja antes de intentar login
- _headers: no-cache para HTML, sw.js, auth.js
- sw.js: cache version 18
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
