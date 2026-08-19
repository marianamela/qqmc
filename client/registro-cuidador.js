/* Registro de cuidador/a — wizard simplificado (3 pasos)
   Paso 0: Datos personales + contacto + zona + especialidades
   Paso 1: Verificación de identidad (DNI + selfie) + consentimientos
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

  // Estado de verificación de identidad
  let dniDataUrl = null;
  let selfieDataUrl = null;
  let cuidCameraStream = null;
  let invitacionValidada = null; // { codigo, familia_nombre }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('year').textContent = new Date().getFullYear();
    initNavigation();
    initIdentityVerification();
    initAutosave();
    initSubmit();
    loadDraft();
    updateStepUI();
    detectarInvitacion();

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
    // Update hero badge and title for invited users
    const badge = document.getElementById('heroBadge');
    if (badge) badge.textContent = 'Invitación recomendada';
    const title = document.getElementById('heroTitle');
    if (title) title.innerHTML = 'Te invitaron a <em>Cuidy</em>';

    // Show static banner with family name
    const banner = document.getElementById('recBanner');
    if (banner) {
      banner.classList.remove('hidden');
      const nombreEl = document.getElementById('recNombreFamilia');
      if (nombreEl) nombreEl.textContent = familiaNombre;
    }

    // Show the "ser recomendado" info section for invited users
    const recInfo = document.getElementById('recInfo');
    if (recInfo) recInfo.classList.remove('hidden');
  }

  function mostrarMensajeListaEspera() {
    const urlParams = new URLSearchParams(window.location.search);
    // Only show waitlist messaging if no inv param (organic registration)
    if (urlParams.has('inv')) return; // invalid inv code, don't change messaging

    const sub = document.getElementById('heroSub');
    if (sub) {
      sub.innerHTML = `
        Estamos construyendo una comunidad de cuidadores verificados y recomendados por familias.
        Completá tus datos y nuestro equipo evaluará tu perfil. Te avisamos por WhatsApp cuando tu cuenta esté aprobada.
      `;
    }
  }

  // === Navegación ===
  const STEP_NAMES = ['datos_personales', 'verificacion_identidad', 'confirmacion'];

  function initNavigation() {
    document.getElementById('btnPrev').addEventListener('click', () => goTo(currentStep - 1));
    document.getElementById('btnNext').addEventListener('click', () => {
      if (!validateStep(currentStep)) return;
      goTo(currentStep + 1);
    });
  }

  function goTo(step) {
    const prevStep = currentStep;
    step = Math.max(0, Math.min(TOTAL_STEPS - 1, step));
    currentStep = step;
    updateStepUI();
    if (step === 2) renderResumen();
    // GA4: tracking de paso
    if (window.CuidyAnalytics && step > prevStep) {
      CuidyAnalytics.registrationStep('cuidador', step, STEP_NAMES[step] || 'paso_' + step);
    }
    // Detener cámara si salimos del paso 1
    if (prevStep === 1 && step !== 1) stopCuidCamera();
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
    document.getElementById('btnNext').hidden = currentStep === TOTAL_STEPS - 1;
    document.getElementById('btnSubmit').hidden = currentStep !== TOTAL_STEPS - 1;
  }

  // === Validaciones ===
  function validateStep(step) {
    clearErrors();
    const form = document.getElementById('wizardForm');

    if (step === 0) {
      if (!markIfEmpty('nombre')) return false;
      if (!markIfEmpty('apellido')) return false;
      if (!markIfEmpty('dni')) return false;
      if (!/^\d{7,9}$/.test(form.dni.value.replace(/\D/g, ''))) {
        markError('dni', 'DNI inválido (7 a 9 dígitos)'); return false;
      }
      if (!markIfEmpty('fecha_nacimiento')) return false;
      const nac = new Date(form.fecha_nacimiento.value);
      const edad = (Date.now() - nac.getTime()) / (365.25 * 864e5);
      if (edad < 18) { markError('fecha_nacimiento', 'Debés ser mayor de 18 años'); return false; }
      if (!markIfEmpty('email')) return false;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.value)) {
        markError('email', 'Email inválido'); return false;
      }
      if (!markIfEmpty('telefono')) return false;
      // Verificar que el teléfono esté validado por OTP
      const telVerificado = document.getElementById('telefonoVerificado');
      if (!telVerificado || !telVerificado.value) {
        markError('telefono', 'Verificá tu WhatsApp con el código OTP');
        return false;
      }
      if (!markIfEmpty('password')) return false;
      if (form.password.value.length < 8) { markError('password', 'Mínimo 8 caracteres'); return false; }
      if (!markIfEmpty('provincia')) return false;
      if (!markIfEmpty('localidad')) return false;
      const esp = form.querySelectorAll('input[name="especialidades"]:checked');
      if (!esp.length) { alert('Seleccioná al menos una especialidad.'); return false; }
    }

    if (step === 1) {
      if (!dniDataUrl) {
        alert('Subí una foto del frente de tu DNI para continuar.');
        return false;
      }
      if (!selfieDataUrl) {
        alert('Sacate una selfie sosteniendo el DNI para continuar.');
        return false;
      }
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

  // === Verificación de identidad: DNI + selfie ===
  function initIdentityVerification() {
    const dniInput = document.getElementById('dniInputCuid');
    dniInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { alert('Por favor seleccioná una imagen.'); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        dniDataUrl = ev.target.result;
        document.getElementById('dniImgCuid').src = dniDataUrl;
        document.getElementById('dniPreviewCuid').classList.add('has-image');
        document.getElementById('dniStatusCuid').textContent = 'Foto del DNI cargada';
        document.getElementById('dniStatusCuid').className = 'verify-card__status is-ok';
        document.getElementById('dniCardCuid').classList.add('has-data');
        document.getElementById('dniLabelCuid').innerHTML =
          '<input type="file" id="dniInputCuid2" accept="image/*" capture="environment" hidden /> Cambiar foto';
        document.getElementById('dniInputCuid2').addEventListener('change', (e2) => {
          dniInput.files = e2.target.files;
          dniInput.dispatchEvent(new Event('change'));
        });
        triggerAutosave();
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('btnStartCameraCuid').addEventListener('click', startCuidCamera);
    document.getElementById('btnCaptureCuid').addEventListener('click', captureCuidPhoto);
    document.getElementById('btnRetakeCuid').addEventListener('click', retakeCuidPhoto);
  }

  async function startCuidCamera() {
    const video = document.getElementById('cameraVideoCuid');
    const container = document.getElementById('cameraContainerCuid');
    const btnStart = document.getElementById('btnStartCameraCuid');
    const btnCapture = document.getElementById('btnCaptureCuid');
    try {
      cuidCameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      video.srcObject = cuidCameraStream;
      container.classList.add('is-active');
      btnStart.hidden = true;
      btnCapture.hidden = false;
      document.getElementById('selfiePreviewCuid').classList.remove('has-image');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        alert('Necesitamos acceso a tu cámara para sacar la selfie. Habilitá el permiso en tu navegador.');
      } else if (err.name === 'NotFoundError') {
        alert('No detectamos una cámara en tu dispositivo.');
      } else {
        alert('No pudimos acceder a la cámara: ' + err.message);
      }
    }
  }

  function captureCuidPhoto() {
    const video = document.getElementById('cameraVideoCuid');
    const canvas = document.getElementById('cameraCanvasCuid');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    selfieDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    document.getElementById('selfieImgCuid').src = selfieDataUrl;
    document.getElementById('selfiePreviewCuid').classList.add('has-image');

    video.pause();
    stopCuidCamera();
    document.getElementById('cameraContainerCuid').classList.remove('is-active');
    document.getElementById('btnCaptureCuid').hidden = true;
    document.getElementById('btnStartCameraCuid').hidden = true;
    document.getElementById('btnRetakeCuid').hidden = false;
    document.getElementById('selfieStatusCuid').textContent = 'Selfie capturada';
    document.getElementById('selfieStatusCuid').className = 'verify-card__status is-ok';
    document.getElementById('selfieCardCuid').classList.add('has-data');
    triggerAutosave();
  }

  function retakeCuidPhoto() {
    selfieDataUrl = null;
    document.getElementById('selfiePreviewCuid').classList.remove('has-image');
    document.getElementById('selfieStatusCuid').textContent = '';
    document.getElementById('selfieStatusCuid').className = 'verify-card__status';
    document.getElementById('selfieCardCuid').classList.remove('has-data');
    document.getElementById('btnRetakeCuid').hidden = true;
    document.getElementById('btnStartCameraCuid').hidden = false;
    document.getElementById('btnCaptureCuid').hidden = true;
  }

  function stopCuidCamera() {
    if (cuidCameraStream) {
      cuidCameraStream.getTracks().forEach(t => { t.stop(); t.enabled = false; });
      cuidCameraStream = null;
    }
    const video = document.getElementById('cameraVideoCuid');
    if (video) { video.pause(); video.srcObject = null; video.load(); }
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
      const draft = collectFormData({ includeFiles: false });
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
    if (d.identidad) {
      setIf('nombre', d.identidad.nombre);
      setIf('apellido', d.identidad.apellido);
      setIf('dni', d.identidad.dni);
      setIf('fecha_nacimiento', d.identidad.fecha_nacimiento);
    }
    if (d.contacto) {
      setIf('email', d.contacto.email);
      setIf('telefono', d.contacto.telefono);
    }
    if (d.zona) {
      setIf('provincia', d.zona.provincia);
      setIf('localidad', d.zona.localidad);
    }
    (d.especialidades || []).forEach(v => {
      const c = form.querySelector(`input[name="especialidades"][value="${v}"]`);
      if (c) c.checked = true;
    });
  }

  // === Recolección de datos ===
  function collectFormData({ includeFiles = true } = {}) {
    const form = document.getElementById('wizardForm');
    const val = id => document.getElementById(id)?.value?.trim() || null;
    const multi = name => Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map(i => i.value);

    return {
      identidad: {
        nombre: val('nombre'), apellido: val('apellido'),
        dni: val('dni'), fecha_nacimiento: val('fecha_nacimiento')
      },
      contacto: {
        email: val('email'), telefono: val('telefono')
      },
      zona: {
        provincia: val('provincia'), localidad: val('localidad')
      },
      especialidades: multi('especialidades'),
      verificacion: {
        dni_foto: includeFiles ? dniDataUrl : (dniDataUrl ? true : false),
        selfie: includeFiles ? selfieDataUrl : (selfieDataUrl ? true : false)
      },
      consentimientos: {
        privacidad: document.getElementById('consent_privacidad')?.checked || false,
        datos_veraces: document.getElementById('consent_datos_veraces')?.checked || false
      }
    };
  }

  // === Resumen (paso 2) ===
  function renderResumen() {
    const d = collectFormData({ includeFiles: false });
    const espTags = (d.especialidades || []).map(e =>
      `<span class="tag">${ESPECIALIDAD_LABEL[e] || e}</span>`
    ).join('');

    document.getElementById('resumenRegistro').innerHTML = `
      <div class="resumen__group">
        <h4>Datos personales</h4>
        <div class="resumen__row"><span class="k">Nombre</span><span class="v">${esc(d.identidad.nombre)} ${esc(d.identidad.apellido)}</span></div>
        <div class="resumen__row"><span class="k">DNI</span><span class="v">${esc(d.identidad.dni)}</span></div>
        <div class="resumen__row"><span class="k">Nacimiento</span><span class="v">${esc(d.identidad.fecha_nacimiento)}</span></div>
      </div>
      <div class="resumen__group">
        <h4>Contacto</h4>
        <div class="resumen__row"><span class="k">Email</span><span class="v">${esc(d.contacto.email)}</span></div>
        <div class="resumen__row"><span class="k">Teléfono</span><span class="v">${esc(d.contacto.telefono)}</span></div>
      </div>
      <div class="resumen__group">
        <h4>Zona</h4>
        <div class="resumen__row"><span class="k">Ubicación</span><span class="v">${esc(d.zona.localidad)}, ${esc(d.zona.provincia)}</span></div>
      </div>
      <div class="resumen__group">
        <h4>Especialidades</h4>
        <div class="resumen__row"><span class="v">${espTags || '—'}</span></div>
      </div>
      <div class="resumen__group">
        <h4>Verificación de identidad</h4>
        <div class="resumen__row">
          <span class="k">Foto DNI</span>
          <span class="v resumen__verify ${d.verificacion.dni_foto ? 'is-ok' : ''}">
            ${d.verificacion.dni_foto ? '<span class="verify-check">&#10003;</span> Cargada' : 'Pendiente'}
          </span>
        </div>
        <div class="resumen__row">
          <span class="k">Selfie con DNI</span>
          <span class="v resumen__verify ${d.verificacion.selfie ? 'is-ok' : ''}">
            ${d.verificacion.selfie ? '<span class="verify-check">&#10003;</span> Capturada' : 'Pendiente'}
          </span>
        </div>
      </div>
    `;
  }

  // === Submit ===
  function initSubmit() {
    document.getElementById('wizardForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnSubmit');
      btn.disabled = true; btn.textContent = 'Enviando…';

      const data = collectFormData({ includeFiles: true });
      const payload = {
        identidad: data.identidad,
        contacto: data.contacto,
        zona: data.zona,
        especialidades: data.especialidades,
        verificacion: {
          dni_foto: data.verificacion.dni_foto,
          selfie: data.verificacion.selfie,
          estado: 'pendiente'
        },
        consentimientos: data.consentimientos,
        password: document.getElementById('password').value,
        registro_simplificado: true
      };

      // Invitación por familia
      if (invitacionValidada) {
        payload.invitacion_codigo = invitacionValidada.codigo;
      }

      // Tracking: referido y UTMs
      const urlParams = new URLSearchParams(window.location.search);
      const refCode = urlParams.get('ref') || sessionStorage.getItem('cuidy_ref_code') || null;
      payload.utm_source = urlParams.get('utm_source') || sessionStorage.getItem('cuidy_utm_source') || null;
      payload.utm_campaign = urlParams.get('utm_campaign') || sessionStorage.getItem('cuidy_utm_campaign') || null;
      if (refCode) payload.ref_code = refCode;

      try {
        // Validar referido si hay código
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
        if (!json.ok) throw new Error(json.error || (json.detalles || []).join(', ') || 'Error al enviar');

        // Completar referido
        if (refCode) {
          fetch(`${API_BASE}/referidos/completar`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo: refCode, referee_id: json.data.id, referee_tipo: 'cuidador' })
          }).catch(() => {});
        }

        // GA4
        if (window.CuidyAnalytics) {
          CuidyAnalytics.registrationCompleted('cuidador', json.data.id);
        }

        localStorage.setItem('qqmc_cuidador_enviado', JSON.stringify({
          id: json.data.id, email: data.contacto.email,
          creado_en: json.data.creado_en, estado: json.data.estado
        }));
        localStorage.removeItem(DRAFT_KEY);
        window.location.href = 'cuidador-enviado.html';
      } catch (err) {
        alert('No pudimos enviar tu registro: ' + err.message);
        btn.disabled = false; btn.textContent = 'Enviar registro';
      }
    });
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
})();
