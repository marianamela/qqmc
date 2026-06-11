/* =============================================================
   Cuidy · Lógica de invitación / referidos
   Se incluye en diario-familia y diario-cuidador
   ============================================================= */

(function() {
  'use strict';

  const API = window.location.hostname === 'localhost'
    ? 'http://localhost:8888/.netlify/functions/api'
    : '/.netlify/functions/api';

  const BASE_URL = window.location.origin;

  // Detectar tipo de usuario por la página
  const esFamilia = document.body.classList.contains('diario-familia');
  const tipo = esFamilia ? 'familia' : 'cuidador';

  // Landing de destino: familia invita cuidador, cuidador invita familia
  const landingTarget = esFamilia ? 'invita-cuidador' : 'invita-familia';
  const utmCampaign = esFamilia ? 'familia_invita_cuidador' : 'cuidador_invita_familia';

  const btnWA = document.getElementById('btnInvitaWA');
  const btnLink = document.getElementById('btnInvitaLink');

  if (!btnWA || !btnLink) return;

  // Obtener nombre del usuario logueado (puede estar en localStorage o en el DOM)
  function getUserName() {
    try {
      const session = JSON.parse(localStorage.getItem('cuidy_session') || '{}');
      return session.nombre || 'Un usuario';
    } catch {
      return 'Un usuario';
    }
  }

  function getUserId() {
    try {
      const session = JSON.parse(localStorage.getItem('cuidy_session') || '{}');
      return session.id || null;
    } catch {
      return null;
    }
  }

  // Generar código de referido vía API
  async function generarCodigo(canal) {
    try {
      const nombre = getUserName();
      const res = await fetch(`${API}/referidos/generar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: getUserId(),
          tipo: tipo,
          nombre: nombre,
          utm_source: 'whatsapp',
          utm_medium: 'referral',
          utm_campaign: utmCampaign,
          canal: canal,
          landing: landingTarget
        })
      });
      const data = await res.json();
      if (data.ok) return data.data.codigo;
    } catch (err) {
      console.error('[invita] error generando código:', err);
    }
    // Fallback: generar un código simple local
    return tipo.substring(0, 3) + '-' + Math.random().toString(36).substring(2, 6);
  }

  function buildLink(codigo) {
    return `${BASE_URL}/${landingTarget}.html?ref=${codigo}&utm_source=whatsapp&utm_campaign=${utmCampaign}`;
  }

  // Mensajes de WhatsApp
  function getWhatsAppMessage(link) {
    if (esFamilia) {
      return `¡Hola! Te invito a registrarte en *Cuidy* 💙\n\nEs una plataforma donde podés crear tu perfil como cuidador/a, mostrar tu experiencia y conectar con familias de tu zona.\n\nRegistrate gratis acá: ${link}`;
    } else {
      return `¡Hola! Soy cuidador/a y estoy en *Cuidy* 💙\n\n¿Podrías recomendarme en la plataforma? También podés buscar cuidadores verificados para vos o alguien que conozcas.\n\nMirá acá: ${link}`;
    }
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = msg;
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 2500);
    }
  }

  // Compartir por WhatsApp
  btnWA.addEventListener('click', async () => {
    btnWA.disabled = true;
    btnWA.textContent = 'Generando link…';

    const codigo = await generarCodigo('whatsapp');
    const link = buildLink(codigo);
    const msg = getWhatsAppMessage(link);
    const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;

    // Track
    if (window.CuidyAnalytics) {
      CuidyAnalytics.referralShared(tipo, 'whatsapp', esFamilia ? 'cuidador' : 'familia');
    }

    window.open(waUrl, '_blank');

    btnWA.disabled = false;
    btnWA.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.616l4.575-1.462A11.956 11.956 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.234 0-4.308-.726-5.992-1.958l-.418-.31-2.713.867.882-2.636-.34-.443A9.957 9.957 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/></svg> Enviar por WhatsApp`;
  });

  // Copiar link
  btnLink.addEventListener('click', async () => {
    btnLink.disabled = true;
    btnLink.textContent = 'Generando…';

    const codigo = await generarCodigo('copiar_link');
    const link = buildLink(codigo);

    try {
      await navigator.clipboard.writeText(link);
      showToast('Link copiado al portapapeles');
    } catch {
      // Fallback para móviles
      const input = document.createElement('input');
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      showToast('Link copiado');
    }

    // Track
    if (window.CuidyAnalytics) {
      CuidyAnalytics.referralShared(tipo, 'copiar_link', esFamilia ? 'cuidador' : 'familia');
    }

    btnLink.disabled = false;
    btnLink.textContent = 'Copiar link';
  });

})();
