/* Completar perfil de cuidador/a — wizard post-aprobación de identidad
   Se accede desde el email que recibe el cuidador cuando el admin aprueba su identidad.
   URL: /completar-perfil.html?id=UUID&email=xxx@xxx.com
*/
(() => {
  const API_BASE = '/.netlify/functions/api';
  const TOTAL_STEPS = 6; // 0..5
  const DRAFT_KEY = 'qqmc_completar_draft';
  const AUTOSAVE_MS = 1200;

  const DAYS = [
    { id: 'lun', label: 'Lunes' },
    { id: 'mar', label: 'Martes' },
    { id: 'mie', label: 'Miércoles' },
    { id: 'jue', label: 'Jueves' },
    { id: 'vie', label: 'Viernes' },
    { id: 'sab', label: 'Sábado' },
    { id: 'dom', label: 'Domingo' },
  ];
  const FRANJAS = [
    { id: 'manana', label: 'Mañana', desde: '06:00', hasta: '13:00' },
    { id: 'tarde',  label: 'Tarde',  desde: '13:00', hasta: '21:00' },
    { id: 'noche',  label: 'Noche',  desde: '21:00', hasta: '06:00' },
  ];

  const ESPECIALIDAD_LABEL = {
    ninera: 'Niñera', adulto_mayor: 'Adulto mayor',
    domestica: 'Empleada doméstica', cocinera: 'Cocinera'
  };

  const docs = {};
  let fotoPerfil = null;
  let currentStep = 0;
  let autosaveTimer;
  let cuidadorId = null;
  let cuidadorEmail = null;
  let cuidadorData = null;

  document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('year').textContent = new Date().getFullYear();

    // Leer parámetros de URL
    const params = new URLSearchParams(window.location.search);
    cuidadorId = params.get('id');
    cuidadorEmail = params.get('email');

    if (!cuidadorId || !cuidadorEmail) {
      showError('Enlace inválido', 'Este enlace no tiene los parámetros necesarios. Revisá el email que te enviamos.');
      return;
    }

    // Verificar que el cuidador existe y está en estado correcto
    try {
      const res = await fetch(`${API_BASE}/cuidadores/me?email=${encodeURIComponent(cuidadorEmail)}`);
      const json = await res.json();
      if (!json.ok || !json.data) {
        showError('No encontramos tu registro', 'Revisá el enlace del email o contactanos.');
        return;
      }
      cuidadorData = json.data;
      if (cuidadorData.id !== cuidadorId) {
        showError('Enlace inválido', 'Los datos del enlace no coinciden con tu registro.');
        return;
      }
      if (cuidadorData.estado !== 'identidad_aprobada') {
        if (cuidadorData.perfil_completo || cuidadorData.estado === 'perfil_completo') {
          showError('Perfil ya completado', 'Ya completaste tu perfil. Nuestro equipo está revisándolo. Te avisamos por email cuando tengamos novedades.');
        } else if (cuidadorData.estado === 'enviado') {
          showError('Identidad en revisión', 'Tu identidad todavía está siendo revisada. Te avisamos por email cuando esté lista.');
        } else {
          showError('Estado no permitido', `Tu perfil está en estado "${cuidadorData.estado}". Si creés que es un error, contactanos.`);
        }
        return;
      }
    } catch (err) {
      showError('Error de conexión', 'No pudimos verificar tu registro. Intentá de nuevo en unos minutos.');
      return;
    }

    // Todo OK, mostrar wizard
    document.getElementById('cuidNombre').textContent = cuidadorData.nombre;
    initNavigation();
    initAvailabilityGrid();
    initEmpleos();
    initReferencias();
    initUploads();
    initBioCounter();
    initAutosave();
    initSubmit();
    loadDraft();
    updateStepUI();
  });

  function showError(title, msg) {
    document.getElementById('wizardMain').style.display = 'none';
    document.getElementById('errorScreen').style.display = 'block';
    document.getElementById('errorTitle').textContent = title;
    document.getElementById('errorMsg').textContent = msg;
  }

  // === Navegación ===
  function initNavigation() {
    document.getElementById('btnPrev').addEventListener('click', () => goTo(currentStep - 1));
    document.getElementById('btnNext').addEventListener('click', () => {
      if (!validateStep(currentStep)) return;
      goTo(currentStep + 1);
    });
  }
  function goTo(step) {
    step = Math.max(0, Math.min(TOTAL_STEPS - 1, step));
    currentStep = step;
    updateStepUI();
    if (step === TOTAL_STEPS - 1) renderPerfilPreview();
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
      if (!markIfEmpty('bio')) return false;
      if (form.bio.value.length < 80) { markError('bio', 'Contanos un poco más (mínimo 80 caracteres)'); return false; }
      if (!markIfEmpty('experiencia_anios')) return false;
    }
    if (step === 2) {
      if (!markIfEmpty('zonas_trabajo')) return false;
      const disp = collectAvailability();
      if (!Object.keys(disp).length) { alert('Marcá al menos un día con horario disponible.'); return false; }
    }
    if (step === 4) {
      const refs = collectReferencias();
      if (refs.length < 1) { alert('Agregá al menos 1 referencia.'); return false; }
      if (refs.some(r => !r.nombre || !r.telefono)) { alert('Completá nombre y teléfono de todas las referencias.'); return false; }
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
      const e = f.querySelector('.field__error'); if (e) e.remove();
    });
  }

  // === Bio counter ===
  function initBioCounter() {
    const bio = document.getElementById('bio');
    const cnt = document.getElementById('bioCount');
    bio.addEventListener('input', () => {
      cnt.textContent = bio.value.length;
      if (bio.value.length > 400) bio.value = bio.value.slice(0, 400);
    });
  }

  // === Availability grid ===
  function buildTimeOptions(minH, maxH) {
    const opts = [];
    if (maxH >= minH) {
      for (let h = minH; h <= maxH; h++) opts.push(String(h).padStart(2, '0') + ':00');
    } else {
      for (let h = minH; h <= 23; h++) opts.push(String(h).padStart(2, '0') + ':00');
      for (let h = 0; h <= maxH; h++) opts.push(String(h).padStart(2, '0') + ':00');
    }
    return opts;
  }
  const FRANJA_OPTIONS = {
    manana: buildTimeOptions(6, 13),
    tarde:  buildTimeOptions(13, 21),
    noche:  buildTimeOptions(21, 6),
  };
  function timeSelectHTML(cls, day, franjaId, defaultVal, disabled) {
    const options = FRANJA_OPTIONS[franjaId];
    return `<select class="${cls}" data-day="${day}" data-franja="${franjaId}" ${disabled ? 'disabled' : ''}>
      ${options.map(t => `<option value="${t}" ${t === defaultVal ? 'selected' : ''}>${t}</option>`).join('')}
    </select>`;
  }
  function initAvailabilityGrid() {
    const grid = document.getElementById('availabilityGrid');
    grid.innerHTML = DAYS.map(d => `
      <div class="availability__row" data-day="${d.id}">
        <span class="day-name">${d.label}</span>
        ${FRANJAS.map(f => `
          <div class="availability__franja" data-day="${d.id}" data-franja="${f.id}">
            <label class="franja-toggle">
              <input type="checkbox" class="franja-check" data-day="${d.id}" data-franja="${f.id}" aria-label="${d.label} ${f.label}" />
              <span class="franja-label-mobile">${f.label}</span>
            </label>
            <div class="franja-times">
              ${timeSelectHTML('time-desde', d.id, f.id, f.desde, true)}
              <span class="franja-sep">–</span>
              ${timeSelectHTML('time-hasta', d.id, f.id, f.hasta, true)}
            </div>
          </div>
        `).join('')}
      </div>
    `).join('');

    grid.querySelectorAll('.franja-check').forEach(chk => {
      chk.addEventListener('change', () => {
        const { day, franja } = chk.dataset;
        const cell = grid.querySelector(`.availability__franja[data-day="${day}"][data-franja="${franja}"]`);
        const desde = cell.querySelector('.time-desde');
        const hasta = cell.querySelector('.time-hasta');
        desde.disabled = !chk.checked;
        hasta.disabled = !chk.checked;
        cell.classList.toggle('is-active', chk.checked);
        const row = grid.querySelector(`.availability__row[data-day="${day}"]`);
        row.classList.toggle('is-active', row.querySelectorAll('.franja-check:checked').length > 0);
        triggerAutosave();
      });
    });
  }
  function collectAvailability() {
    const out = {};
    document.querySelectorAll('#availabilityGrid .franja-check:checked').forEach(chk => {
      const { day, franja } = chk.dataset;
      const cell = document.querySelector(`#availabilityGrid .availability__franja[data-day="${day}"][data-franja="${franja}"]`);
      const desde = cell.querySelector('.time-desde').value;
      const hasta = cell.querySelector('.time-hasta').value;
      if (desde && hasta) {
        if (!out[day]) out[day] = {};
        out[day][franja] = { desde, hasta };
      }
    });
    return out;
  }

  // === Empleos repeater ===
  function initEmpleos() {
    document.getElementById('btnAddEmpleo').addEventListener('click', () => addEmpleo());
    addEmpleo();
  }
  function addEmpleo(data = {}) {
    const cont = document.getElementById('empleosContainer');
    const idx = cont.children.length;
    const card = document.createElement('div');
    card.className = 'nino-card';
    card.innerHTML = `
      <div class="nino-card__head">
        <span class="nino-card__title">Empleo ${idx + 1}</span>
        <button type="button" class="nino-card__remove">Eliminar</button>
      </div>
      <div class="field-row">
        <div class="field"><label>Familia / empleador</label><input type="text" class="emp-familia" placeholder="Ej: Familia Pérez" value="${data.familia || ''}" /></div>
        <div class="field"><label>Duración</label><input type="text" class="emp-duracion" placeholder="Ej: 2022 – 2024" value="${data.duracion || ''}" /></div>
      </div>
      <div class="field"><label>Tareas / responsabilidades</label><textarea class="emp-tareas" rows="2" placeholder="Qué hacías en este empleo">${data.tareas || ''}</textarea></div>
    `;
    card.querySelector('.nino-card__remove').addEventListener('click', () => { card.remove(); renumberEmpleos(); });
    cont.appendChild(card);
  }
  function renumberEmpleos() {
    document.querySelectorAll('#empleosContainer .nino-card__title').forEach((el, i) => el.textContent = `Empleo ${i + 1}`);
  }
  function collectEmpleos() {
    return Array.from(document.querySelectorAll('#empleosContainer .nino-card')).map(c => ({
      familia: c.querySelector('.emp-familia').value.trim(),
      duracion: c.querySelector('.emp-duracion').value.trim(),
      tareas: c.querySelector('.emp-tareas').value.trim()
    })).filter(e => e.familia || e.tareas);
  }

  // === Referencias repeater ===
  function initReferencias() {
    document.getElementById('btnAddReferencia').addEventListener('click', () => addReferencia());
    addReferencia();
  }
  function addReferencia(data = {}) {
    const cont = document.getElementById('referenciasContainer');
    const idx = cont.children.length;
    const card = document.createElement('div');
    card.className = 'nino-card';
    card.innerHTML = `
      <div class="nino-card__head">
        <span class="nino-card__title">Referencia ${idx + 1}</span>
        <button type="button" class="nino-card__remove">Eliminar</button>
      </div>
      <div class="field-row">
        <div class="field"><label>Nombre *</label><input type="text" class="ref-nombre" value="${data.nombre || ''}" /></div>
        <div class="field"><label>Relación</label><input type="text" class="ref-relacion" placeholder="Ej: Ex-empleadora" value="${data.relacion || ''}" /></div>
      </div>
      <div class="field"><label>Teléfono *</label><input type="tel" class="ref-telefono" value="${data.telefono || ''}" /></div>
    `;
    card.querySelector('.nino-card__remove').addEventListener('click', () => { card.remove(); renumberReferencias(); });
    cont.appendChild(card);
  }
  function renumberReferencias() {
    document.querySelectorAll('#referenciasContainer .nino-card__title').forEach((el, i) => el.textContent = `Referencia ${i + 1}`);
  }
  function collectReferencias() {
    return Array.from(document.querySelectorAll('#referenciasContainer .nino-card')).map(c => ({
      nombre: c.querySelector('.ref-nombre').value.trim(),
      relacion: c.querySelector('.ref-relacion').value.trim(),
      telefono: c.querySelector('.ref-telefono').value.trim()
    })).filter(r => r.nombre || r.telefono);
  }

  // === Uploads ===
  function initUploads() {
    const fotoInput = document.getElementById('fotoPerfil');
    fotoInput.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      if (!f.type.startsWith('image/')) { alert('Subí una imagen.'); return; }
      if (f.size > 5 * 1024 * 1024) { alert('Máximo 5MB.'); return; }
      const dataUrl = await readAsDataURL(f);
      fotoPerfil = { name: f.name, type: f.type, size: f.size, dataUrl };
      const prev = document.getElementById('avatarPreview');
      prev.style.backgroundImage = `url(${dataUrl})`;
      prev.classList.add('has-image');
      triggerAutosave();
    });

    document.querySelectorAll('.doc-card').forEach(card => {
      const input = card.querySelector('input[type="file"]');
      const docKey = card.dataset.doc;
      input.addEventListener('change', async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (f.size > 10 * 1024 * 1024) { alert('Máximo 10MB.'); return; }
        docs[docKey] = {
          name: f.name, type: f.type, size: f.size,
          dataUrl: await readAsDataURL(f)
        };
        card.classList.add('is-loaded');
        card.querySelector('.doc-card__ph').textContent = `${f.name} (${formatSize(f.size)})`;
        triggerAutosave();
      });
    });
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  function formatSize(b) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  // === Autosave ===
  function initAutosave() {
    const form = document.getElementById('wizardForm');
    form.addEventListener('input', triggerAutosave);
    form.addEventListener('change', triggerAutosave);
  }
  function triggerAutosave() {
    const status = document.getElementById('saveStatus');
    status.textContent = 'Guardando…'; status.classList.add('is-saving');
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      const draft = collectFormData({ includeFiles: false });
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        status.textContent = 'Borrador guardado ✓'; status.classList.remove('is-saving');
      } catch {
        status.textContent = 'Borrador guardado'; status.classList.remove('is-saving');
      }
    }, AUTOSAVE_MS);
  }
  function loadDraft() {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      // Solo cargar si es del mismo cuidador
      if (d._cuidadorId !== cuidadorId) return;
      if (!confirm('Encontramos un borrador anterior. ¿Querés continuar desde donde dejaste?')) {
        localStorage.removeItem(DRAFT_KEY); return;
      }
      applyDraft(d);
    } catch {}
  }
  function applyDraft(d) {
    const form = document.getElementById('wizardForm');
    const setIf = (name, val) => { if (form[name] != null && val != null) form[name].value = val; };
    setIf('bio', d.bio);
    if (d.bio) document.getElementById('bioCount').textContent = d.bio.length;
    setIf('experiencia_anios', d.experiencia_anios);
    setIf('tarifa_hora', d.tarifa_hora);
    setIf('educacion', d.educacion);
    (d.certificaciones || []).forEach(v => {
      const c = form.querySelector(`input[name="certificaciones"][value="${v}"]`); if (c) c.checked = true;
    });
    setIf('certificaciones_otras', d.certificaciones_otras);
    setIf('idiomas', d.idiomas);
    setIf('zonas_trabajo', d.zonas_trabajo);
    setIf('radio_km', d.radio_km);
    (d.modalidades || []).forEach(v => {
      const c = form.querySelector(`input[name="modalidades"][value="${v}"]`); if (c) c.checked = true;
    });
    // Disponibilidad
    Object.entries(d.disponibilidad || {}).forEach(([day, franjas]) => {
      const row = document.querySelector(`#availabilityGrid .availability__row[data-day="${day}"]`);
      if (!row) return;
      Object.entries(franjas).forEach(([franja, rango]) => {
        const chk = row.querySelector(`.franja-check[data-franja="${franja}"]`);
        if (!chk) return;
        chk.checked = true;
        const cell = row.querySelector(`.availability__franja[data-franja="${franja}"]`);
        cell.classList.add('is-active');
        cell.querySelector('.time-desde').disabled = false;
        cell.querySelector('.time-hasta').disabled = false;
        if (rango.desde) cell.querySelector('.time-desde').value = rango.desde;
        if (rango.hasta) cell.querySelector('.time-hasta').value = rango.hasta;
      });
      row.classList.add('is-active');
    });
    // Empleos
    if (d.empleos?.length) {
      document.getElementById('empleosContainer').innerHTML = '';
      d.empleos.forEach(e => addEmpleo(e));
    }
    // Referencias
    if (d.referencias?.length) {
      document.getElementById('referenciasContainer').innerHTML = '';
      d.referencias.forEach(r => addReferencia(r));
    }
  }

  // === Recolección de datos ===
  function collectFormData({ includeFiles = true } = {}) {
    const form = document.getElementById('wizardForm');
    const val = id => document.getElementById(id)?.value?.trim() || null;
    const multi = name => Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map(i => i.value);

    const sanitizedDocs = {};
    Object.entries(docs).forEach(([k, v]) => {
      sanitizedDocs[k] = includeFiles
        ? { name: v.name, type: v.type, size: v.size, data_url: (v.dataUrl && v.size <= 2 * 1024 * 1024) ? v.dataUrl : null }
        : { name: v.name, type: v.type, size: v.size };
    });

    return {
      _cuidadorId: cuidadorId,
      bio: val('bio'),
      experiencia_anios: Number(val('experiencia_anios')) || 0,
      tarifa_hora: Number(val('tarifa_hora')) || null,
      empleos: collectEmpleos(),
      educacion: val('educacion') || form.querySelector('input[name="educacion"]:checked')?.value || null,
      certificaciones: multi('certificaciones'),
      certificaciones_otras: val('certificaciones_otras'),
      idiomas: val('idiomas'),
      disponibilidad: collectAvailability(),
      modalidades: multi('modalidades'),
      zonas_trabajo: val('zonas_trabajo'),
      radio_km: Number(val('radio_km')) || null,
      antecedentes_fecha: val('antecedentes_fecha'),
      documentos: sanitizedDocs,
      referencias: collectReferencias(),
      foto_perfil: includeFiles ? fotoPerfil : (fotoPerfil ? { name: fotoPerfil.name } : null)
    };
  }

  // === Preview del perfil ===
  function renderPerfilPreview() {
    const d = collectFormData({ includeFiles: true });
    const nombre = cuidadorData ? `${cuidadorData.nombre} ${cuidadorData.apellido || ''}`.trim() : '';
    const espTags = (cuidadorData?.especialidades || []).map(e => `<span class="tag">${ESPECIALIDAD_LABEL[e] || e}</span>`).join('');
    const certTags = (d.certificaciones || []).map(c => `<span class="tag tag--magenta">${c.replace(/_/g, ' ')}</span>`).join('');

    const FRANJA_LABEL = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };
    const FRANJA_IDS = ['manana', 'tarde', 'noche'];
    let dispGrid = '<div class="disp-preview">';
    dispGrid += '<div class="disp-preview__row disp-preview__header"><span class="disp-preview__day"></span>';
    FRANJA_IDS.forEach(f => { dispGrid += `<span class="disp-preview__cell disp-preview__cell--header">${FRANJA_LABEL[f]}</span>`; });
    dispGrid += '</div>';
    DAYS.forEach(day => {
      const franjas = (d.disponibilidad || {})[day.id];
      const anyActive = franjas && Object.values(franjas).some(r => r && r.desde);
      dispGrid += `<div class="disp-preview__row ${anyActive ? 'disp-preview__row--on' : ''}"><span class="disp-preview__day">${day.label}</span>`;
      FRANJA_IDS.forEach(f => {
        const r = franjas && franjas[f];
        dispGrid += r && r.desde
          ? `<span class="disp-preview__cell disp-preview__cell--on">${r.desde}–${r.hasta}</span>`
          : '<span class="disp-preview__cell disp-preview__cell--off">—</span>';
      });
      dispGrid += '</div>';
    });
    dispGrid += '</div>';

    document.getElementById('perfilPreview').innerHTML = `
      <div class="perfil-preview__head">
        <div class="perfil-preview__avatar" style="${d.foto_perfil?.dataUrl ? `background-image:url(${d.foto_perfil.dataUrl})` : ''}"></div>
        <div>
          <h3 class="perfil-preview__name">${esc(nombre)}</h3>
          <div class="perfil-preview__tags">${espTags}</div>
          <div class="perfil-preview__tags" style="margin-top:4px">${certTags}</div>
        </div>
      </div>
      <div class="perfil-preview__section"><h5>Sobre mí</h5><p>${esc(d.bio || '—')}</p></div>
      <div class="perfil-preview__section"><h5>Experiencia</h5><p>${d.experiencia_anios} años · ${d.empleos.length} empleo(s)</p></div>
      <div class="perfil-preview__section"><h5>Disponibilidad</h5>${dispGrid}</div>
      <div class="perfil-preview__section"><h5>Zona</h5><p>${esc(d.zonas_trabajo || '—')} (hasta ${d.radio_km || '—'} km)</p></div>
      <div class="perfil-preview__section"><h5>Referencias</h5><p>${d.referencias.length} referencia(s) cargada(s)</p></div>
    `;
  }

  // === Submit ===
  function initSubmit() {
    document.getElementById('wizardForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnSubmit');
      btn.disabled = true; btn.textContent = 'Enviando…';

      const payload = collectFormData({ includeFiles: true });
      delete payload._cuidadorId;
      delete payload.foto_perfil; // TODO: subir a storage en una próxima etapa

      try {
        const res = await fetch(`${API_BASE}/cuidadores/${cuidadorId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || (json.detalles || []).join(', ') || 'Error al enviar');

        // GA4
        if (window.CuidyAnalytics) {
          CuidyAnalytics.track('perfil_completado', { user_type: 'cuidador', cuidador_id: cuidadorId });
        }

        localStorage.removeItem(DRAFT_KEY);

        // Mostrar pantalla de éxito
        document.getElementById('wizardMain').innerHTML = `
          <div class="container" style="text-align:center; padding:80px 20px">
            <div style="font-size:48px; margin-bottom:16px">🎉</div>
            <h1 class="wizard__title">¡Perfil completado!</h1>
            <p style="max-width:480px; margin:16px auto; color: var(--noche); opacity:.8; line-height:1.6">
              Gracias ${cuidadorData?.nombre || ''}. Nuestro equipo va a revisar tu perfil y te contacta para coordinar la entrevista virtual.
              Te avisamos por email a <strong>${cuidadorEmail}</strong>.
            </p>
            <a href="/" class="btn btn--primary" style="margin-top:24px">Ir al inicio</a>
          </div>
        `;
      } catch (err) {
        alert('No pudimos enviar tu perfil: ' + err.message);
        btn.disabled = false; btn.textContent = 'Enviar perfil completo';
      }
    });
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
})();
