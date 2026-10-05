/* Registro de cuidador/a — flujo optimizado (3 pasos)
   Paso 0: Datos básicos (6 campos: nombre, apellido, email, whatsapp, password, especialidades)
   Paso 1: Verificación de identidad vía Didit.me (embebido)
   Paso 2: Revisión y envío
*/
(() => {
  const API_BASE = '/.netlify/functions/api';
  const TOTAL_STEPS = 3; // 0..2
  const DRAFT_KEY = 'qqmc_cuidador_draft';
  const AUTOSAVE_MS = 1200;

  const ESPECIALIDAD_LABEL = {
    ninera: 'Niñera',
    adulto_mayor: 'Adulto mayor',
    domestica: 'Empleada doméstica',
    cocinera: 'Cocinera'
  };

  let currentStep = 0;
  let autosaveTimer;
  let invitacionValidada = null;
  let cuidadorId = null;        // ID del cuidador creado
  let diditSessionId = null;    // Session ID de Didit.me
  let diditVerificado = false;  // ¿Ya pasó la verificación?
  let diditSandboxMode = false; // ¿Sandbox (sin Didit configurado)?

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('year').textContent = new Date().getFullYear();
    initNavigation();
    initAutosave();
    initSubmit();
    loadDraft();
    updateStepUI();
    detectarInvitacion();

    // Botones de Didit
    const btnSkip = document.getElementById('btnSkipVerif');
    if (btnSkip) btnSkip.addEventListener('click', () => {
      diditSandboxMode = true;
      diditVerificado = true;
      goTo(2);
    });

    const btnRetry = document.getElementById('btnRetryVerif');
    if (btnRetry) btnRetry.addEventListener('click', () => iniciarVerificacionDidit());

    // GA4: registro iniciado
    if (window.CuidyAnalytics) {
      CuidyAnalytics.registrationStarted('cuidador');
    }
  });

  async function detectarInvitacion() {
    const urlParams = new URLSearchParams(window.location.search);
    const invCode = urlParams.get('inv');
    if (!invCode) {
      mostrarMensajeListaEspera();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/invitaciones/validar?codigo=${encodeURIComponent(invCode)}`);
      const json = await res.json();
      if (json.ok && json.data) {
        invitacionValidada = { codigo: invCode, familia_nombre: json.data.familia_nombre };
        mostrarBannerInvitacion(json.data.familia_nombre);
      } else {
        mostrarMensajeListaEspera();
      }
    } catch {
      mostrarMensajeListaEspera();
    }
  }

  function mostrarBannerInvitacion(familiaNombre) {
    const badge = document.getElementById('heroBadge');
    if (badge) badge.textContent = 'Invitación recomendada';
    const title = document.getElementById('heroTitle');
    if (title) title.innerHTML = 'Te invitaron a <em>Cuidy</em>';
    const banner = document.getElementById('recBanner');
    if (banner) {
      banner.classList.remove('hidden');
      const nombreEl = document.getElementById('recNombreFamilia');
      if (nombreEl) nombreEl.textContent = familiaNombre;
    }
    const recInfo = document.getElementById('recInfo');
    if (recInfo) recInfo.classList.remove('hidden');
  }

  function mostrarMensajeListaEspera() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('inv')) return;
    const sub = document.getElementById('heroSub');
    if (sub) {
      sub.innerHTML = `
        Estamos construyendo una comunidad de cuidadores verificados y recomendados por familias.
        Completá tus datos y nuestro equipo evaluará tu perfil. Te avisamos por WhatsApp cuando tu cuenta esté aprobada.
      `;
    }
  }

  // === Navegación ===
  const STEP_NAMES = ['datos_basicos', 'verificacion_identidad', 'confirmacion'];

  function initNavigation() {
    document.getElementById('btnPrev').addEventListener('click', () => goTo(currentStep - 1));
    document.getElementById('btnNext').addEventListener('click', async () => {
      if (!validateStep(currentStep)) return;

      if (currentStep === 0) {
        // Al avanzar del paso 0 al 1: crear cuidador y luego iniciar verificación
        const ok = await crearCuidador();
        if (!ok) return;
        goTo(1);
        iniciarVerificacionDidit();
        return;
      }

      if (currentStep === 1) {
        if (!diditVerificado && !diditSandboxMode) {
          alert('Completá la verificación de identidad para continuar.');
          return;
        }
      }

      goTo(currentStep + 1);
    });
  }

  function goTo(step) {
    const prevStep = currentStep;
    step = Math.max(0, Math.min(TOTAL_STEPS - 1, step));
    currentStep = step;
    updateStepUI();
    if (step === 2) renderResumen();
    if (window.CuidyAnalytics && step > prevStep) {
      CuidyAnalytics.registrationStep('cuidador', step, STEP_NAMES[step] || 'paso_' + step);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateStepUI() {
    document.querySelectorAll('.step').forEach(s => {
      s.classList.toggle('is-active', Number(s.dataset.step) === currentStep);
    });
    document.querySelectorAll('.rc-progress__step, .steps__item').forEach(item => {
      const n = Number(item.dataset.step);
      item.classList.toggle('is-active', n === currentStep);
      item.classList.toggle('is-done', n < currentStep);
    });
    document.getElementById('btnPrev').disabled = currentStep === 0;
    // Ocultar "Siguiente" en paso 1 (se avanza con la verificación) y en paso 2
    const btnNext = document.getElementById('btnNext');
    if (currentStep === 1) {
      btnNext.hidden = !diditVerificado;
    } else {
      btnNext.hidden = currentStep === TOTAL_STEPS - 1;
    }
    document.getElementById('btnSubmit').hidden = currentStep !== TOTAL_STEPS - 1;
  }

  // === Validaciones ===
  function validateStep(step) {
    clearErrors();
    const form = document.getElementById('wizardForm');

    if (step === 0) {
      if (!markIfEmpty('nombre')) return false;
      if (!markIfEmpty('apellido')) return false;
      if (!markIfEmpty('email')) return false;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.value)) {
        markError('email', 'Email inválido'); return false;
      }
      if (!markIfEmpty('telefono')) return false;
      const telVerificado = document.getElementById('telefonoVerificado');
      if (!telVerificado || !telVerificado.value) {
        markError('telefono', 'Verificá tu WhatsApp con el código OTP');
        return false;
      }
      if (!markIfEmpty('password')) return false;
      if (form.password.value.length < 8) { markError('password', 'Mínimo 8 caracteres'); return false; }
      const esp = form.querySelectorAll('input[name="especialidades"]:checked');
      if (!esp.length) { alert('Seleccioná al menos una especialidad.'); return false; }
      if (!document.getElementById('consent_privacidad').checked) {
        alert('Tenés que aceptar la política de privacidad para continuar.');
        return false;
      }
      if (!document.getElementById('consent_datos_veraces').checked) {
        alert('Tenés que declarar que los datos son verdaderos.');
        return false;
      }
    }

    return true;
  }

  function markIfEmpty(id) {
    const el = document.getElementById(id);
    if (!el.value.trim()) { markError(id, 'Campo requerido'); return false; }
    return true;
  }
  function markError(id, msg) {
    const el = document.getElementById(id);
    const wrap = el.closest('.field');
    if (wrap) {
      wrap.classList.add('has-error');
      let err = wrap.querySelector('.field__error');
      if (!err) { err = document.createElement('p'); err.className = 'field__error'; wrap.appendChild(err); }
      err.textContent = msg;
    }
    el.focus();
  }
  function clearErrors() {
    document.querySelectorAll('.field.has-error').forEach(f => {
      f.classList.remove('has-error');
      const err = f.querySelector('.field__error'); if (err) err.remove();
    });
  }

  // === Crear cuidador en la base (paso 0 → 1) ===
  async function crearCuidador() {
    if (cuidadorId) return true; // Ya creado

    const btn = document.getElementById('btnNext');
    const prevText = btn.textContent;
    btn.disabled = true; btn.textContent = 'Creando cuenta...';

    const data = collectFormData();
    const payload = {
      identidad: { nombre: data.nombre, apellido: data.apellido },
      contacto: { email: data.email, telefono: data.telefono },
      especialidades: data.especialidades,
      consentimientos: data.consentimientos,
      password: document.getElementById('password').value,
      registro_simplificado: true
    };

    if (invitacionValidada) {
      payload.invitacion_codigo = invitacionValidada.codigo;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref') || sessionStorage.getItem('cuidy_ref_code') || null;
    payload.utm_source = urlParams.get('utm_source') || sessionStorage.getItem('cuidy_utm_source') || null;
    payload.utm_campaign = urlParams.get('utm_campaign') || sessionStorage.getItem('cuidy_utm_campaign') || null;
    if (refCode) payload.ref_code = refCode;

    try {
      if (refCode) {
        try {
          const refRes = await fetch(`${API_BASE}/referidos/validar?codigo=${encodeURIComponent(refCode)}`);
          const refData = await refRes.json();
          if (refData.ok) payload.referred_by = refData.data.id;
        } catch {}
      }

      const res = await fetch(`${API_BASE}/cuidadores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || (json.detalles || []).join(', ') || 'Error al crear cuenta');

      cuidadorId = json.data.id;

      // Completar referido
      if (refCode) {
        fetch(`${API_BASE}/referidos/completar`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigo: refCode, referee_id: cuidadorId, referee_tipo: 'cuidador' })
        }).catch(() => {});
      }

      localStorage.removeItem(DRAFT_KEY);
      btn.disabled = false; btn.textContent = prevText;
      return true;
    } catch (err) {
      alert('No pudimos crear tu cuenta: ' + err.message);
      btn.disabled = false; btn.textContent = prevText;
      return false;
    }
  }

  // === Verificación Didit.me ===
  async function iniciarVerificacionDidit() {
    if (!cuidadorId) return;

    // Mostrar loading
    showDiditState('loading');

    try {
      const res = await fetch(`${API_BASE}/verificacion/iniciar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'cuidador', id: cuidadorId })
      });
      const json = await res.json();

      if (!json.ok) throw new Error(json.error || 'Error al iniciar verificación');

      // Ya verificado previamente
      if (json.ya_verificado) {
        diditVerificado = true;
        showDiditState('success');
        updateStepUI();
        return;
      }

      // Sandbox mode (Didit no configurado)
      if (json.sandbox) {
        diditSandboxMode = true;
        showDiditState('sandbox');
        return;
      }

      // Sesión en progreso o nueva
      diditSessionId = json.session_id;

      if (json.url) {
        // Embeber el SDK de Didit en iframe
        const iframe = document.getElementById('diditFrame');
        iframe.src = json.url;
        showDiditState('iframe');

        // Escuchar mensajes del iframe (Didit postMessage)
        window.addEventListener('message', handleDiditMessage);

        // Polling de estado como fallback
        startVerificationPolling();
      } else {
        // Sin URL = en progreso, polling
        startVerificationPolling();
        showDiditState('loading');
      }
    } catch (err) {
      console.error('[verificacion] Error:', err);
      document.getElementById('diditErrorMsg').textContent = err.message;
      showDiditState('error');
    }
  }

  function showDiditState(state) {
    const states = {
      loading: 'diditLoading',
      iframe: 'diditContainer',
      success: 'diditSuccess',
      sandbox: 'diditSandbox',
      error: 'diditError'
    };
    Object.values(states).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', states[state] !== id);
    });
  }

  function handleDiditMessage(event) {
    // Didit sends postMessage when verification completes
    if (!event.data) return;
    const data = typeof event.data === 'string' ? (() => { try { return JSON.parse(event.data); } catch { return {}; } })() : event.data;

    if (data.type === 'didit_verification_complete' || data.status === 'Approved' || data.event === 'session_completed') {
      diditVerificado = true;
      showDiditState('success');
      updateStepUI();
      window.removeEventListener('message', handleDiditMessage);
    }
  }

  let pollingTimer = null;
  function startVerificationPolling() {
    if (pollingTimer) clearInterval(pollingTimer);
    let attempts = 0;
    pollingTimer = setInterval(async () => {
      attempts++;
      if (attempts > 60 || diditVerificado) { // max 5 min
        clearInterval(pollingTimer);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/verificacion/estado/${cuidadorId}?tipo=cuidador`);
        const json = await res.json();
        if (json.ok && json.verificacion) {
          const st = json.verificacion.estado;
          if (st === 'approved') {
            diditVerificado = true;
            showDiditState('success');
            updateStepUI();
            clearInterval(pollingTimer);
          } else if (st === 'declined') {
            document.getElementById('diditErrorMsg').textContent =
              'Tu verificación fue rechazada: ' + (json.verificacion.motivo_rechazo || 'Intentá de nuevo.');
            showDiditState('error');
            clearInterval(pollingTimer);
          }
        }
      } catch {}
    }, 5000);
  }

  // === Autosave draft (localStorage) ===
  function initAutosave() {
    const form = document.getElementById('wizardForm');
    form.addEventListener('input', triggerAutosave);
    form.addEventListener('change', triggerAutosave);
  }
  function triggerAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      if (cuidadorId) return; // Ya creado, no guardar borrador
      const draft = collectFormData();
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
    }, AUTOSAVE_MS);
  }
  function loadDraft() {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (!confirm('Encontramos un borrador anterior. ¿Querés continuar desde donde dejaste?')) {
        localStorage.removeItem(DRAFT_KEY); return;
      }
      applyDraft(d);
    } catch {}
  }
  function applyDraft(d) {
    const form = document.getElementById('wizardForm');
    const setIf = (name, val) => { if (form[name] != null && val != null) form[name].value = val; };
    setIf('nombre', d.nombre);
    setIf('apellido', d.apellido);
    setIf('email', d.email);
    setIf('telefono', d.telefono);
    (d.especialidades || []).forEach(v => {
      const c = form.querySelector(`input[name="especialidades"][value="${v}"]`);
      if (c) c.checked = true;
    });
  }

  // === Recolección de datos ===
  function collectFormData() {
    const form = document.getElementById('wizardForm');
    const val = id => document.getElementById(id)?.value?.trim() || null;
    const multi = name => Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map(i => i.value);

    return {
      nombre: val('nombre'),
      apellido: val('apellido'),
      email: val('email'),
      telefono: val('telefono'),
      especialidades: multi('especialidades'),
      consentimientos: {
        privacidad: document.getElementById('consent_privacidad')?.checked || false,
        datos_veraces: document.getElementById('consent_datos_veraces')?.checked || false
      }
    };
  }

  // === Resumen (paso 2) ===
  function renderResumen() {
    const d = collectFormData();
    const espTags = (d.especialidades || []).map(e =>
      `<span class="tag">${ESPECIALIDAD_LABEL[e] || e}</span>`
    ).join('');

    const verifEstado = diditVerificado
      ? '<span class="verify-check">&#10003;</span> Verificada'
      : (diditSandboxMode ? '<span style="color:var(--teal)">&#9888;</span> Pendiente (sandbox)' : 'En proceso');

    document.getElementById('resumenRegistro').innerHTML = `
      <div class="resumen__group">
        <h4>Datos personales</h4>
        <div class="resumen__row"><span class="k">Nombre</span><span class="v">${esc(d.nombre)} ${esc(d.apellido)}</span></div>
      </div>
      <div class="resumen__group">
        <h4>Contacto</h4>
        <div class="resumen__row"><span class="k">Email</span><span class="v">${esc(d.email)}</span></div>
        <div class="resumen__row"><span class="k">WhatsApp</span><span class="v">${esc(d.telefono)}</span></div>
      </div>
      <div class="resumen__group">
        <h4>Especialidades</h4>
        <div class="resumen__row"><span class="v">${espTags || '—'}</span></div>
      </div>
      <div class="resumen__group">
        <h4>Verificación de identidad</h4>
        <div class="resumen__row">
          <span class="k">Estado</span>
          <span class="v resumen__verify ${diditVerificado ? 'is-ok' : ''}">${verifEstado}</span>
        </div>
      </div>
    `;
  }

  // === Submit (paso 2 → confirmar y redirigir) ===
  function initSubmit() {
    document.getElementById('wizardForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!cuidadorId) {
        alert('Hubo un error. Recargá la página e intentá de nuevo.');
        return;
      }

      const btn = document.getElementById('btnSubmit');
      btn.disabled = true; btn.textContent = 'Enviando...';

      // GA4
      if (window.CuidyAnalytics) {
        CuidyAnalytics.registrationCompleted('cuidador', cuidadorId);
      }

      const d = collectFormData();
      localStorage.setItem('qqmc_cuidador_enviado', JSON.stringify({
        id: cuidadorId, email: d.email,
        creado_en: new Date().toISOString(),
        estado: diditVerificado ? 'identidad_aprobada' : 'enviado'
      }));
      localStorage.removeItem(DRAFT_KEY);
      window.location.href = 'cuidador-enviado.html';
    });
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
})();
