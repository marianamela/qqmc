/* Registro de familia — wizard simplificado (2 pasos)
   Paso 0: Datos personales + contacto + zona
   Paso 1: Revisión y envío
*/
(() => {
  const API_BASE = '/.netlify/functions/api';
  const TOTAL_STEPS = 2; // 0..1

  let currentStep = 0;
  let fotoPerfilDataUrl = null;

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('year').textContent = new Date().getFullYear();
    initNavigation();
    initFotoPerfil();
    initSubmit();
    updateStepUI();

    // GA4: registro iniciado
    if (window.CuidyAnalytics) {
      CuidyAnalytics.registrationStarted('familia');
    }
  });

  // === Navegación ===
  const STEP_NAMES = ['datos_personales', 'confirmacion'];

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
    if (step === 1) renderResumen();
    // GA4: tracking de paso
    if (window.CuidyAnalytics && step > prevStep) {
      CuidyAnalytics.registrationStep('familia', step, STEP_NAMES[step] || 'paso_' + step);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateStepUI() {
    document.querySelectorAll('.step').forEach(s => {
      s.classList.toggle('is-active', Number(s.dataset.step) === currentStep);
    });
    document.querySelectorAll('.steps__item').forEach(item => {
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
      if (form.password.value !== form.password2.value) {
        markError('password2', 'Las contraseñas no coinciden'); return false;
      }
      if (!markIfEmpty('provincia')) return false;
      if (!markIfEmpty('localidad')) return false;
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

  // === Foto de perfil ===
  function initFotoPerfil() {
    const input = document.getElementById('fotoPerfilInput');
    if (!input) return;
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { alert('Por favor seleccioná una imagen.'); return; }
      resizeImage(file, 400, 400, 0.8, (dataUrl) => {
        fotoPerfilDataUrl = dataUrl;
        const img = document.getElementById('fotoPerfilImg');
        img.src = dataUrl;
        img.classList.add('is-visible');
        const label = document.getElementById('fotoPerfilLabel');
        label.innerHTML = '<input type="file" id="fotoPerfilInput2" accept="image/*" hidden /> Cambiar foto';
        document.getElementById('fotoPerfilInput2').addEventListener('change', (e2) => {
          input.files = e2.target.files;
          input.dispatchEvent(new Event('change'));
        });
      });
    });
  }

  function resizeImage(file, maxW, maxH, quality, cb) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // === Recolección de datos ===
  function collectFormData({ includeFiles = true } = {}) {
    const val = id => document.getElementById(id)?.value?.trim() || null;

    return {
      cuenta: {
        nombre: val('nombre'),
        apellido: val('apellido'),
        email: val('email'),
        telefono: val('telefono'),
        fecha_nacimiento: val('fecha_nacimiento'),
        foto_url: includeFiles ? fotoPerfilDataUrl : (fotoPerfilDataUrl ? true : false)
      },
      zona: {
        provincia: val('provincia'),
        localidad: val('localidad')
      }
    };
  }

  // === Resumen (paso 1) ===
  function renderResumen() {
    const d = collectFormData({ includeFiles: false });

    document.getElementById('resumenRegistro').innerHTML = `
      <div class="resumen__group">
        <h4>Datos personales</h4>
        ${d.cuenta.foto_url ? `<div class="resumen__row"><span class="k">Foto</span><span class="v"><img src="${fotoPerfilDataUrl}" alt="Tu foto" style="width:48px;height:48px;border-radius:50%;object-fit:cover;vertical-align:middle;" /></span></div>` : ''}
        <div class="resumen__row"><span class="k">Nombre</span><span class="v">${esc(d.cuenta.nombre)} ${esc(d.cuenta.apellido)}</span></div>
        <div class="resumen__row"><span class="k">Email</span><span class="v">${esc(d.cuenta.email)}</span></div>
        <div class="resumen__row"><span class="k">WhatsApp</span><span class="v">${esc(d.cuenta.telefono)}</span></div>
        ${d.cuenta.fecha_nacimiento ? `<div class="resumen__row"><span class="k">Nacimiento</span><span class="v">${esc(d.cuenta.fecha_nacimiento)}</span></div>` : ''}
      </div>
      <div class="resumen__group">
        <h4>Zona</h4>
        <div class="resumen__row"><span class="k">Ubicación</span><span class="v">${esc(d.zona.localidad)}, ${esc(d.zona.provincia)}</span></div>
      </div>
    `;
  }

  // === Submit ===
  function initSubmit() {
    document.getElementById('wizardForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!document.getElementById('acepta_terminos').checked) {
        alert('Tenés que aceptar los términos y condiciones para continuar.');
        return;
      }

      const btn = document.getElementById('btnSubmit');
      btn.disabled = true; btn.textContent = 'Creando cuenta…';

      const data = collectFormData({ includeFiles: true });
      const password = document.getElementById('password').value;

      try {
        // 1. Crear usuario en Supabase Auth + tabla familias
        const authResult = await authRegistro({
          nombre: data.cuenta.nombre,
          apellido: data.cuenta.apellido,
          email: data.cuenta.email,
          telefono: data.cuenta.telefono,
          password: password,
          zona: data.zona?.localidad || ''
        });

        // 2. Actualizar la familia con zona y foto
        const session = getSession();
        if (session?.id) {
          const patchBody = { zona: data.zona };
          if (data.cuenta.fecha_nacimiento) patchBody.fecha_nacimiento = data.cuenta.fecha_nacimiento;
          if (data.cuenta.foto_url) patchBody.foto_url = data.cuenta.foto_url;

          await fetch(`${API_BASE}/familias/${session.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patchBody)
          });
        }

        // GA4
        if (window.CuidyAnalytics) {
          CuidyAnalytics.registrationCompleted('familia', session?.id);
        }

        document.getElementById('okModal').classList.remove('hidden');
      } catch (err) {
        alert('No pudimos crear la cuenta: ' + err.message);
        btn.disabled = false; btn.textContent = 'Crear cuenta';
      }
    });

    // Cerrar modal OK
    document.getElementById('okModal').addEventListener('click', (e) => {
      if (e.target.dataset.close !== undefined) {
        document.getElementById('okModal').classList.add('hidden');
      }
    });
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
})();
