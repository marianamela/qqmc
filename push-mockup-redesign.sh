#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "feat: feed-familia.html rediseñado al mockup F01/F02

- Navbar: reemplaza topbar viejo por m-navbar (logo + avatar)
- Layout: usa m-page-content con padding correcto
- Stats card: teal gradient con 'Tu red' label (mockup F02)
- Feed: novedades con m-card y avatares circulares
- Cuidadores destacados: nueva sección con trust-chain
- Invitar familias: botón prominente en ambos estados
- User dropdown: floating panel en lugar de topbar dropdown
- sw.js: cache version 16
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
