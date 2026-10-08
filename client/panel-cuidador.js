/* =============================================================
   Cuidy · Panel del Cuidador
   Secciones: Dashboard, Mis datos, Capacitaciones, Mi perfil público
   ============================================================= */
(() => {
  const API = '/.netlify/functions/api';
  const STORAGE_KEY = 'qqmc_cuidador';

  const ESP_LABEL = {
    ninera: 'Niñera', adulto_mayor: 'Adulto mayor',
    domestica: 'Empleada doméstica', cocinera: 'Cocinera'
  };
  const MOD_LABEL = {
    full_time: 'Full time', part_time: 'Part time',
    por_hora: 'Por hora', eventual: 'Eventual'
  };

  let cuidador = null;

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('year').textContent = new Date().getFullYear();

    cuidador = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!cuidador?.id) {
      window.location.href = '/login.html?rol=cuidador';
      return;
    }

    // Header
    document.getElementById('cuidName').textContent = cuidador.nombre || 'Cuidador';
    document.getElementById('cuidAvatar').textContent = (cuidador.nombre || 'C').charAt(0).toUpperCase();

    // Logout
    document.getElementById('btnLogout').addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      window.location.href = '/';
    });

    // Tabs
    initTabs();

    // Banner de estado
    renderEstadoBanner();

    // Cargar sección inicial
    loadDashboard();
    loadMisDatos();
  });

  // === Banner de estado ===
  function renderEstadoBanner() {
    const banner = document.getElementById('bannerEstado');
    const estado = cuidador.estado;
    if (!estado || estado === 'aprobado') {
      if (estado === 'aprobado') {
        banner.className = 'panel-estado panel-estado--aprobado';
        document.getElementById('estadoIcon').innerHTML = icon('checkCircle', 'success');
        document.getElementById('estadoTitle').textContent = 'Tu perfil está activo';
        document.getElementById('estadoText').textContent = 'Las familias pueden ver tu perfil y contactarte.';
        banner.classList.remove('hidden');
      }
      return;
    }

    const config = {
      enviado: {
        icon: icon('hourglass', 'warning'),
        title: 'Tu registro está en revisión',
        text: 'Nuestro equipo está verificando tu identidad. Esto puede tomar 24 a 48 horas. Te avisamos por WhatsApp cuando esté listo. Mientras tanto, podés completar tus datos personales.',
        cta: null
      },
      identidad_aprobada: {
        icon: icon('fileText'),
        title: 'Identidad verificada — completá tu perfil',
        text: 'Tu identidad fue aprobada. Te avisamos por WhatsApp con el link para completar tu perfil profesional. También podés hacerlo desde acá.',
        cta: { text: 'Completar perfil', href: 'completar-perfil.html?email=' + encodeURIComponent(cuidador.email) }
      },
      perfil_completo: {
        icon: icon('search'),
        title: 'Tu perfil está en revisión final',
        text: 'Recibimos tu perfil profesional. Nuestro equipo lo está revisando y te vamos a contactar por WhatsApp para coordinar la entrevista virtual.',
        cta: null
      },
      rechazado: {
        icon: icon('xCircle', 'danger'),
        title: 'Tu perfil no fue aprobado',
        text: 'Lamentablemente tu registro no pasó la verificación. Si creés que hubo un error, escribinos a soporte@cuidy.com.ar.',
        cta: null
      }
    };

    const c = config[estado];
    if (!c) return;

    banner.className = `panel-estado panel-estado--${estado}`;
    document.getElementById('estadoIcon').innerHTML = c.icon;
    document.getElementById('estadoTitle').textContent = c.title;
    document.getElementById('estadoText').textContent = c.text;

    const ctaBtn = document.getElementById('estadoCTA');
    if (c.cta) {
      ctaBtn.textContent = c.cta.text;
      ctaBtn.href = c.cta.href;
      ctaBtn.classList.remove('hidden');
    } else {
      ctaBtn.classList.add('hidden');
    }

    banner.classList.remove('hidden');
  }

  // === Tabs ===
  function initTabs() {
    document.querySelectorAll('.panel-nav__tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.panel-nav__tab').forEach(t => t.classList.remove('is-active'));
        document.querySelectorAll('.panel-section').forEach(s => s.classList.remove('is-active'));
        tab.classList.add('is-active');
        const sec = tab.dataset.section;
        document.getElementById('sec' + sec.charAt(0).toUpperCase() + sec.slice(1)).classList.add('is-active');

        if (sec === 'perfil') loadPerfilPreview();
        if (sec === 'capacitaciones') loadCapacitaciones();
      });
    });
  }

  // === Dashboard (C01) ===
  async function loadDashboard() {
    // Greeting
    const nombre = cuidador.nombre || 'Cuidador';
    document.getElementById('dashGreeting').textContent = `Hola, ${nombre}`;

    // Fetch stats
    try {
      const res = await fetch(`${API}/red/cuidador-stats?cuidador_id=${cuidador.id}`);
      const json = await res.json();
      if (json.ok) {
        const d = json.data;
        document.getElementById('statRecs').textContent = d.recomendaciones ?? 0;
        document.getElementById('statContactos').textContent = d.contactos_activos ?? 0;
        document.getElementById('statNuevos').textContent = d.nuevos_7d ?? 0;

        // Visibility badge
        const recs = d.recomendaciones ?? 0;
        const visEl = document.getElementById('dashVisibility');
        if (recs > 0) {
          visEl.innerHTML = `<span class="dash-badge dash-badge--active">${icon('eye')} Visible en ${recs} red${recs > 1 ? 'es' : ''}</span>`;
        } else {
          visEl.innerHTML = '<span class="dash-badge dash-badge--inactive">Aún no tenés recomendaciones</span>';
        }
      }
    } catch {
      document.getElementById('statRecs').textContent = '—';
      document.getElementById('statContactos').textContent = '—';
      document.getElementById('statNuevos').textContent = '—';
    }

    // Fetch recent recommendations
    try {
      const res = await fetch(`${API}/red/mis-recomendaciones?cuidador_id=${cuidador.id}`);
      const json = await res.json();
      const container = document.getElementById('dashRecomendaciones');
      if (json.ok && json.data?.length) {
        const cards = json.data.slice(0, 5).map(r => {
          const nombre = `${r.familia_nombre || 'Familia'} ${(r.familia_apellido || '').charAt(0)}.`.trim();
          const fecha = r.created_at ? new Date(r.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '';
          return `
            <div class="dash-rec-card">
              <div class="dash-rec-card__icon">${icon('heart')}</div>
              <div class="dash-rec-card__body">
                <strong>${esc(nombre)}</strong> te recomendó
                ${r.comentario ? `<p class="dash-rec-card__quote">"${esc(r.comentario)}"</p>` : ''}
              </div>
              <span class="dash-rec-card__date">${fecha}</span>
            </div>`;
        }).join('');
        container.innerHTML = `
          <h3 class="dash-subtitle">${icon('heart')} Mis recomendaciones</h3>
          ${cards}`;
      } else {
        container.innerHTML = `
          <div class="dash-empty">
            ${icon('heart')}
            <p>Todavía no recibiste recomendaciones. Cuando una familia te recomiende, vas a verlo acá.</p>
          </div>`;
      }
    } catch {
      document.getElementById('dashRecomendaciones').innerHTML = '';
    }

    // Fetch new contacts (últimos 7 días)
    try {
      const res = await fetch(`${API}/red/contactos?cuidador_id=${cuidador.id}&limit=5`);
      const json = await res.json();
      const container = document.getElementById('dashNuevos');
      if (json.ok && json.data?.length) {
        const recent = json.data.filter(c => {
          if (!c.created_at) return false;
          const diff = Date.now() - new Date(c.created_at).getTime();
          return diff < 7 * 24 * 60 * 60 * 1000;
        });
        if (recent.length) {
          const cards = recent.map(c => {
            const fam = c.familia || c.familias || {};
            const nombre = `${fam.nombre || 'Familia'} ${(fam.apellido || '').charAt(0)}.`.trim();
            return `
              <div class="dash-nuevo-card">
                <div class="dash-nuevo-card__avatar">${(fam.nombre || 'F').charAt(0).toUpperCase()}</div>
                <div class="dash-nuevo-card__body">
                  <strong>${esc(nombre)}</strong>
                  <span class="dash-nuevo-card__label">Nuevo contacto</span>
                </div>
                <button class="m-btn m-btn--primary dash-nuevo-card__action" style="padding:6px 14px;font-size:12px" onclick="window.open('https://wa.me/${(fam.telefono || '').replace(/\D/g,'')}','_blank')">
                  ${icon('messageCircle')} Contactar
                </button>
              </div>`;
          }).join('');
          container.innerHTML = `
            <h3 class="dash-subtitle">${icon('userPlus')} Nuevas solicitudes</h3>
            ${cards}`;
        }
      }
    } catch {}
  }

  // === Capacitaciones (C03) ===
  async function loadCapacitaciones() {
    const listEl = document.getElementById('capList');
    const countEl = document.getElementById('capCount');
    const fillEl = document.getElementById('capFill');

    // Definir capacitaciones disponibles
    const capacitaciones = [
      { id: 'rcp', nombre: 'RCP y primeros auxilios', descripcion: 'Técnicas básicas de reanimación y primeros auxilios para emergencias domésticas.', duracion: '2 horas' },
      { id: 'adulto_mayor', nombre: 'Cuidado del adulto mayor', descripcion: 'Buenas prácticas para el acompañamiento y cuidado de personas mayores.', duracion: '3 horas' },
      { id: 'estimulacion', nombre: 'Estimulación cognitiva', descripcion: 'Herramientas para estimular el desarrollo cognitivo en niños y adultos.', duracion: '2 horas' }
    ];

    // Fetch evaluaciones del cuidador
    let completadas = [];
    try {
      const res = await fetch(`${API}/evaluaciones?cuidador_id=${cuidador.id}`);
      const json = await res.json();
      if (json.ok && json.data) {
        completadas = json.data
          .filter(e => e.aprobado || e.completado)
          .map(e => e.tipo || e.capacitacion_id || e.nombre);
      }
    } catch {}

    // Update progress bar
    const total = capacitaciones.length;
    const done = Math.min(completadas.length, total);
    countEl.textContent = `${done}/${total}`;
    fillEl.style.width = total > 0 ? `${(done / total) * 100}%` : '0%';

    // Render cards
    const cards = capacitaciones.map(cap => {
      const isDone = completadas.includes(cap.id);
      return `
        <div class="cap-card ${isDone ? 'cap-card--done' : ''}">
          <div class="cap-card__header">
            <div class="cap-card__icon">${isDone ? icon('checkCircle', 'success') : icon('bookOpen')}</div>
            <div class="cap-card__info">
              <h4 class="cap-card__name">${esc(cap.nombre)}</h4>
              <span class="cap-card__duracion">${icon('clock')} ${esc(cap.duracion)}</span>
            </div>
            ${isDone
              ? '<span class="cap-card__badge cap-card__badge--done">Completada</span>'
              : '<span class="cap-card__badge cap-card__badge--pending">Pendiente</span>'}
          </div>
          <p class="cap-card__desc">${esc(cap.descripcion)}</p>
          ${isDone
            ? ''
            : '<button class="m-btn m-btn--teal cap-card__btn" style="padding:6px 14px;font-size:12px">Empezar</button>'}
        </div>`;
    }).join('');

    listEl.innerHTML = cards || '<p class="panel-loading">No hay capacitaciones disponibles.</p>';
  }

  // === Mis Datos ===
  function loadMisDatos() {
    document.getElementById('cdNombre').value = cuidador.nombre || '';
    document.getElementById('cdApellido').value = cuidador.apellido || '';
    document.getElementById('cdEmail').value = cuidador.email || '';
    document.getElementById('cdTelefono').value = cuidador.telefono || '';
    document.getElementById('cdProvincia').value = cuidador.provincia || '';
    document.getElementById('cdLocalidad').value = cuidador.localidad || '';
    document.getElementById('cdBio').value = cuidador.bio || '';
    document.getElementById('cdZonasTrabajo').value = cuidador.zonas_trabajo || '';
    document.getElementById('cdValorMin').value = cuidador.valor_hora_min || '';
    document.getElementById('cdValorMax').value = cuidador.valor_hora_max || '';

    // Especialidades
    const esp = cuidador.especialidades || [];
    document.getElementById('cdEspNinera').checked = esp.includes('ninera');
    document.getElementById('cdEspAdulto').checked = esp.includes('adulto_mayor');
    document.getElementById('cdEspDomestica').checked = esp.includes('domestica');
    document.getElementById('cdEspCocinera').checked = esp.includes('cocinera');

    // Modalidad (primer elemento del array modalidades o string)
    const mod = Array.isArray(cuidador.modalidades) ? cuidador.modalidades[0] : (cuidador.modalidades || '');
    document.getElementById('cdModalidad').value = mod;

    // Form submit
    document.getElementById('formMisDatosCuid').addEventListener('submit', guardarDatos);
  }

  async function guardarDatos(e) {
    e.preventDefault();
    const nombre = document.getElementById('cdNombre').value.trim();
    const apellido = document.getElementById('cdApellido').value.trim();
    if (!nombre) { alert('El nombre es obligatorio'); return; }

    const especialidades = [];
    if (document.getElementById('cdEspNinera').checked) especialidades.push('ninera');
    if (document.getElementById('cdEspAdulto').checked) especialidades.push('adulto_mayor');
    if (document.getElementById('cdEspDomestica').checked) especialidades.push('domestica');
    if (document.getElementById('cdEspCocinera').checked) especialidades.push('cocinera');

    const modalidad = document.getElementById('cdModalidad').value;

    const body = {
      accion: 'editar_datos',
      nombre,
      apellido,
      telefono: document.getElementById('cdTelefono').value.trim(),
      provincia: document.getElementById('cdProvincia').value,
      localidad: document.getElementById('cdLocalidad').value.trim(),
      especialidades,
      bio: document.getElementById('cdBio').value.trim(),
      modalidades: modalidad ? [modalidad] : [],
      zonas_trabajo: document.getElementById('cdZonasTrabajo').value.trim(),
      valor_hora_min: parseInt(document.getElementById('cdValorMin').value) || null,
      valor_hora_max: parseInt(document.getElementById('cdValorMax').value) || null
    };

    const btn = document.getElementById('btnGuardarCuid');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    try {
      const res = await fetch(`${API}/cuidadores/${cuidador.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (json.ok) {
        Object.assign(cuidador, json.data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cuidador));
        document.getElementById('cuidName').textContent = cuidador.nombre;
        document.getElementById('cuidAvatar').textContent = cuidador.nombre.charAt(0).toUpperCase();

        const msg = document.getElementById('cdMsg');
        msg.innerHTML = icon('check', 'success') + ' Datos actualizados correctamente';
        msg.className = 'panel-form__msg panel-form__msg--ok';
        msg.classList.remove('hidden');
        setTimeout(() => msg.classList.add('hidden'), 4000);
      } else {
        alert(json.error || 'Error al guardar');
      }
    } catch {
      alert('Sin conexión. Intentá nuevamente.');
    }
    btn.disabled = false;
    btn.textContent = 'Guardar cambios';
  }

  // === Perfil público (preview) ===
  async function loadPerfilPreview() {
    const container = document.getElementById('perfilPreview');

    // Refrescar datos del cuidador
    try {
      const res = await fetch(`${API}/cuidadores/me?email=${encodeURIComponent(cuidador.email)}`);
      const json = await res.json();
      if (json.ok) {
        Object.assign(cuidador, json.data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cuidador));
      }
    } catch {}

    const c = cuidador;
    const espTags = (c.especialidades || [])
      .map(e => `<span class="perfil-preview__tag">${ESP_LABEL[e] || e}</span>`).join('');

    const modalidades = (c.modalidades || [])
      .map(m => MOD_LABEL[m] || m).join(', ') || '—';

    const avatarContent = c.foto_url
      ? `<img src="${esc(c.foto_url)}" alt="${esc(c.nombre)}" />`
      : esc((c.nombre || 'C').charAt(0).toUpperCase());

    let tarifa = '—';
    if (c.valor_hora_min && c.valor_hora_max) tarifa = `$${c.valor_hora_min} - $${c.valor_hora_max}/hora`;
    else if (c.valor_hora_min) tarifa = `Desde $${c.valor_hora_min}/hora`;
    else if (c.valor_hora_max) tarifa = `Hasta $${c.valor_hora_max}/hora`;

    container.innerHTML = `
      <div class="perfil-preview__header">
        <div class="perfil-preview__avatar">${avatarContent}</div>
        <div>
          <div class="perfil-preview__name">${esc(c.nombre)} ${esc((c.apellido || '').charAt(0))}.</div>
          <div class="perfil-preview__ubicacion">${esc(c.localidad || '')}${c.provincia ? ', ' + esc(c.provincia) : ''}</div>
        </div>
      </div>
      <div class="perfil-preview__tags">${espTags || '<span style="color:var(--muted)">Sin especialidades definidas</span>'}</div>
      ${c.bio ? `<p class="perfil-preview__bio">${esc(c.bio)}</p>` : '<p class="perfil-preview__bio" style="color:var(--muted); font-style:italic">No completaste tu bio todavía. Agregala en "Mis datos".</p>'}
      <div class="perfil-preview__detail">
        <span class="perfil-preview__detail-label">Modalidad</span>
        <span class="perfil-preview__detail-value">${esc(modalidades)}</span>
      </div>
      <div class="perfil-preview__detail">
        <span class="perfil-preview__detail-label">Tarifa</span>
        <span class="perfil-preview__detail-value">${tarifa}</span>
      </div>
      <div class="perfil-preview__detail">
        <span class="perfil-preview__detail-label">Zona de trabajo</span>
        <span class="perfil-preview__detail-value">${esc(c.zonas_trabajo || '—')}</span>
      </div>
      <div class="perfil-preview__detail" style="border:none">
        <span class="perfil-preview__detail-label">Estado</span>
        <span class="perfil-preview__detail-value">${esc(c.estado || '—')}</span>
      </div>
    `;
  }

  // === Baja de cuenta ===
  const btnBaja = document.getElementById('btnBajaCuidador');
  if (btnBaja) {
    btnBaja.addEventListener('click', async () => {
      const confirmar = confirm('¿Estás seguro/a de que querés eliminar tu cuenta?\n\nTu perfil dejará de ser visible y tus datos se eliminarán en 30 días. Te vamos a enviar un email con un link para reactivarla si cambiás de opinión.');
      if (!confirmar) return;

      const msgEl = document.getElementById('bajaCuidMsg');
      btnBaja.disabled = true;
      btnBaja.textContent = 'Procesando...';

      try {
        const email = document.getElementById('cdEmail')?.value;
        if (!email) throw new Error('No se pudo obtener el email');

        const res = await fetch(`${API}/auth/baja`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, tipo: 'cuidador' })
        });
        const data = await res.json();

        msgEl.style.display = 'block';
        if (data.ok) {
          msgEl.style.background = '#e6f9f0';
          msgEl.style.color = '#065f46';
          msgEl.style.border = '1px solid #a7f3d0';
          msgEl.textContent = data.mensaje;
          btnBaja.style.display = 'none';
          setTimeout(() => {
            localStorage.removeItem('cuidy_cuidador');
            window.location.href = '/';
          }, 4000);
        } else {
          msgEl.style.background = '#fef2f2';
          msgEl.style.color = '#991b1b';
          msgEl.style.border = '1px solid #fecaca';
          msgEl.textContent = data.error || 'Error al procesar la baja.';
          btnBaja.disabled = false;
          btnBaja.textContent = 'Dar de baja mi cuenta';
        }
      } catch (err) {
        msgEl.style.display = 'block';
        msgEl.style.background = '#fef2f2';
        msgEl.style.color = '#991b1b';
        msgEl.style.border = '1px solid #fecaca';
        msgEl.textContent = 'Error de conexión. Intentá de nuevo.';
        btnBaja.disabled = false;
        btnBaja.textContent = 'Dar de baja mi cuenta';
      }
    });
  }

  // === Utils ===
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
})();
