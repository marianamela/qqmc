#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "feat: búsqueda híbrida red + cuidadores verificados externos

- chat.js: doBusquedaRed() llama ambos endpoints en paralelo (red + general)
- chat.js: deduplicación de resultados (red tiene prioridad)
- chat.js: renderResultsInChat() muestra dos secciones separadas
- chat.js: showMapResults() muestra dos secciones en panel lateral
- chat.js: mensajes de Caro actualizados para modelo híbrido
- chat.js: resultados_ok muestra conteo por grupo (red vs verificados)
- style.css: section headers para resultados (.chat-results__section-header)
- style.css: badge .nivel-badge--verificado para cuidadores externos
- perfil-cuidador.html: badge 'Verificado por Cuidy' para cuidadores no-red
- index.html: textos landing actualizados para red no cerrada
- sumate-cuidador.html: textos actualizados para visibilidad sin red
- sw.js: cache version 23
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
