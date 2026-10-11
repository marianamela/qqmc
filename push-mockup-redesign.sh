#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "fix: feed vacío — mismatch claves API vs frontend

- feed-familia.html: usar stats.stats en vez de stats.data
- feed-familia.html: usar feed.feed en vez de feed.data
- feed-familia.html: usar data.cuidadores en vez de data.data
- feed-familia.html: usar data.verificacion en vez de data.data
- feed-familia.html: usar data.codigo en vez de data.data.codigo
- feed-familia.html: fix esc() comillas HTML (SyntaxError)
- feed-familia.html: renderFeed adaptado a estructura real de API
- sw.js: cache version 20
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
