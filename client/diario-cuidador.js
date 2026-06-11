/* =============================================================
   QQMC · Diario de Cuidado — App del Cuidador
   Interfaz mobile-first para registro rápido de actividades.
   ============================================================= */
(() => {
  const API = '/.netlify/functions/api';

  // ---- Estado ----
  let contratoId = null;
  let cuidadorId = null;
  let categorias = [];
  let personas = [];        // ["Tomás", "Sofía"] — personas del contrato
  let personasSeleccionadas = new Set();
  let categoriaActual = null;
  let opcionSeleccionada = null;
  let checkedIn = false;

  // ---- DOM ----
  const greeting      = document.getElementById('greeting');
  const personaCuidada = document.getElementById('personaCuidada');
  const btnCheckin     = document.getElementById('btnCheckin');
  const btnCheckout    = document.getElementById('btnCheckout');
  const checkinStatus  = document.getElementById('checkinStatus');
  const checkinTime    = document.getElementById('checkinTime');
  const categoriasGrid = document.getElementById('categoriasGrid');
  const panel          = document.getElementById('panel');
  const panelTitle     = document.getElementById('panelTitle');
  const panelBody      = document.getElementById('panelBody');
  const panelNote      = document.getElementById('panelNote');
  const panelBack      = document.getElementById('panelBack');
  const btnSend        = document.getElementById('btnSend');
  const btnPhoto       = document.getElementById('btnPhoto');
  const btnNotaLibre   = document.getElementById('btnNotaLibre');
  const timelineList   = document.getElementById('timelineList');
  const recordatoriosDiv = document.getElementById('recordatorios');
  const recordatoriosList = document.getElementById('recordatoriosList');
  const toast          = document.getElementById('toast');

  // ---- Init ----
  document.addEventListener('DOMContentLoaded', async () => {
    // Leer parámetros de URL: ?contrato=UUID&cuidador=UUID
    const params = new URLSearchParams(window.location.search);
    contratoId = params.get('contrato');
    cuidadorId = params.get('cuidador');

    if (!contratoId || !cuidadorId) {
      showToast('Faltan datos del contrato');
      return;
    }

    // Saludar según hora
    const h = new Date().getHours();
    greeting.textContent = h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';

    // Cargar contrato
    await loadContrato();
    await loadMensajes();
    await loadSolicitudes();
    await loadCategorias();
    await loadRecordatorios();
    await loadTimeline();

    // Refresh mensajes y solicitudes cada 30 seg
    setInterval(() => { loadMensajes(); loadSolicitudes(); }, 30000);

    // Listeners
    btnCheckin.addEventListener('click', doCheckin);
    btnCheckout.addEventListener('click', doCheckout);
    panelBack.addEventListener('click', closePanel);
    btnSend.addEventListener('click', sendEntry);
    btnNotaLibre.addEventListener('click', openNotaLibre);
    btnPhoto.addEventListener('click', selectPhoto);

    // Push notifications: pedir permiso y suscribir
    initPush();
  });

  // ---- Cargar contrato ----
  async function loadContrato() {
    try {
      const res = await fetch(`${API}/diario/contratos?cuidador_id=${cuidadorId}`);
      const json = await res.json();
      if (json.ok && json.data.length) {
        const contrato = json.data.find(c => c.id === contratoId) || json.data[0];
        personaCuidada.textContent = contrato.persona_cuidada || 'Cuidado del día';
        // Cargar personas del contrato
        const raw = contrato.personas || [];
        personas = raw.map(p => typeof p === 'string' ? { nombre: p } : p);
      }
    } catch { /* silenciar */ }
  }

  // ---- Solicitudes de contacto ----
  const solicitudesSection = document.getElementById('solicitudesSection');
  const solicitudesList = document.getElementById('solicitudesList');

  async function loadSolicitudes() {
    try {
      const res = await fetch(`${API}/contactos/solicitudes?cuidador_id=${cuidadorId}`);
      const json = await res.json();
      if (!json.ok) return;
      const solicitudes = json.data || [];
      if (!solicitudes.length) {
        solicitudesSection.classList.add('hidden');
        return;
      }
      solicitudesSection.classList.remove('hidden');
      solicitudesList.innerHTML = '';
      solicitudes.forEach(s => {
        const el = document.createElement('div');
        el.className = `solicitud-card solicitud-card--${s.estado}`;
        const nombre = s.familias ? `${s.familias.nombre} ${s.familias.apellido}` : 'Familia';
        const fecha = formatTime(new Date(s.created_at));

        let accionesHtml;
        if (s.estado === 'pendiente') {
          accionesHtml = `
            <div class="solicitud__actions">
              <button class="solicitud__btn solicitud__btn--aceptar" data-id="${s.id}" data-accion="aceptada">Aceptar</button>
              <button class="solicitud__btn solicitud__btn--rechazar" data-id="${s.id}" data-accion="rechazada">Rechazar</button>
            </div>`;
        } else if (s.estado === 'aceptada') {
          const contacto = s.familias?.email || s.familias?.telefono || '';
          accionesHtml = `
            <div class="solicitud__estado solicitud__estado--aceptada">✓ Aceptada</div>
            ${contacto ? `<div class="solicitud__contacto">📞 ${esc(s.familias.telefono || '')} · ✉️ ${esc(s.familias.email || '')}</div>` : ''}`;
        } else {
          accionesHtml = '<div class="solicitud__estado solicitud__estado--rechazada">Rechazada</div>';
        }

        el.innerHTML = `
          <div class="solicitud__header">
            <span class="solicitud__nombre">${esc(nombre)}</span>
            <span class="solicitud__fecha">${fecha}</span>
          </div>
          <div class="solicitud__mensaje">"${esc(s.mensaje)}"</div>
          ${accionesHtml}
        `;

        // Listeners para aceptar/rechazar
        el.querySelectorAll('.solicitud__btn').forEach(btn => {
          btn.addEventListener('click', () => responderSolicitud(s.id, btn.dataset.accion, btn));
        });

        solicitudesList.appendChild(el);
      });
    } catch { /* offline */ }
  }

  async function responderSolicitud(id, estado, btn) {
    btn.disabled = true;
    btn.textContent = estado === 'aceptada' ? 'Aceptando…' : 'Rechazando…';
    try {
      const res = await fetch(`${API}/contactos/solicitudes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado })
      });
      const json = await res.json();
      if (json.ok) {
        showToast(estado === 'aceptada' ? 'Solicitud aceptada — datos intercambiados' : 'Solicitud rechazada');
        await loadSolicitudes();
      } else {
        showToast('Error: ' + (json.error || ''));
        btn.disabled = false;
      }
    } catch {
      showToast('Sin conexión');
      btn.disabled = false;
    }
  }

  // ---- Cargar categorías ----
  async function loadCategorias() {
    try {
      const res = await fetch(`${API}/diario/categorias?contrato_id=${contratoId}`);
      const json = await res.json();
      if (json.ok) {
        categorias = json.data;
        renderCategorias();
      }
    } catch {
      showToast('Error cargando categorías');
    }
  }

  function renderCategorias() {
    categoriasGrid.innerHTML = '';
    categorias.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'diario-cat-btn';
      btn.innerHTML = `
        <span class="diario-cat-btn__icon">${cat.icono}</span>
        <span class="diario-cat-btn__label">${esc(cat.nombre)}</span>
      `;
      btn.addEventListener('click', () => openCategoria(cat));
      categoriasGrid.appendChild(btn);
    });
  }

  // ---- Abrir panel de categoría ----
  function openCategoria(cat) {
    categoriaActual = cat;
    opcionSeleccionada = null;
    panelTitle.textContent = `${cat.icono} ${cat.nombre}`;
    panelNote.value = '';
    btnPhoto.classList.remove('has-photo');
    btnPhoto.textContent = '📷 Foto';
    delete btnPhoto.dataset.dataUrl;

    // Renderizar panel
    panelBody.innerHTML = '';

    // Chips de personas (si hay más de una)
    if (personas.length > 1) {
      personasSeleccionadas = new Set(personas.map(p => p.nombre));
      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'diario-personas-chips';
      personas.forEach(p => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'persona-chip is-selected';
        chip.textContent = p.nombre;
        chip.addEventListener('click', () => {
          if (personasSeleccionadas.has(p.nombre)) {
            // No dejar deseleccionar todos
            if (personasSeleccionadas.size <= 1) return;
            personasSeleccionadas.delete(p.nombre);
            chip.classList.remove('is-selected');
          } else {
            personasSeleccionadas.add(p.nombre);
            chip.classList.add('is-selected');
          }
        });
        chipsWrap.appendChild(chip);
      });
      panelBody.appendChild(chipsWrap);
    } else if (personas.length === 1) {
      personasSeleccionadas = new Set([personas[0].nombre]);
    } else {
      personasSeleccionadas = new Set();
    }

    // Renderizar opciones rápidas o campo de detalle
    if (cat.opciones_rapidas && cat.opciones_rapidas.length) {
      const wrap = document.createElement('div');
      wrap.className = 'diario-panel__options';
      cat.opciones_rapidas.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'diario-panel__opt';
        btn.textContent = opt;
        btn.addEventListener('click', () => {
          panelBody.querySelectorAll('.diario-panel__opt').forEach(b => b.classList.remove('is-selected'));
          btn.classList.add('is-selected');
          opcionSeleccionada = opt;
        });
        wrap.appendChild(btn);
      });
      panelBody.appendChild(wrap);
    }

    if (cat.tipo === 'detail' || cat.tipo === 'photo') {
      const input = document.createElement('input');
      input.className = 'diario-panel__detail-input';
      input.placeholder = cat.tipo === 'detail' ? 'Detalle…' : 'Descripción de la foto…';
      input.id = 'detailInput';
      panelBody.appendChild(input);
    }

    panel.classList.remove('hidden');
  }

  function closePanel() {
    panel.classList.add('hidden');
    categoriaActual = null;
    opcionSeleccionada = null;
  }

  // ---- Nota libre ----
  function openNotaLibre() {
    categoriaActual = null;
    opcionSeleccionada = null;
    panelTitle.textContent = '✏️ Nota libre';
    panelNote.value = '';
    btnPhoto.classList.remove('has-photo');
    btnPhoto.textContent = '📷 Foto';
    delete btnPhoto.dataset.dataUrl;
    panelBody.innerHTML = '';

    // Chips de personas
    if (personas.length > 1) {
      personasSeleccionadas = new Set(personas.map(p => p.nombre));
      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'diario-personas-chips';
      personas.forEach(p => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'persona-chip is-selected';
        chip.textContent = p.nombre;
        chip.addEventListener('click', () => {
          if (personasSeleccionadas.has(p.nombre)) {
            if (personasSeleccionadas.size <= 1) return;
            personasSeleccionadas.delete(p.nombre);
            chip.classList.remove('is-selected');
          } else {
            personasSeleccionadas.add(p.nombre);
            chip.classList.add('is-selected');
          }
        });
        chipsWrap.appendChild(chip);
      });
      panelBody.appendChild(chipsWrap);
    } else if (personas.length === 1) {
      personasSeleccionadas = new Set([personas[0].nombre]);
    } else {
      personasSeleccionadas = new Set();
    }

    const input = document.createElement('textarea');
    input.className = 'diario-panel__detail-input';
    input.placeholder = 'Contá cómo va el día…';
    input.rows = 3;
    input.id = 'detailInput';
    panelBody.appendChild(input);
    panel.classList.remove('hidden');
  }

  // ---- Foto ----
  function selectPhoto() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        btnPhoto.dataset.dataUrl = reader.result;
        btnPhoto.classList.add('has-photo');
        btnPhoto.textContent = '✅ Foto lista';
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  // ---- Enviar entrada ----
  async function sendEntry() {
    const detailInput = document.getElementById('detailInput');
    const detalle = detailInput ? detailInput.value.trim() : '';
    const nota = panelNote.value.trim();
    const fotoUrl = btnPhoto.dataset.dataUrl || null;

    const contenido = [opcionSeleccionada, detalle, nota].filter(Boolean).join(' — ');
    if (!contenido && !fotoUrl) {
      showToast('Escribí algo o sacá una foto');
      return;
    }

    const tipo = categoriaActual ? (fotoUrl ? 'foto' : 'actividad') : (fotoUrl ? 'foto' : 'nota');

    const meta = categoriaActual ? { categoria: categoriaActual.nombre } : {};
    if (personasSeleccionadas.size > 0) {
      meta.personas = Array.from(personasSeleccionadas);
    }

    const body = {
      contrato_id: contratoId,
      cuidador_id: cuidadorId,
      categoria_id: categoriaActual ? categoriaActual.id : null,
      tipo,
      contenido: contenido || null,
      foto_url: fotoUrl,
      metadata: meta
    };

    btnSend.textContent = 'Guardando…';
    btnSend.disabled = true;

    try {
      const res = await fetch(`${API}/diario/entrada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json();

      if (json.ok || json.offline) {
        showToast(json.offline ? 'Guardado offline' : 'Registrado');
        closePanel();
        await loadTimeline();
      } else {
        showToast('Error: ' + (json.error || 'intenta de nuevo'));
      }
    } catch {
      showToast('Sin conexión — se guardará después');
      closePanel();
    } finally {
      btnSend.textContent = 'Guardar';
      btnSend.disabled = false;
    }
  }

  // ---- Check-in / Check-out ----
  async function doCheckin() {
    const body = {
      contrato_id: contratoId,
      cuidador_id: cuidadorId,
      tipo: 'checkin',
      contenido: 'Llegó al domicilio'
    };

    // Intentar obtener ubicación
    if (navigator.geolocation) {
      try {
        const pos = await new Promise((ok, fail) =>
          navigator.geolocation.getCurrentPosition(ok, fail, { timeout: 5000 })
        );
        body.lat = pos.coords.latitude;
        body.lng = pos.coords.longitude;
      } catch { /* sin ubicación, seguir igual */ }
    }

    try {
      await fetch(`${API}/diario/entrada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch { /* offline */ }

    checkedIn = true;
    btnCheckin.classList.add('hidden');
    checkinStatus.classList.remove('hidden');
    checkinTime.textContent = '📍 Llegaste a las ' + formatTime(new Date());
    showToast('Check-in registrado');
    await loadTimeline();
  }

  async function doCheckout() {
    const body = {
      contrato_id: contratoId,
      cuidador_id: cuidadorId,
      tipo: 'checkout',
      contenido: 'Se fue del domicilio'
    };

    if (navigator.geolocation) {
      try {
        const pos = await new Promise((ok, fail) =>
          navigator.geolocation.getCurrentPosition(ok, fail, { timeout: 5000 })
        );
        body.lat = pos.coords.latitude;
        body.lng = pos.coords.longitude;
      } catch { /* sin ubicación */ }
    }

    try {
      await fetch(`${API}/diario/entrada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch { /* offline */ }

    checkedIn = false;
    checkinStatus.classList.add('hidden');
    btnCheckin.classList.remove('hidden');
    showToast('Check-out registrado. ¡Buen trabajo!');
    await loadTimeline();
  }

  // ---- Mensajes de la familia ----
  const mensajesSection = document.getElementById('mensajesSection');
  const mensajesList = document.getElementById('mensajesList');

  async function loadMensajes() {
    try {
      const res = await fetch(`${API}/diario/mensajes?contrato_id=${contratoId}&no_leidos=1`);
      const json = await res.json();
      if (json.ok && json.data.length) {
        mensajesSection.classList.remove('hidden');
        mensajesList.innerHTML = '';
        json.data.forEach(m => {
          const el = document.createElement('div');
          const esImportante = m.prioridad === 'importante';
          el.className = `mensaje-item${esImportante ? ' mensaje-item--importante' : ''}`;
          const hora = new Date(m.created_at);
          const quien = m.familias ? `${m.familias.nombre}` : 'Familia';
          el.innerHTML = `
            <div class="mensaje-item__header">
              <span class="mensaje-item__from">${esc(quien)}</span>
              <span class="mensaje-item__time">${formatTime(hora)}</span>
            </div>
            <div class="mensaje-item__body">${esc(m.contenido)}</div>
            <button class="mensaje-item__read" data-id="${m.id}">Leído ✓</button>
          `;
          el.querySelector('.mensaje-item__read').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = '✓';
            try {
              await fetch(`${API}/diario/mensajes/${m.id}`, { method: 'PATCH' });
              el.classList.add('mensaje-item--leido');
              setTimeout(() => {
                el.remove();
                if (!mensajesList.children.length) mensajesSection.classList.add('hidden');
              }, 600);
            } catch { btn.disabled = false; btn.textContent = 'Leído ✓'; }
          });
          mensajesList.appendChild(el);
        });
      } else {
        mensajesSection.classList.add('hidden');
      }
    } catch { /* silenciar */ }
  }

  // ---- Recordatorios ----
  async function loadRecordatorios() {
    try {
      const res = await fetch(`${API}/diario/recordatorios?contrato_id=${contratoId}`);
      const json = await res.json();
      if (json.ok && json.data.length) {
        recordatoriosDiv.classList.remove('hidden');
        recordatoriosList.innerHTML = '';
        json.data.forEach(r => {
          const item = document.createElement('div');
          item.className = 'recordatorio-item';
          item.innerHTML = `
            <span class="recordatorio-item__hora">${r.hora.slice(0, 5)}</span>
            <span class="recordatorio-item__text"><strong>${esc(r.titulo)}</strong>${r.descripcion ? ' — ' + esc(r.descripcion) : ''}</span>
          `;
          recordatoriosList.appendChild(item);
        });
      }
    } catch { /* silenciar */ }
  }

  // ---- Timeline ----
  async function loadTimeline() {
    const hoy = new Date().toISOString().slice(0, 10);
    try {
      const res = await fetch(`${API}/diario/entradas?contrato_id=${contratoId}&fecha=${hoy}`);
      const json = await res.json();
      if (json.ok) {
        renderTimeline(json.data);
        // Verificar si ya hizo check-in hoy
        const ci = json.data.find(e => e.tipo === 'checkin');
        const co = json.data.find(e => e.tipo === 'checkout');
        if (ci && !co) {
          checkedIn = true;
          btnCheckin.classList.add('hidden');
          checkinStatus.classList.remove('hidden');
          checkinTime.textContent = '📍 Llegaste a las ' + formatTime(new Date(ci.created_at));
        }
      }
    } catch { /* offline */ }
  }

  function renderTimeline(entries) {
    if (!entries.length) {
      timelineList.innerHTML = '<p class="diario-timeline__empty">Todavía no hay registros hoy. ¡Empezá con el check-in!</p>';
      return;
    }

    timelineList.innerHTML = '';
    entries.forEach(e => {
      const el = document.createElement('div');
      const tipoClass = e.tipo === 'checkin' ? 'timeline-entry--checkin'
        : e.tipo === 'checkout' ? 'timeline-entry--checkout'
        : e.foto_url ? 'timeline-entry--foto' : '';
      el.className = `timeline-entry ${tipoClass}`;

      const icono = e.tipo === 'checkin' ? '📍'
        : e.tipo === 'checkout' ? '👋'
        : e.diario_categorias?.icono || '📝';

      const catNombre = e.tipo === 'checkin' ? 'Check-in'
        : e.tipo === 'checkout' ? 'Check-out'
        : e.diario_categorias?.nombre || 'Nota';

      // Nombres de las personas asociadas a esta entrada
      const entryPersonas = e.metadata?.personas || [];
      const personasTag = entryPersonas.length > 0 && personas.length > 1
        ? `<span class="timeline-entry__personas">${entryPersonas.join(', ')}</span>`
        : '';

      const reacciones = (e.diario_reacciones || []).map(r =>
        `<span class="timeline-reaction">${r.tipo === 'corazon' ? '❤️' : r.tipo === 'gracias' ? '🙏' : '👁️'}${r.comentario ? ' ' + esc(r.comentario) : ''}</span>`
      ).join('');

      el.innerHTML = `
        <div class="timeline-entry__icon">${icono}</div>
        <div class="timeline-entry__body">
          <div class="timeline-entry__header">
            <span class="timeline-entry__cat">${esc(catNombre)}${personasTag}</span>
            <span class="timeline-entry__time">${formatTime(new Date(e.created_at))}</span>
          </div>
          ${e.contenido ? `<div class="timeline-entry__content">${esc(e.contenido)}</div>` : ''}
          ${e.foto_url ? `<img class="timeline-entry__photo" src="${e.foto_url}" alt="Foto" loading="lazy" />` : ''}
          ${reacciones ? `<div class="timeline-entry__reactions">${reacciones}</div>` : ''}
        </div>
      `;
      timelineList.appendChild(el);
    });
  }

  // ---- Utils ----
  function formatTime(date) {
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
  }

  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[s]));
  }

  // ---- Push Notifications ----
  const VAPID_PUBLIC_KEY = 'BMLA1ZDP_95yQu2ArFg93dMMSqUTXPpe7eGZOgibUeIXj96LFbDoCcdBkXSZbDE7GN6qkiy9fFXKMM_vCxhMDfo';

  async function initPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const registration = await navigator.serviceWorker.ready;

      // Verificar si ya hay suscripción
      let subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // Ya suscrito, asegurarnos de que el servidor tenga la suscripción
        await sendSubscriptionToServer(subscription);
        return;
      }

      // Pedir permiso
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      // Suscribir
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      await sendSubscriptionToServer(subscription);
    } catch (err) {
      console.warn('[push] No se pudo suscribir:', err.message);
    }
  }

  async function sendSubscriptionToServer(subscription) {
    try {
      await fetch(`${API}/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario_tipo: 'cuidador',
          usuario_id: cuidadorId,
          subscription: subscription.toJSON()
        })
      });
    } catch { /* silenciar */ }
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
})();
