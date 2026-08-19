/* =============================================================
   Cuidy · Panel del Cuidador
   Secciones: Solicitudes, Mis datos, Mi diario, Mi perfil público
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
    loadSolicitudes();
    loadMisDatos();
  });

  // === Banner de estado ===
  function renderEstadoBanner() {
    const banner = document.getElementById('bannerEstado');
    const estado = cuidador.estado;
    if (!estado || estado === 'aprobado') {
      // Si ya está aprobado, mostrar banner verde breve
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
      });
    });
  }

  // === Solicitudes de contacto ===
  async function loadSolicitudes() {
    const list = document.getElementById('solicitudesList');
    try {
      const res = await fetch(`${API}/contactos/solicitudes?cuidador_id=${cuidador.id}`);
      const json = await res.json();
      if (!json.ok || !json.data?.length) {
        list.innerHTML = '<p class="solicitudes-empty">Todavía no recibiste solicitudes de contacto. Cuando una familia te contacte, vas a verlo acá.</p>';
        return;
      }

      // Badge
      const pendientes = json.data.filter(s => s.estado === 'pendiente').length;
      const badge = document.getElementById('badgeSolicitudes');
      if (pendientes > 0) {
        badge.textContent = pendientes;
        badge.classList.remove('hidden');
      }

      list.innerHTML = json.data.map(s => renderSolicitud(s)).join('');

      // Event listeners para aceptar/rechazar
      list.querySelectorAll('[data-accion]').forEach(btn => {
        btn.addEventListener('click', () => responderSolicitud(btn.dataset.id, btn.dataset.accion));
      });
    } catch {
      list.innerHTML = '<p class="solicitudes-empty">Error al cargar solicitudes. Intentá recargar la página.</p>';
    }
  }

  function renderSolicitud(s) {
    const fam = s.familias || {};
    const nombre = `${fam.nombre || 'Familia'} ${fam.apellido || ''}`.trim();
    const inicial = (fam.nombre || '?').charAt(0).toUpperCase();
    const fecha = s.created_at ? new Date(s.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const estadoClass = `solicitud-card__estado--${s.estado}`;
    const estadoLabel = { pendiente: 'Pendiente', aceptada: 'Aceptada', rechazada: 'Rechazada' }[s.estado] || s.estado;

    // Datos de contexto de la familia
    const zona = fam.zona || {};
    const busqueda = fam.busqueda || {};
    const detalle = fam.detalle || {};

    // Tipo de cuidado
    const tipoLabels = { ninera: 'Niñera', adulto_mayor: 'Adulto mayor', domestica: 'Empleada doméstica' };
    const tipoBuscado = busqueda.tipo
      ? (tipoLabels[busqueda.tipo] || busqueda.tipo)
      : (busqueda.tipos || []).map(t => tipoLabels[t] || t).join(', ');
    const ubicacion = [zona.localidad, zona.provincia].filter(Boolean).join(', ');

    // Días y horarios
    const diasLabels = { lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', miércoles: 'Mié', jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb', sábado: 'Sáb', domingo: 'Dom' };
    let diasTexto = '';
    if (busqueda.dias) {
      const diasArr = Array.isArray(busqueda.dias) ? busqueda.dias : busqueda.dias.split(',').map(d => d.trim());
      diasTexto = diasArr.map(d => diasLabels[d.toLowerCase()] || d).join(', ');
    }
    const franjaLabels = { manana: 'Mañana (6-13h)', tarde: 'Tarde (13-20h)', noche: 'Noche (20-6h)', completa: 'Jornada completa' };
    const franjaTexto = busqueda.franja ? (franjaLabels[busqueda.franja] || busqueda.franja) : '';

    // Observaciones del detalle
    const observaciones = [];
    if (detalle.cantidad_ninos) observaciones.push(`${detalle.cantidad_ninos} niño${detalle.cantidad_ninos > 1 ? 's' : ''}`);
    if (detalle.edades) observaciones.push(`Edades: ${detalle.edades}`);
    if (detalle.observaciones) observaciones.push(detalle.observaciones);
    if (detalle.necesidades) observaciones.push(detalle.necesidades);
    if (detalle.notas) observaciones.push(detalle.notas);

    // Construir sección de contexto
    let contextoHtml = '';
    const hayContexto = tipoBuscado || ubicacion || diasTexto || franjaTexto || observaciones.length;
    if (hayContexto) {
      contextoHtml = `
        <div class="solicitud-card__contexto">
          <strong>Lo que busca la familia:</strong>
          <div class="solicitud-card__detalle-grid">
            ${tipoBuscado ? `<span class="solicitud-detalle-item">${icon('tag')} ${esc(tipoBuscado)}</span>` : ''}
            ${ubicacion ? `<span class="solicitud-detalle-item">${icon('mapPin')} ${esc(ubicacion)}</span>` : ''}
            ${diasTexto ? `<span class="solicitud-detalle-item">${icon('calendar')} ${esc(diasTexto)}</span>` : ''}
            ${franjaTexto ? `<span class="solicitud-detalle-item">${icon('clock')} ${esc(franjaTexto)}</span>` : ''}
          </div>
          ${observaciones.length ? `<div class="solicitud-card__obs"><span class="solicitud-detalle-item">${icon('fileText')} ${esc(observaciones.join(' · '))}</span></div>` : ''}
        </div>`;
    }

    let contactoInfo = '';
    if (s.estado === 'aceptada') {
      const datos = [];
      if (fam.telefono) datos.push(`${icon('phone')} ${esc(fam.telefono)}`);
      if (fam.email) datos.push(`${icon('mail')} ${esc(fam.email)}`);
      if (datos.length) {
        contactoInfo = `
          <div class="solicitud-card__contacto-info">
            <strong>Datos de contacto:</strong><br>${datos.join('<br>')}
          </div>`;
      }
    }

    let acciones = '';
    if (s.estado === 'pendiente') {
      acciones = `
        <div class="solicitud-card__acciones">
          <button class="btn btn--primary btn--sm" data-id="${s.id}" data-accion="aceptada">Aceptar</button>
          <button class="btn btn--ghost btn--sm" data-id="${s.id}" data-accion="rechazada">Rechazar</button>
        </div>`;
    }

    return `
      <div class="solicitud-card">
        <div class="solicitud-card__header">
          <div class="solicitud-card__avatar">${fam.foto_url ? `<img src="${esc(fam.foto_url)}" alt="${esc(nombre)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.style.display='none';this.parentElement.textContent='${inicial}'">` : inicial}</div>
          <div class="solicitud-card__header-info">
            <span class="solicitud-card__nombre">${esc(nombre)}</span>
            ${ubicacion ? `<span class="solicitud-card__ubicacion">${icon('mapPin')} ${esc(ubicacion)}</span>` : ''}
          </div>
          <div class="solicitud-card__header-right">
            <span class="solicitud-card__estado ${estadoClass}">${estadoLabel}</span>
            <span class="solicitud-card__fecha">${fecha}</span>
          </div>
        </div>
        ${contextoHtml}
        ${s.mensaje ? `<div class="solicitud-card__mensaje">${icon('messageCircle')} ${esc(s.mensaje)}</div>` : ''}
        ${contactoInfo}
        ${s.respuesta_cuidador ? `<div class="solicitud-card__mensaje"><em>Tu respuesta:</em> ${esc(s.respuesta_cuidador)}</div>` : ''}
        ${acciones}
      </div>`;
  }

  async function responderSolicitud(id, estado) {
    const respuesta = estado === 'rechazada'
      ? prompt('¿Querés dejar un mensaje para la familia? (opcional)') || ''
      : '';

    try {
      const res = await fetch(`${API}/contactos/solicitudes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado, respuesta })
      });
      const json = await res.json();
      if (json.ok) {
        loadSolicitudes();
      } else {
        alert(json.error || 'Error al responder');
      }
    } catch {
      alert('Sin conexión. Intentá nuevamente.');
    }
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
        // Actualizar estado local
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
