#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "fix: login redirige a feed + verificación y Caro en feed

- auth.js: post-login redirige a /feed-familia.html (no a /)
- feed-familia.html: banner verificación de identidad (si no verificó)
- feed-familia.html: sección Caro asistente (cuando hay cuidadores)
- sw.js: cache version 17
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
