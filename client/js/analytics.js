/* =============================================================
   Cuidy · Google Analytics 4 + Eventos de conversión
   Incluir después de gtag.js en cada página
   ============================================================= */

(function() {
  'use strict';

  // ---- Config ----
  // IMPORTANTE: Reemplazar con tu Measurement ID de GA4
  const GA_MEASUREMENT_ID = 'G-HL4493CBEG';

  // Inyectar gtag si no está presente
  if (!window.gtag) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function() { dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID, {
      send_page_view: true,
      cookie_flags: 'SameSite=None;Secure'
    });
  }

  // ---- Leer UTMs y ref de la URL actual ----
  const params = new URLSearchParams(window.location.search);
  const refCode = params.get('ref') || sessionStorage.getItem('cuidy_ref_code') || '';
  const utmSource = params.get('utm_source') || sessionStorage.getItem('cuidy_utm_source') || '';
  const utmMedium = params.get('utm_medium') || sessionStorage.getItem('cuidy_utm_medium') || '';
  const utmCampaign = params.get('utm_campaign') || sessionStorage.getItem('cuidy_utm_campaign') || '';

  // Persistir en session
  if (refCode) sessionStorage.setItem('cuidy_ref_code', refCode);
  if (utmSource) sessionStorage.setItem('cuidy_utm_source', utmSource);
  if (utmMedium) sessionStorage.setItem('cuidy_utm_medium', utmMedium);
  if (utmCampaign) sessionStorage.setItem('cuidy_utm_campaign', utmCampaign);

  // ---- API pública de eventos ----
  window.CuidyAnalytics = {

    // Evento genérico
    track: function(eventName, extraParams) {
      const base = {
        ref_code: refCode,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        landing_page: sessionStorage.getItem('cuidy_landing') || 'directo'
      };
      gtag('event', eventName, Object.assign(base, extraParams || {}));
    },

    // Link de referido generado
    referralGenerated: function(tipo, canal) {
      this.track('referral_link_generated', {
        referrer_tipo: tipo,   // familia | cuidador
        canal: canal           // whatsapp | copiar_link
      });
    },

    // Link de referido compartido
    referralShared: function(tipo, canal, targetType) {
      this.track('referral_link_shared', {
        referrer_tipo: tipo,
        canal: canal,
        target_tipo: targetType   // familia | cuidador
      });
    },

    // Vista de landing
    landingView: function(pageName) {
      this.track('landing_view', { landing_page: pageName });
    },

    // Registro iniciado
    registrationStarted: function(userType) {
      this.track('registration_started', {
        user_type: userType  // familia | cuidador
      });
    },

    // Paso del wizard completado
    registrationStep: function(userType, stepNumber, stepName) {
      this.track('registration_step', {
        user_type: userType,
        step_number: stepNumber,
        step_name: stepName
      });
    },

    // Registro completado
    registrationCompleted: function(userType, userId) {
      this.track('registration_completed', {
        user_type: userType,
        user_id: userId
      });
      // Marcar como conversión en GA4
      gtag('event', 'conversion', {
        send_to: GA_MEASUREMENT_ID,
        event_category: 'registro',
        event_label: userType,
        value: userType === 'cuidador' ? 10 : 5
      });
    },

    // CTA clickeado
    ctaClicked: function(ctaName, location) {
      this.track('cta_clicked', {
        cta_name: ctaName,
        cta_location: location
      });
    },

    // Obtener datos de tracking para enviar al backend
    getTrackingData: function() {
      return {
        ref_code: sessionStorage.getItem('cuidy_ref_code') || null,
        utm_source: sessionStorage.getItem('cuidy_utm_source') || null,
        utm_medium: sessionStorage.getItem('cuidy_utm_medium') || null,
        utm_campaign: sessionStorage.getItem('cuidy_utm_campaign') || null,
        landing_page: sessionStorage.getItem('cuidy_landing') || null
      };
    }
  };

})();
