#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "fix: landing pública — sacar asistente interactivo, agregar secciones informativas

- index.html: el asistente de búsqueda (Caro) ahora solo se muestra
  para familias logueadas (data-familia-only). Visitantes ven secciones
  informativas: por qué recomendar, conectá con familias, beneficios
  de pertenecer, y descripción de Caro sin acceso interactivo.
- app.js: agrega lógica para mostrar data-familia-only al loguearse.
- sw.js: cache version 13
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
