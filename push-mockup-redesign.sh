#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "feat: sumate-cuidador rediseñado al lenguaje visual P01

- sumate-cuidador.html: hero teal gradient → marfil gradient P01,
  secciones value en cards con border gris y radius 12,
  botones migrados a m-btn, inputs al design system,
  cierre con isotipo + brand, footer limpio
- sw.js: cache version 9
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
