/* QQMC — landing de búsqueda pública */
(() => {
  const API_BASE = '/.netlify/functions/api';

  const ESPECIALIDAD_LABEL = {
    ninera: 'Niñera',
    adulto_mayor: 'Cuidado de adulto mayor',
    domestica: 'Empleada doméstica'
  };

  // Colores por especialidad para los markers
  const COLORS = {
    ninera: '#ec4899',
    adulto_mayor: '#0ea5e9',
    domestica: '#10b981'
  };

  // Estado
  let map;
  let markersLayer;
  let cuidadoresActuales = [];
  const markersById = new Map();

  // === Init ===
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('year').textContent = new Date().getFullYear();
    initMap();
    // Solo init form si existe (en modo asistente no hay searchForm)
    if (document.getElementById('searchForm')) initForm();
    initModal();
    // Solo búsqueda inicial si NO hay chat (modo clásico)
    if (!document.getElementById('chat')) {
      fetchCuidadores({ tipo: 'todos', zona: '' });
    }
  });

  // Exponer funciones y objetos para chat.js (después de DOMContentLoaded, map ya existe)
  window.qqmc = {
    get map() { return map; },
    renderMarkers,
    abrirFicha,
    highlightAndPanTo(id) {
      highlightCard(id);
      const m = markersById.get(id);
      if (m) {
        map.setView(m.getLatLng(), 14, { animate: true });
        m.openPopup();
      }
    }
  };
  // Aliases directos para chat.js
  window.renderMarkers = renderMarkers;
  window.abrirFicha = abrirFicha;
  window.highlightAndPanTo = window.qqmc.highlightAndPanTo;

  function initMap() {
    map = L.map('map', { scrollWheelZoom: true }).setView([-34.60, -58.45], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
  }

  function initForm() {
    const form = document.getElementById('searchForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const tipo = document.getElementById('tipo').value;
      const zona = document.getElementById('zona').value.trim();
      fetchCuidadores({ tipo, zona });
    });
  }

  function initModal() {
    const modal = document.getElementById('modal');
    modal.addEventListener('click', (e) => {
      if (e.target.dataset.close !== undefined) cerrarModal();
    });
    // Modal de planes
    const modalPlanes = document.getElementById('modalPlanes');
    if (modalPlanes) {
      modalPlanes.addEventListener('click', (e) => {
        if (e.target.dataset.closePlanes !== undefined) cerrarModalPlanes();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { cerrarModal(); cerrarModalPlanes(); }
    });
  }

  // === Estado familia (sesión local) ===
  let familiaState = JSON.parse(localStorage.getItem('qqmc_familia') || 'null');
  // { id, nombre, apellido, email, telefono, suscripcion_activa, contactos_desbloqueados: [] }

  function getFamiliaId() {
    if (familiaState?.id) return familiaState.id;
    // Generar UUID temporal si no tiene cuenta
    return null;
  }

  // === Paywall / Planes ===
  let planesData = [];
  let planSeleccionado = null;
  let cuidadorPendiente = null; // ID del cuidador que quiere desbloquear

  async function abrirModalPlanes(cuidadorId) {
    cuidadorPendiente = cuidadorId;
    const modalPlanes = document.getElementById('modalPlanes');
    const grid = document.getElementById('planesGrid');
    const registro = document.getElementById('planesRegistro');

    modalPlanes.classList.remove('hidden');
    registro.classList.add('hidden');
    planSeleccionado = null;

    // Cargar planes si no los tenemos
    if (!planesData.length) {
      grid.innerHTML = '<p style="text-align:center;color:var(--muted)">Cargando planes…</p>';
      try {
        const res = await fetch(`${API_BASE}/planes`);
        const json = await res.json();
        if (json.ok) planesData = json.data;
      } catch { /* offline */ }
    }

    // Render planes
    grid.innerHTML = '';
    planesData.forEach(plan => {
      const card = document.createElement('div');
      const esPopular = plan.id === 'trimestral';
      card.className = `plan-card${esPopular ? ' is-popular' : ''}`;
      const contactosTexto = plan.contactos_incluidos === null
        ? 'Contactos ilimitados'
        : plan.contactos_incluidos === 1
          ? '1 contacto'
          : `${plan.contactos_incluidos} contactos`;
      card.innerHTML = `
        <div class="plan-card__name">${escapeHtml(plan.nombre)}</div>
        <div class="plan-card__price">$${Number(plan.precio_ars).toLocaleString('es-AR')}</div>
        <div class="plan-card__price-usd">USD ${plan.precio_usd}</div>
        <div class="plan-card__desc">${escapeHtml(plan.descripcion)}</div>
        <div class="plan-card__contactos">${contactosTexto}</div>
        ${plan.incluye_diario ? '<div class="plan-card__diario">✓ Incluye Diario de Cuidado</div>' : ''}
      `;
      card.addEventListener('click', () => seleccionarPlan(plan, card));
      grid.appendChild(card);
    });
  }

  function seleccionarPlan(plan, card) {
    // Deseleccionar anterior
    document.querySelectorAll('.plan-card.is-selected').forEach(c => c.classList.remove('is-selected'));
    card.classList.add('is-selected');
    planSeleccionado = plan;

    // Mostrar formulario de registro
    const registro = document.getElementById('planesRegistro');
    registro.classList.remove('hidden');

    // Si ya tiene datos (logueado o previo), pre-llenar
    const session = typeof getSession === 'function' ? getSession() : null;
    const src = session || familiaState;
    if (src) {
      document.getElementById('regNombre').value = src.nombre || '';
      document.getElementById('regApellido').value = src.apellido || '';
      document.getElementById('regEmail').value = src.email || '';
      document.getElementById('regTelefono').value = src.telefono || '';
    }

    // Listener del botón (solo una vez)
    const btn = document.getElementById('btnConfirmarPlan');
    btn.onclick = confirmarPlan;
  }

  async function confirmarPlan() {
    if (!planSeleccionado) return;
    const nombre = document.getElementById('regNombre').value.trim();
    const apellido = document.getElementById('regApellido').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const telefono = document.getElementById('regTelefono').value.trim();

    if (!nombre || !email) {
      alert('Nombre y email son obligatorios');
      return;
    }

    const btn = document.getElementById('btnConfirmarPlan');
    btn.disabled = true;
    btn.textContent = 'Procesando…';

    // Generar o usar familia_id existente
    const familiaId = familiaState?.id || crypto.randomUUID();

    try {
      const res = await fetch(`${API_BASE}/suscripciones/crear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familia_id: familiaId,
          plan_id: planSeleccionado.id,
          nombre,
          apellido,
          email,
          telefono
        })
      });
      const json = await res.json();
      if (json.ok) {
        // Guardar estado local (usar familia_id del servidor si difiere)
        const realFamiliaId = json.data.familia_id || familiaId;
        familiaState = {
          id: realFamiliaId, nombre, apellido, email, telefono,
          suscripcion_activa: json.data.simulado || false,
          suscripcion_id: json.data.suscripcion_id
        };
        localStorage.setItem('qqmc_familia', JSON.stringify(familiaState));

        if (json.data.simulado) {
          // Modo simulación: activar directo sin pasar por MP
          cerrarModalPlanes();
          // Reabrir ficha — ahora mostrará el formulario de mensaje por plataforma
          if (cuidadorPendiente) {
            abrirFicha(cuidadorPendiente);
          } else {
            alert('¡Plan activado! Ya podés contactar cuidadores por la plataforma.');
          }
          btn.disabled = false;
          btn.textContent = 'Ir a pagar';
          return;
        }

        // Modo producción: redirigir a MercadoPago
        const mpUrl = json.data.mp_init_point || json.data.mp_sandbox_init_point;
        if (mpUrl) {
          window.location.href = mpUrl;
        } else {
          alert('Error al generar el link de pago. Intentá nuevamente.');
          btn.disabled = false;
          btn.textContent = 'Ir a pagar';
        }
      } else {
        alert(json.error || 'Error al crear suscripción');
        btn.disabled = false;
        btn.textContent = 'Ir a pagar';
      }
    } catch {
      alert('Sin conexión. Intentá nuevamente.');
      btn.disabled = false;
      btn.textContent = 'Ir a pagar';
    }
  }

  function cerrarModalPlanes() {
    document.getElementById('modalPlanes').classList.add('hidden');
  }

  async function desbloquearContacto(cuidadorId) {
    if (!familiaState?.id) return;
    try {
      await fetch(`${API_BASE}/contactos/desbloquear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familia_id: familiaState.id,
          cuidador_id: cuidadorId
        })
      });
    } catch { /* silenciar */ }
  }

  // === API ===
  async function fetchCuidadores({ tipo, zona }) {
    const list = document.getElementById('resultsList');
    list.innerHTML = '<p class="results__hint">Buscando…</p>';

    const qs = new URLSearchParams();
    if (tipo) qs.set('tipo', tipo);
    if (zona) qs.set('zona', zona);

    try {
      const res = await fetch(`${API_BASE}/cuidadores?${qs.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Error al buscar');
      cuidadoresActuales = json.data || [];
      renderList(cuidadoresActuales);
      renderMarkers(cuidadoresActuales);
    } catch (err) {
      list.innerHTML = `<p class="results__hint">No se pudo cargar: ${err.message}</p>`;
    }
  }

  async function fetchCuidadorDetalle(id) {
    const qs = familiaState?.id ? `?familia_id=${familiaState.id}` : '';
    const res = await fetch(`${API_BASE}/cuidadores/${id}${qs}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Error');
    return json;
  }

  // === Render ===
  function renderList(cuidadores) {
    const list = document.getElementById('resultsList');
    if (!cuidadores.length) {
      list.innerHTML = '<p class="results__hint">No encontramos cuidadores para esa búsqueda.</p>';
      return;
    }
    const sinCoords = cuidadores.filter(c => c.lat == null || c.lng == null).length;
    const aviso = sinCoords
      ? `<p class="results__hint" style="margin-bottom:4px; color:var(--muted); font-size:12px">
           ${sinCoords} sin ubicación en el mapa
         </p>`
      : '';
    list.innerHTML = `<p class="results__hint" style="margin-bottom:10px">
      ${cuidadores.length} resultado${cuidadores.length === 1 ? '' : 's'}
    </p>${aviso}`;
    cuidadores.forEach(c => list.appendChild(cardEl(c)));
  }

  function cardEl(c) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = c.id;
    const rating = Number(c.valoracion) > 0
      ? `★ ${Number(c.valoracion).toFixed(1)} <span>(${c.resenas || 0} reseñas)</span>`
      : '<span style="color:var(--muted)">Sin reseñas aún</span>';
    el.innerHTML = `
      <img class="card__avatar" src="${c.foto}" alt="${c.nombre}" />
      <div class="card__body">
        <div class="card__name">
          ${escapeHtml(c.nombre)}${c.edad ? ', ' + c.edad : ''}
          ${c.verificado ? '<span class="card__badge">Verificado</span>' : ''}
        </div>
        <div class="card__meta">${ESPECIALIDAD_LABEL[c.especialidad] || ''} · ${escapeHtml(c.zona)}</div>
        <div class="card__rating">${rating}</div>
      </div>
    `;
    el.addEventListener('click', () => {
      highlightCard(c.id);
      const m = markersById.get(c.id);
      if (m) {
        map.setView(m.getLatLng(), 14, { animate: true });
        m.openPopup();
      }
      abrirFicha(c.id);
    });
    return el;
  }

  function highlightCard(id) {
    document.querySelectorAll('.card').forEach(n => n.classList.toggle('active', n.dataset.id == id));
  }

  function renderMarkers(cuidadores) {
    markersLayer.clearLayers();
    markersById.clear();

    // Solo los que tengan coordenadas válidas van al mapa
    const conCoords = cuidadores.filter(c =>
      typeof c.lat === 'number' && typeof c.lng === 'number' && !isNaN(c.lat) && !isNaN(c.lng)
    );

    conCoords.forEach(c => {
      const marker = L.circleMarker([c.lat, c.lng], {
        radius: 10,
        color: '#fff',
        weight: 2,
        fillColor: COLORS[c.especialidad] || '#6d28d9',
        fillOpacity: 0.95
      });
      const ratingTxt = Number(c.valoracion) > 0
        ? `★ ${Number(c.valoracion).toFixed(1)} (${c.resenas || 0})`
        : 'Sin reseñas aún';
      marker.bindPopup(`
        <div class="popup__name">${escapeHtml(c.nombre)}${c.edad ? ', ' + c.edad : ''}</div>
        <div class="popup__meta">${ESPECIALIDAD_LABEL[c.especialidad] || ''} · ${escapeHtml(c.zona)}</div>
        <div class="popup__meta">${ratingTxt}</div>
        <a class="popup__link" data-cid="${c.id}">Ver ficha →</a>
      `);
      marker.on('popupopen', (e) => {
        const link = e.popup.getElement().querySelector('.popup__link');
        if (link) link.addEventListener('click', () => abrirFicha(c.id));
        highlightCard(c.id);
      });
      marker.addTo(markersLayer);
      markersById.set(c.id, marker);
    });

    // Ajustar vista a los markers (solo si hay markers en el mapa)
    if (markersById.size) {
      const group = L.featureGroup(Array.from(markersById.values()));
      map.fitBounds(group.getBounds().pad(0.2));
    }
  }

  // === Ficha / modal ===
  async function abrirFicha(id) {
    const modal = document.getElementById('modal');
    const body = document.getElementById('modalBody');
    body.innerHTML = '<p>Cargando…</p>';
    modal.classList.remove('hidden');
    try {
      const resultado = await fetchCuidadorDetalle(id);
      const c = resultado.data;
      const requiere_suscripcion = resultado.requiere_suscripcion;
      const contacto_visible = resultado.contacto_visible;
      const solicitud = resultado.solicitud;
      body.innerHTML = fichaHtml(c, requiere_suscripcion, contacto_visible, solicitud);
      // Init favorito button
      initFavoritoBtn(c.id);
      // Botón "Ver planes" dentro de la ficha
      const btnPlanes = document.getElementById('btnVerPlanes');
      if (btnPlanes) {
        btnPlanes.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          cerrarModal();
          abrirModalPlanes(id);
        });
      }
      // Botón "Enviar mensaje" (contacto por plataforma)
      const btnContactar = document.getElementById('btnContactar');
      if (btnContactar) {
        btnContactar.addEventListener('click', async () => {
          const msg = document.getElementById('msgContactar')?.value?.trim();
          if (!msg) { alert('Escribí un mensaje para enviar'); return; }
          btnContactar.disabled = true;
          btnContactar.textContent = 'Enviando…';
          try {
            const res = await fetch(`${API_BASE}/contactos/solicitud`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                familia_id: familiaState.id,
                cuidador_id: id,
                mensaje: msg
              })
            });
            const json = await res.json();
            if (json.ok) {
              btnContactar.textContent = '✓ Mensaje enviado';
              document.getElementById('msgContactar').value = '';
              const info = document.querySelector('.contactar__info');
              if (info) info.textContent = 'Tu mensaje fue enviado. Cuando el cuidador acepte, se intercambiarán los datos de contacto.';
            } else {
              alert(json.error || 'Error al enviar');
              btnContactar.disabled = false;
              btnContactar.textContent = 'Enviar mensaje';
            }
          } catch {
            alert('Sin conexión');
            btnContactar.disabled = false;
            btnContactar.textContent = 'Enviar mensaje';
          }
        });
      }
    } catch (err) {
      body.innerHTML = `<p>Error: ${err.message}</p>`;
    }
  }

  function cerrarModal() {
    document.getElementById('modal').classList.add('hidden');
  }

  function fichaHtml(c, requiereSuscripcion, contactoVisible, solicitud) {
    const primerNombre = escapeHtml(c.nombre.split(' ')[0]);
    let contactoBloque;
    if (requiereSuscripcion) {
      // Estado 1: Sin suscripción → mostrar paywall
      contactoBloque = `
        <div class="locked">
          <div class="locked__title">🔒 Datos de contacto bloqueados</div>
          <div class="locked__text">
            Para contactar a ${primerNombre} necesitás un plan activo.
          </div>
          <button class="btn btn--primary" id="btnVerPlanes" type="button">Ver planes</button>
        </div>`;
    } else if (contactoVisible && c.contacto) {
      // Estado 4: Contacto desbloqueado mutuamente → mostrar teléfono/email
      contactoBloque = `
        <div class="profile__section">
          <h4>Contacto directo</h4>
          <p>📞 ${escapeHtml(c.contacto.telefono || '')}</p>
          <p>✉️ ${escapeHtml(c.contacto.email || '')}</p>
        </div>`;
    } else if (solicitud) {
      // Estado 3: Ya envió solicitud → mostrar estado
      const estadoTexto = solicitud.estado === 'pendiente'
        ? '⏳ Tu mensaje fue enviado. Estamos esperando la respuesta del cuidador.'
        : solicitud.estado === 'rechazada'
        ? '😔 El cuidador no aceptó la solicitud en este momento.'
        : '';
      contactoBloque = `
        <div class="profile__section profile__section--contactar">
          <h4>Solicitud enviada</h4>
          <p class="contactar__info">${estadoTexto}</p>
        </div>`;
    } else {
      // Estado 2: Suscripción activa, sin solicitud → formulario de mensaje
      contactoBloque = `
        <div class="profile__section profile__section--contactar">
          <h4>Contactar a ${primerNombre}</h4>
          <p class="contactar__info">
            Para proteger la seguridad de los cuidadores, el primer contacto
            es a través de la plataforma. Enviá tu mensaje y cuando ${primerNombre}
            acepte, se intercambian los datos de contacto.
          </p>
          <textarea class="contactar__msg" id="msgContactar" rows="3" placeholder="Hola ${primerNombre}, estoy buscando…"></textarea>
          <button class="btn btn--primary btn--full" id="btnContactar" type="button">Enviar mensaje</button>
        </div>`;
    }

    const ratingLine = Number(c.valoracion) > 0
      ? `★ ${Number(c.valoracion).toFixed(1)} <span style="color:#6b7280;font-weight:400">(${c.resenas || 0} reseñas)</span>`
      : `<span style="color:#6b7280;font-weight:400">Sin reseñas aún</span>`;
    const disp = typeof c.disponibilidad === 'object'
      ? renderDisponibilidad(c.disponibilidad)
      : (c.disponibilidad || '—');

    return `
      <div class="profile__head">
        <img class="profile__avatar" src="${c.foto}" alt="${escapeHtml(c.nombre)}" />
        <div>
          <h3 class="profile__name">${escapeHtml(c.nombre)}${c.edad ? ', ' + c.edad : ''}</h3>
          <div class="profile__sub">
            ${ESPECIALIDAD_LABEL[c.especialidad] || ''} · ${escapeHtml(c.zona)}
          </div>
          <div class="profile__sub" style="color:#f59e0b;font-weight:600;margin-top:4px">
            ${ratingLine}
            ${c.verificado ? ` · <span class="verified-badge" tabindex="0">✓ Verificado
              <span class="verified-tooltip">Este perfil fue verificado por nuestro equipo: documentación revisada, entrevista aprobada y antecedentes chequeados.</span>
            </span>` : ''}
          </div>
        </div>
        <button class="btn-favorito" id="btnFavorito" data-id="${c.id}" aria-label="Guardar en favoritos">
          <svg class="fav-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </div>

      <div class="profile__section">
        <h4>Sobre mí</h4>
        <p>${escapeHtml(c.bio || '—')}</p>
      </div>

      <div class="profile__section">
        <h4>Experiencia</h4>
        <p>${c.experiencia_anios || 0} años en el rubro</p>
      </div>

      <div class="profile__section">
        <h4>Disponibilidad</h4>
        ${disp}
      </div>

      ${contactoBloque}
    `;
  }

  function renderDisponibilidad(d) {
    if (!d || !Object.keys(d).length) return '<p>—</p>';
    const ALL_DAYS = ['lun','mar','mie','jue','vie','sab','dom'];
    const DAY_LABELS = { lun:'Lun', mar:'Mar', mie:'Mié', jue:'Jue', vie:'Vie', sab:'Sáb', dom:'Dom' };
    const FRANJA_LABELS = { manana:'Mañana', tarde:'Tarde', noche:'Noche' };
    const FRANJA_IDS = ['manana','tarde','noche'];
    const FRANJA_DEFAULTS = { manana: '06:00–13:00', tarde: '13:00–21:00', noche: '21:00–06:00' };

    // Normalizar: convertir cualquier formato a { dia: { franja: { desde, hasta } } }
    const norm = {};
    ALL_DAYS.forEach(day => {
      const val = d[day];
      if (!val) return;
      // Formato nuevo: { manana: { desde, hasta }, ... }
      if (val.manana || val.tarde || val.noche) {
        norm[day] = val;
      }
      // Formato viejo objeto: { desde, hasta }
      else if (val.desde && val.hasta) {
        norm[day] = { manana: { desde: val.desde, hasta: val.hasta } };
      }
      // Formato viejo array: ["Mañana", "Tarde"]
      else if (Array.isArray(val)) {
        norm[day] = {};
        val.forEach(label => {
          const key = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (key === 'manana' || key === 'mañana') norm[day].manana = { desde: '06:00', hasta: '13:00' };
          else if (key === 'tarde') norm[day].tarde = { desde: '13:00', hasta: '21:00' };
          else if (key === 'noche') norm[day].noche = { desde: '21:00', hasta: '06:00' };
        });
      }
    });

    console.log('[disp] normalizado:', norm);

    let html = '<div class="disp-pub">';
    // Header
    html += '<div class="disp-pub__row disp-pub__header">';
    html += '<span class="disp-pub__day"></span>';
    FRANJA_IDS.forEach(f => { html += `<span class="disp-pub__cell">${FRANJA_LABELS[f]}</span>`; });
    html += '</div>';
    // Filas
    ALL_DAYS.forEach(day => {
      const franjas = norm[day];
      const anyActive = franjas && Object.values(franjas).some(r => r && r.desde);

      html += `<div class="disp-pub__row ${anyActive ? 'disp-pub__row--on' : ''}">`;
      html += `<span class="disp-pub__day">${DAY_LABELS[day]}</span>`;
      FRANJA_IDS.forEach(f => {
        const r = franjas && franjas[f];
        if (r && r.desde) {
          html += `<span class="disp-pub__cell disp-pub__cell--on">${r.desde}–${r.hasta}</span>`;
        } else {
          html += '<span class="disp-pub__cell disp-pub__cell--off">—</span>';
        }
      });
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  // === Favoritos (localStorage) ===
  function getFavoritos() {
    try { return JSON.parse(localStorage.getItem('qqmc_favoritos') || '[]'); }
    catch { return []; }
  }
  function toggleFavorito(id) {
    let favs = getFavoritos();
    if (favs.includes(id)) {
      favs = favs.filter(f => f !== id);
    } else {
      favs.push(id);
    }
    localStorage.setItem('qqmc_favoritos', JSON.stringify(favs));
    return favs.includes(id);
  }
  function isFavorito(id) {
    return getFavoritos().includes(id);
  }
  function initFavoritoBtn(id) {
    const btn = document.getElementById('btnFavorito');
    if (!btn) return;
    updateFavBtn(btn, isFavorito(id));
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const activo = toggleFavorito(id);
      updateFavBtn(btn, activo);
    });
  }
  function updateFavBtn(btn, activo) {
    btn.classList.toggle('is-fav', activo);
    btn.setAttribute('aria-label', activo ? 'Quitar de favoritos' : 'Guardar en favoritos');
  }

  // === Utils ===
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[s]));
  }
})();
