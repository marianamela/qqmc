#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "feat: verificación de identidad Didit post-registro

- sumate-cuidador.html: después de crear cuenta, muestra paso de
  verificación Didit.me embebido. Si aprueba → ingresa a la plataforma.
  Si no aprueba → mensaje de revisión pendiente por equipo Cuidy.
  Eliminado botón redundante del cierre.
- sw.js: cache version 11
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
