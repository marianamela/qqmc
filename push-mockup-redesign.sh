#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "feat: rediseño estructural completo — HTML igualado a mockups P01/P02

- index.html: hero reescrito (gradient marfil, illustration box), secciones extras eliminadas,
  'Cómo funciona' con step-num circles, cierre simplificado al mockup P01
- login.html: botones migrados a m-btn m-btn--teal
- registro-familia.html: botón nav y modal a m-btn mockup
- completar-perfil.html: todos los botones a m-btn
- verificar-identidad.html: botones a m-btn mockup
- cuidador-enviado.html: botones a m-btn
- app.js: todas las clases btn migradas a m-btn
- auth.css: inputs alineados al design system (marfil bg, gris border)
- style.css: hero-illustration-box hidden on mobile
- sw.js: cache version 8
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
