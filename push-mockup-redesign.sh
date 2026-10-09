#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "fix: landing pública — iconos SVG, alineación y armonía visual

- index.html: reemplazar todos los emojis (⭐🤝💼🔒🧠👥✅) por iconos
  SVG Lucide inline (star, users, heart, shieldCheck, search, userCheck).
  Alinear texto consistentemente en todas las secciones. Sección Caro
  usa icono SVG en vez de imagen avatar.
- sw.js: cache version 14
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
