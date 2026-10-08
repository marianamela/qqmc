#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "feat: rediseño visual completo — todas las pantallas con clases del mockup

- feed-familia.html: m-tab-bar, m-stats-card, m-profile-card, m-btn, m-empty-state
- mi-red.html: m-tab-bar, m-section-label, m-card, m-profile-card, m-badge, m-btn
- perfil-cuidador.html: m-tab-bar, m-btn, m-badge, m-profile-card, m-price-box
- mis-contactos.html: m-tab-bar, m-btn, m-badge mockup classes
- panel-cuidador.html/css/js: dash-stats gradient teal, m-btn, inputs marfil bg
- recomendar.html: m-tab-bar, m-btn, inputs marfil bg
- index.html: todos los botones migrados a m-btn
- sw.js: cache version 7
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
