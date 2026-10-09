#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "feat: disponibilidad básica en registro cuidador + iconos SVG landing

- sumate-cuidador.html: agregar campos modalidad y zona de trabajo al
  registro, con validación y envío al API (modalidades[], zonas_trabajo).
- index.html: reemplazar emojis por iconos SVG Lucide, alineación consistente,
  avatar Caro restaurado.
- sumate-cuidador.html: sección explicativa para cuidadores sin
  recomendación (sistema de estrellas). Nota del formulario actualizada.
- sw.js: cache version 15
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
