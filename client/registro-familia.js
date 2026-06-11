/* Registro de familia — wizard multi-paso */
(() => {
  const API_BASE = '/.netlify/functions/api';
  const TOTAL_STEPS = 6;

  const ESPECIALIDAD_LABEL = {
    ninera: 'Niñera',
    adulto_mayor: 'Adulto mayor',
    domestica: 'Empleada doméstica'
  };
  const MODALIDAD_LABEL = {
    full_time: 'Full time',
    part_time: 'Part time',
    por_hora: 'Por hora',
    eventual: 'Eventual'
  };

  let currentStep = 1;

  // Estado de verificación de identidad
  let dniDataUrl = null;
  let selfieDataUrl = null;
  let cameraStream = null;

  // === Init ===
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('year').textContent = new Date().getFullYear();
    initNavigation();
    initConditionalBlocks();
    initIdentityVerification();
    initNinosRepeater();
    initSubmit();
    updateStepUI();

    // GA4: registro iniciado
    if (window.CuidyAnalytics) {
      CuidyAnalytics.registrationStarted('familia');
    }
  });

  // === Navegación ===
  function initNavigation() {
    document.getElementById('btnPrev').addEventListener('click', () => goTo(currentStep - 1));
    document.getElementById('btnNext').addEventListener('click', () => {
      if (!validateStep(currentStep)) return;
      if (currentStep === 3) refreshDetailBlocks(); // paso 3 = "Qué buscás"
      goTo(currentStep + 1);
    });
  }

  const STEP_NAMES_FAM = ['','cuenta','identidad','busqueda','detalle','preferencias','resumen'];
  function goTo(step) {
    const prevStep = currentStep;
    step = Math.max(1, Math.min(TOTAL_STEPS, step));
    currentStep = step;
    updateStepUI();
    if (step === 6) renderResumen();
    // GA4: tracking de paso
    if (window.CuidyAnalytics && step > prevStep) {
      CuidyAnalytics.registrationStep('familia', step, STEP_NAMES_FAM[step] || 'paso_' + step);
    }
    // Detener cámara si salimos del paso 2
    if (prevStep === 2 && step !== 2) stopCamera();
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
    document.getElementById('btnPrev').disabled = currentStep === 1;
    document.getElementById('btnNext').hidden = currentStep === TOTAL_STEPS;
    document.getElementById('btnSubmit').hidden = currentStep !== TOTAL_STEPS;
  }

  // === Verificación de identidad (paso 2) ===
  function initIdentityVerification() {
    // --- DNI upload ---
    const dniInput = document.getElementById('dniInput');
    dniInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        alert('Por favor seleccioná una imagen.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        dniDataUrl = ev.target.result;
        const img = document.getElementById('dniImg');
        img.src = dniDataUrl;
        document.getElementById('dniPreview').classList.add('has-image');
        document.getElementById('dniStatus').textContent = 'Foto del DNI cargada';
        document.getElementById('dniStatus').className = 'verify-card__status is-ok';
        document.getElementById('dniLabel').innerHTML =
          '<input type="file" id="dniInput2" accept="image/*" capture="environment" hidden /> Cambiar foto';
        // Reasignar evento al nuevo input
        document.getElementById('dniInput2').addEventListener('change', (e2) => {
          dniInput.files = e2.target.files;
          dniInput.dispatchEvent(new Event('change'));
        });
      };
      reader.readAsDataURL(file);
    });

    // --- Selfie con cámara ---
    const btnStart = document.getElementById('btnStartCamera');
    const btnCapture = document.getElementById('btnCapture');
    const btnRetake = document.getElementById('btnRetake');

    btnStart.addEventListener('click', startCamera);
    btnCapture.addEventListener('click', capturePhoto);
    btnRetake.addEventListener('click', retakePhoto);
  }

  async function startCamera() {
    const video = document.getElementById('cameraVideo');
    const container = document.getElementById('cameraContainer');
    const btnStart = document.getElementById('btnStartCamera');
    const btnCapture = document.getElementById('btnCapture');

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      video.srcObject = cameraStream;
      container.classList.add('is-active');
      btnStart.hidden = true;
      btnCapture.hidden = false;
      document.getElementById('selfiePreview').classList.remove('has-image');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        alert('Necesitamos acceso a tu cámara para sacar la selfie. Por favor habilitá el permiso en tu navegador.');
      } else if (err.name === 'NotFoundError') {
        alert('No detectamos una cámara en tu dispositivo. Probá desde un celular o una computadora con cámara.');
      } else {
        alert('No pudimos acceder a la cámara: ' + err.message);
      }
    }
  }

  function capturePhoto() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    // Espejo horizontal para que se vea natural
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    selfieDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const img = document.getElementById('selfieImg');
    img.src = selfieDataUrl;
    document.getElementById('selfiePreview').classList.add('has-image');

    // Apagar cámara inmediatamente después de capturar
    video.pause();
    stopCamera();
    document.getElementById('cameraContainer').classList.remove('is-active');
    document.getElementById('btnCapture').hidden = true;
    document.getElementById('btnStartCamera').hidden = true;
    document.getElementById('btnRetake').hidden = false;
    document.getElementById('selfieStatus').textContent = 'Selfie capturada';
    document.getElementById('selfieStatus').className = 'verify-card__status is-ok';
  }

  function retakePhoto() {
    selfieDataUrl = null;
    document.getElementById('selfiePreview').classList.remove('has-image');
    document.getElementById('selfieStatus').textContent = '';
    document.getElementById('selfieStatus').className = 'verify-card__status';
    document.getElementById('btnRetake').hidden = true;
    // No abrir cámara automáticamente — mostrar botón para que el usuario la active
    document.getElementById('btnStartCamera').hidden = false;
    document.getElementById('btnCapture').hidden = true;
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => {
        t.stop();
        t.enabled = false;
      });
      cameraStream = null;
    }
    const video = document.getElementById('cameraVideo');
    if (video) {
      video.pause();
      video.srcObject = null;
      video.load(); // fuerza al navegador a liberar la cámara
    }
  }

  // === Validación por paso ===
  function validateStep(step) {
    clearErrors();
    const form = document.getElementById('wizardForm');

    if (step === 1) {
      const required = ['nombre', 'apellido', 'email', 'telefono', 'password', 'password2'];
      const ok = required.every(id => markIfEmpty(id));
      if (!ok) return false;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.value)) {
        markError('email', 'Email inválido');
        return false;
      }
      if (form.password.value.length < 8) {
        markError('password', 'Mínimo 8 caracteres');
        return false;
      }
      if (form.password.value !== form.password2.value) {
        markError('password2', 'Las contraseñas no coinciden');
        return false;
      }
    }

    if (step === 2) {
      if (!dniDataUrl) {
        alert('Subí una foto del frente de tu DNI para continuar.');
        return false;
      }
      if (!selfieDataUrl) {
        alert('Sacate una selfie con la cámara para continuar.');
        return false;
      }
    }

    if (step === 3) {
      const tipos = form.querySelectorAll('input[name="tipos"]:checked');
      if (!tipos.length) {
        alert('Seleccioná al menos un tipo de cuidado.');
        return false;
      }
    }

    if (step === 5) {
      if (!markIfEmpty('provincia')) return false;
      if (!markIfEmpty('localidad')) return false;
    }

    return true;
  }

  function markIfEmpty(id) {
    const el = document.getElementById(id);
    if (!el.value.trim()) {
      markError(id, 'Campo requerido');
      return false;
    }
    return true;
  }
  function markError(id, msg) {
    const el = document.getElementById(id);
    const wrap = el.closest('.field');
    if (wrap) {
      wrap.classList.add('has-error');
      let err = wrap.querySelector('.field__error');
      if (!err) {
        err = document.createElement('p');
        err.className = 'field__error';
        wrap.appendChild(err);
      }
      err.textContent = msg;
    }
    el.focus();
  }
  function clearErrors() {
    document.querySelectorAll('.field.has-error').forEach(f => {
      f.classList.remove('has-error');
      const err = f.querySelector('.field__error');
      if (err) err.remove();
    });
  }

  // === Bloques condicionales (detalle por tipo) ===
  function initConditionalBlocks() {
    // Cuidado especial toggle
    const cuidEsp = document.getElementById('cuidado_especial');
    cuidEsp.addEventListener('change', () => {
      document.getElementById('cuidadoEspecialDetalle').hidden = !cuidEsp.checked;
    });
    // Dirección exacta toggle
    const compartir = document.getElementById('compartirDireccion');
    compartir.addEventListener('change', () => {
      document.getElementById('direccionBlock').hidden = !compartir.checked;
    });
  }

  function getSelectedTypes() {
    return Array.from(document.querySelectorAll('input[name="tipos"]:checked')).map(i => i.value);
  }

  function refreshDetailBlocks() {
    const types = getSelectedTypes();
    const blocks = document.querySelectorAll('.detail-block');
    let anyVisible = false;
    blocks.forEach(b => {
      const show = types.includes(b.dataset.showFor);
      b.hidden = !show;
      if (show) anyVisible = true;
    });
    document.getElementById('detalleEmpty').hidden = anyVisible;
  }

  // === Repeater de niños ===
  function initNinosRepeater() {
    const input = document.getElementById('cantidad_ninos');
    const render = () => renderNinos(Number(input.value) || 1);
    input.addEventListener('input', render);
    render();
  }

  function renderNinos(n) {
    const cont = document.getElementById('ninosContainer');
    const prev = collectNinos();
    cont.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const data = prev[i] || {};
      const card = document.createElement('div');
      card.className = 'nino-card';
      card.innerHTML = `
        <div class="nino-card__head">
          <span class="nino-card__title">Niño/a ${i + 1}</span>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Edad</label>
            <input type="number" min="0" max="17" class="nino-edad"
              value="${data.edad ?? ''}" placeholder="Años" />
          </div>
          <div class="field">
            <label>Sexo</label>
            <select class="nino-sexo">
              <option value="">—</option>
              <option value="f" ${data.sexo === 'f' ? 'selected' : ''}>Niña</option>
              <option value="m" ${data.sexo === 'm' ? 'selected' : ''}>Niño</option>
              <option value="otro" ${data.sexo === 'otro' ? 'selected' : ''}>Prefiero no decir</option>
            </select>
          </div>
        </div>
      `;
      cont.appendChild(card);
    }
  }

  function collectNinos() {
    return Array.from(document.querySelectorAll('.nino-card')).map(card => ({
      edad: card.querySelector('.nino-edad')?.value || null,
      sexo: card.querySelector('.nino-sexo')?.value || null
    }));
  }

  // === Resumen ===
  function collectFormData() {
    const form = document.getElementById('wizardForm');
    const types = getSelectedTypes();
    const data = {
      cuenta: {
        nombre: form.nombre.value.trim(),
        apellido: form.apellido.value.trim(),
        email: form.email.value.trim(),
        telefono: form.telefono.value.trim(),
        fecha_nacimiento: form.fecha_nacimiento.value || null
      },
      verificacion: {
        dni_foto: dniDataUrl ? true : false,
        selfie: selfieDataUrl ? true : false
      },
      busqueda: {
        tipos: types,
        modalidad: form.modalidad.value || null,
        frecuencia: form.frecuencia.value || null
      },
      detalle: {},
      zona: {
        provincia: form.provincia.value,
        localidad: form.localidad.value.trim(),
        direccion: form.direccion?.value.trim() || null,
        depto: form.depto?.value.trim() || null,
        cp: form.cp?.value.trim() || null
      },
      preferencias: {
        acepta_newsletter: form.acepta_newsletter.checked
      }
    };

    if (types.includes('ninera')) {
      data.detalle.ninera = {
        cantidad_ninos: Number(form.cantidad_ninos.value) || 1,
        ninos: collectNinos(),
        cuidado_especial: form.cuidado_especial.checked,
        cuidado_especial_detalle: form.cuidado_especial_detalle.value.trim() || null
      };
    }
    if (types.includes('adulto_mayor')) {
      data.detalle.adulto_mayor = {
        edad: Number(form.am_edad.value) || null,
        autovalido: form.am_autovalido.value || null,
        patologias: form.am_patologias.value.trim() || null
      };
    }
    if (types.includes('domestica')) {
      data.detalle.domestica = {
        ambientes: Number(form.dom_ambientes.value) || null,
        mascotas: form.dom_mascotas.checked,
        tareas: Array.from(form.querySelectorAll('input[name="dom_tareas"]:checked')).map(i => i.value)
      };
    }
    return data;
  }

  function renderResumen() {
    const d = collectFormData();
    const cont = document.getElementById('resumen');
    const row = (k, v) => v ? `<div class="resumen__row"><span class="k">${k}</span><span class="v">${escapeHtml(v)}</span></div>` : '';

    let html = `
      <div class="resumen__group">
        <h4>Cuenta</h4>
        ${row('Nombre', d.cuenta.nombre + ' ' + d.cuenta.apellido)}
        ${row('Email', d.cuenta.email)}
        ${row('Teléfono', d.cuenta.telefono)}
      </div>
      <div class="resumen__group">
        <h4>Verificación de identidad</h4>
        <div class="resumen__row">
          <span class="k">Foto DNI</span>
          <span class="v resumen__verify ${dniDataUrl ? 'is-ok' : ''}">
            ${dniDataUrl ? '<span class="verify-check">&#10003;</span> Cargada' : 'Pendiente'}
          </span>
        </div>
        <div class="resumen__row">
          <span class="k">Selfie</span>
          <span class="v resumen__verify ${selfieDataUrl ? 'is-ok' : ''}">
            ${selfieDataUrl ? '<span class="verify-check">&#10003;</span> Capturada' : 'Pendiente'}
          </span>
        </div>
        <div class="resumen__row">
          <span class="k">Estado</span>
          <span class="v"><span class="badge badge--pending">Pendiente de revisión</span></span>
        </div>
      </div>
      <div class="resumen__group">
        <h4>Qué buscás</h4>
        ${row('Tipos', d.busqueda.tipos.map(t => ESPECIALIDAD_LABEL[t]).join(', '))}
        ${row('Modalidad', MODALIDAD_LABEL[d.busqueda.modalidad])}
        ${row('Frecuencia', d.busqueda.frecuencia)}
      </div>
    `;

    if (d.detalle.ninera) {
      const n = d.detalle.ninera;
      const ninosTxt = n.ninos.filter(x => x.edad).map(x =>
        `${x.edad} años${x.sexo ? ' (' + ({ f: 'niña', m: 'niño', otro: 's/d' }[x.sexo]) + ')' : ''}`
      ).join(', ');
      html += `
        <div class="resumen__group">
          <h4>Cuidado de niños</h4>
          ${row('Cantidad', String(n.cantidad_ninos))}
          ${row('Edades', ninosTxt || '—')}
          ${n.cuidado_especial ? row('Cuidado especial', n.cuidado_especial_detalle || 'Sí') : ''}
        </div>
      `;
    }
    if (d.detalle.adulto_mayor) {
      const a = d.detalle.adulto_mayor;
      html += `
        <div class="resumen__group">
          <h4>Cuidado de adulto mayor</h4>
          ${row('Edad', a.edad ? a.edad + ' años' : null)}
          ${row('Autonomía', a.autovalido)}
          ${row('Patologías', a.patologias)}
        </div>
      `;
    }
    if (d.detalle.domestica) {
      const x = d.detalle.domestica;
      html += `
        <div class="resumen__group">
          <h4>Tareas del hogar</h4>
          ${row('Ambientes', x.ambientes ? String(x.ambientes) : null)}
          ${row('Tareas', x.tareas.join(', ') || '—')}
          ${row('Mascotas', x.mascotas ? 'Sí' : 'No')}
        </div>
      `;
    }

    html += `
      <div class="resumen__group">
        <h4>Zona</h4>
        ${row('Provincia', d.zona.provincia)}
        ${row('Localidad', d.zona.localidad)}
        ${row('Dirección', d.zona.direccion)}
      </div>
    `;
    cont.innerHTML = html;
  }

  // === Submit ===
  function initSubmit() {
    const form = document.getElementById('wizardForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.acepta_terminos.checked) {
        alert('Tenés que aceptar los términos y condiciones para continuar.');
        return;
      }

      const btn = document.getElementById('btnSubmit');
      btn.disabled = true;
      btn.textContent = 'Creando cuenta…';

      const payload = collectFormData();
      const password = document.getElementById('password').value;
      try {
        // 1. Crear usuario en Supabase Auth
        const authResult = await authRegistro({
          nombre: payload.cuenta.nombre,
          apellido: payload.cuenta.apellido,
          email: payload.cuenta.email,
          telefono: payload.cuenta.telefono,
          password: password,
          zona: payload.zona?.localidad || ''
        });

        // 2. Actualizar la familia con datos extra del wizard
        const session = getSession();
        if (session?.id) {
          await fetch(`${API_BASE}/familias/${session.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              busqueda: payload.busqueda,
              detalle: payload.detalle,
              zona: payload.zona,
              preferencias: payload.preferencias,
              fecha_nacimiento: payload.cuenta.fecha_nacimiento,
              verificacion: {
                dni_foto: dniDataUrl,
                selfie: selfieDataUrl,
                estado: 'pendiente'
              }
            })
          });
        }

        document.getElementById('okModal').classList.remove('hidden');
      } catch (err) {
        alert('No pudimos crear la cuenta: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Crear cuenta';
      }
    });

    // Cerrar modal OK
    document.getElementById('okModal').addEventListener('click', (e) => {
      if (e.target.dataset.close !== undefined) {
        document.getElementById('okModal').classList.add('hidden');
      }
    });
  }

  // === Utils ===
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
})();
