#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "fix: feed vacío + perfil bloqueado + botón desbloquear inactivo

- feed-familia.html: fix claves API (stats.stats, feed.feed, data.cuidadores)
- feed-familia.html: fix esc() SyntaxError comillas HTML
- feed-familia.html: renderFeed adaptado a estructura real (recomendaciones + conexiones)
- perfil-cuidador.html: separar acceso ficha vs contacto directo
- perfil-cuidador.html: ficha completa visible si familia activa o cuidador en red
- perfil-cuidador.html: solo contacto directo (tel/email) requiere desbloqueo
- perfil-cuidador.html: fix botón Desbloquear no clickeable (pointer-events:none del CSS global)
- perfil-cuidador.html: nueva clase perfil-contact-cta sin blur para estado fichaCompleta
- perfil-cuidador.html: estado sin acceso usa overlay pattern correcto
- api.js: aceptar estado 'activa' además de 'aprobada' para acceso a fichas
- sw.js: cache version 22
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
