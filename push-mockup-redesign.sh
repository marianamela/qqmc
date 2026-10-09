#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "feat: registro cuidador unificado en sumate-cuidador.html

- sumate-cuidador.html: reemplaza dos caminos (solicitar rec + lista espera)
  con un solo formulario de registro que crea la cuenta via POST /cuidadores.
  Soporta ?inv= para invitación con badge, sección opcional de recomendación,
  OTP WhatsApp, especialidades, consentimientos. Mismo payload que registro-cuidador.js.
- registro-cuidador.html: convertido en redirect a sumate-cuidador.html
  preservando ?inv= y otros params.
- sw.js: cache version 10
"
git push origin dev
echo "✅ Push completado. Verificá en https://dev--cuidy-ar.netlify.app"
