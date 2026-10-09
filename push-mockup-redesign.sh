#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "fix: iconos SVG en landing + sección sin recomendación en sumate-cuidador

- index.html: reemplazar emojis por iconos SVG Lucide, alineación consistente,
  avatar Caro restaurado.
- sumate-cuidador.html: nueva sección explicativa para cuidadores sin
  recomendación — cómo funciona el sistema de estrellas (capacitaciones,
  recomendaciones, documentación, verificación) y cuándo la plataforma
  sugiere su perfil (4+ estrellas). Nota del formulario actualizada.
- sw.js: cache version 14
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
