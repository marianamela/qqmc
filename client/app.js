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
    // Botón volver al paso 1 de planes
    const btnVolver = document.getElementById('btnVolverPlanes');
    if (btnVolver) {
      btnVolver.addEventListener('click', () => {
        document.getElementById('planesStep2').classList.add('hidden');
        document.getElementById('planesStep1').classList.remove('hidden');
        planSeleccionado = null;
      });
    }
    // Modal de contactos
    const modalContactos = document.getElementById('modalContactos');
    if (modalContactos) {
      modalContactos.addEventListener('click', (e) => {
        if (e.target.dataset.closeContactos !== undefined) cerrarModalContactos();
      });
    }
    // Modal de mis datos
    const modalMisDatos = document.getElementById('modalMisDatos');
    if (modalMisDatos) {
      modalMisDatos.addEventListener('click', (e) => {
        if (e.target.dataset.closeMisdatos !== undefined) cerrarModalMisDatos();
      });
    }
    // Modal recomendar cuidador
    const modalRecomendar = document.getElementById('modalRecomendar');
    if (modalRecomendar) {
      modalRecomendar.addEventListener('click', (e) => {
        if (e.target.dataset.closeRecomendar !== undefined) cerrarModalRecomendar();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { cerrarModal(); cerrarModalPlanes(); cerrarModalContactos(); cerrarModalMisDatos(); cerrarModalRecomendar(); }
    });

    // Nav: toggle familia logged-in state
    initFamiliaNav();
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

    modalPlanes.classList.remove('hidden');
    document.getElementById('planesStep1').classList.remove('hidden');
    document.getElementById('planesStep2').classList.add('hidden');
    planSeleccionado = null;
    // Limpiar nota al pie anterior si existe
    const notaAnterior = document.querySelector('.planes-diario-nota');
    if (notaAnterior) notaAnterior.remove();

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
        ${plan.incluye_diario ? '<div class="plan-card__diario">' + icon('check', 'success') + ' Incluye Diario de Cuidado *</div>' : ''}
      `;
      card.addEventListener('click', () => seleccionarPlan(plan, card));
      grid.appendChild(card);
    });

    // Agregar nota al pie si algún plan incluye diario
    if (planesData.some(p => p.incluye_diario)) {
      const nota = document.createElement('p');
      nota.className = 'planes-diario-nota';
      nota.innerHTML = '* <strong>Diario de Cuidado:</strong> Tu cuidador/a registra cada día qué hicieron, cómo estuvo y qué necesita quien cuida. Vos seguís todo desde tu celular en tiempo real, con tranquilidad y sin tener que preguntar.';
      grid.after(nota);
    }
  }

  function seleccionarPlan(plan, card) {
    planSeleccionado = plan;

    // Pasar a paso 2
    document.getElementById('planesStep1').classList.add('hidden');
    const step2 = document.getElementById('planesStep2');
    step2.classList.remove('hidden');

    // Render resumen del plan elegido
    const contactosTexto = plan.contactos_incluidos === null
      ? 'Contactos ilimitados'
      : plan.contactos_incluidos === 1
        ? '1 contacto'
        : `${plan.contactos_incluidos} contactos`;
    document.getElementById('planResumen').innerHTML = `
      <div class="plan-resumen__name">${escapeHtml(plan.nombre)}</div>
      <div class="plan-resumen__price">$${Number(plan.precio_ars).toLocaleString('es-AR')}</div>
      <div class="plan-resumen__detail">${contactosTexto}${plan.incluye_diario ? ' · ' + icon('check', 'success') + ' Diario de Cuidado' : ''}</div>
      ${plan.incluye_diario ? '<p class="plan-resumen__diario-nota">Tu cuidador/a registra cada día qué hicieron y cómo estuvo quien cuida. Seguí todo desde tu celular, con tranquilidad.</p>' : ''}
    `;

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
          // Actualizar nav para mostrar Mis Contactos / Salir
          initFamiliaNav();
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
      ? `${icon('starFilled', 'gold')} ${Number(c.valoracion).toFixed(1)} <span>(${c.resenas || 0} reseñas)</span>`
      : '<span style="color:var(--muted)">Sin reseñas aún</span>';
    el.innerHTML = `
      <img class="card__avatar" src="${c.foto}" alt="${c.nombre}" />
      <div class="card__body">
        <div class="card__name">
          ${escapeHtml(c.nombre)}${c.edad ? ', ' + c.edad : ''}
          ${c.verificado ? '<span class="card__badge">Verificado</span>' : ''}
          ${c.recomendado ? '<span class="card__badge card__badge--rec">Recomendado</span>' : ''}
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
        ? `${icon('starFilled', 'gold')} ${Number(c.valoracion).toFixed(1)} (${c.resenas || 0})`
        : 'Sin reseñas aún';
      const tarifaTxt = c.valor_hora_min
        ? `$${c.valor_hora_min.toLocaleString('es-AR')}${c.valor_hora_max && c.valor_hora_max !== c.valor_hora_min ? ' - $' + c.valor_hora_max.toLocaleString('es-AR') : ''}/h`
        : '';
      marker.bindPopup(`
        <div class="popup__name">${escapeHtml(c.nombre)}${c.edad ? ', ' + c.edad : ''}</div>
        <div class="popup__meta">${ESPECIALIDAD_LABEL[c.especialidad] || ''} · ${escapeHtml(c.zona)}</div>
        <div class="popup__meta">${ratingTxt}</div>
        ${tarifaTxt ? `<div class="popup__tarifa">${tarifaTxt}</div>` : ''}
        <a class="popup__link" data-cid="${c.id}">Ver ficha ${icon('arrowRight')}</a>
      `);
      marker.on('popupopen', (e) => {
        const link = e.popup.getElement().querySelector('.popup__link');
        if (link) link.addEventListener('click', () => abrirFicha(c.id));
        highlightCard(c.id);
      });
      marker.addTo(markersLayer);
      markersById.set(c.id, marker);
    });

    // Guardar bounds pendientes — se aplican después de invalidateSize
    if (markersById.size) {
      map._pendingFit = Array.from(markersById.values());
    }
  }

  // Aplicar zoom a markers después de que el mapa tenga dimensiones correctas
  function fitPendingBounds() {
    if (!map._pendingFit) return;
    const group = L.featureGroup(map._pendingFit);
    const bounds = group.getBounds();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const spread = Math.max(Math.abs(ne.lat - sw.lat), Math.abs(ne.lng - sw.lng));
    if (spread < 0.01) {
      map.setView(bounds.getCenter(), 14, { animate: false });
    } else {
      map.fitBounds(bounds.pad(0.1), { maxZoom: 15, animate: false });
    }
    delete map._pendingFit;
  }
  window.fitPendingBounds = fitPendingBounds;

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
              btnContactar.innerHTML = icon('check', 'success') + ' Mensaje enviado';
              document.getElementById('msgContactar').value = '';
              const info = document.querySelector('.contactar__info');
              // Sugerir completar perfil si la familia no tiene datos de búsqueda
              const fam = JSON.parse(localStorage.getItem('qqmc_familia') || '{}');
              if (!fam.busqueda || !fam.busqueda?.tipos?.length) {
                if (info) info.innerHTML = icon('check', 'success') + ' Tu mensaje fue enviado.<br><br>' + icon('lightbulb') + ' <strong>Tip:</strong> Completá tu perfil con el tipo de cuidado que buscás para que los cuidadores conozcan mejor tus necesidades. <a href="#" id="linkCompletarPerfil" style="color:var(--teal);text-decoration:underline">Completar perfil</a>';
                document.getElementById('linkCompletarPerfil')?.addEventListener('click', (ev) => {
                  ev.preventDefault();
                  cerrarModal();
                  if (typeof abrirMisDatos === 'function') abrirMisDatos(fam);
                });
              } else {
                if (info) info.textContent = 'Tu mensaje fue enviado. Cuando el cuidador acepte, se intercambiarán los datos de contacto.';
              }
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
    const familiaEstado = (JSON.parse(localStorage.getItem('qqmc_familia') || '{}')).estado;
    let contactoBloque;

    if (familiaEstado && familiaEstado !== 'aprobada' && !contactoVisible) {
      // Familia no verificada → bloquear contacto
      let estadoMsg, estadoTitle;
      if (familiaEstado === 'rechazada') {
        estadoTitle = icon('lock') + ' Verificación no aprobada';
        estadoMsg = 'Tu verificación de identidad no fue aprobada. Contactá a soporte@cuidy.com.ar si creés que es un error.';
      } else if (familiaEstado === 'pendiente') {
        estadoTitle = icon('lock') + ' Verificá tu identidad para contactar';
        estadoMsg = 'Para contactar cuidadores necesitás verificar tu identidad. Es rápido: solo una foto de tu DNI y una selfie.';
      } else {
        estadoTitle = icon('lock') + ' Verificación en revisión';
        estadoMsg = 'Tu identidad está en revisión. Te avisamos por WhatsApp cuando esté verificada y puedas contactar cuidadores.';
      }
      contactoBloque = `
        <div class="locked">
          <div class="locked__title">${estadoTitle}</div>
          <div class="locked__text">${estadoMsg}</div>
          ${familiaEstado === 'pendiente' ? `<a href="verificar-identidad.html" class="btn btn--primary btn--sm" style="margin-top:8px">Verificar mi identidad</a>` : ''}
          <p style="font-size:0.82rem;color:var(--muted);margin-top:8px">Podés navegar y conocer los perfiles mientras tanto.</p>
        </div>`;
    } else if (requiereSuscripcion) {
      // Estado 1: Sin suscripción → mostrar paywall
      contactoBloque = `
        <div class="locked">
          <div class="locked__title">${icon('lock')} Datos de contacto bloqueados</div>
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
          <p>${icon('phone')} ${escapeHtml(c.contacto.telefono || '')}</p>
          <p>${icon('mail')} ${escapeHtml(c.contacto.email || '')}</p>
        </div>`;
    } else if (solicitud) {
      // Estado 3: Ya envió solicitud → mostrar estado
      const estadoTexto = solicitud.estado === 'pendiente'
        ? icon('hourglass', 'warning') + ' Tu mensaje fue enviado. Estamos esperando la respuesta del cuidador.'
        : solicitud.estado === 'rechazada'
        ? icon('xCircle', 'danger') + ' El cuidador no aceptó la solicitud en este momento.'
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
      ? `${icon('starFilled', 'gold')} ${Number(c.valoracion).toFixed(1)} <span style="color:#6b7280;font-weight:400">(${c.resenas || 0} reseñas)</span>`
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
            ${c.verificado ? ` · <span class="verified-badge" tabindex="0">${icon('check', 'success')} Verificado
              <span class="verified-tooltip">Este perfil fue verificado por nuestro equipo: documentación revisada, entrevista aprobada y antecedentes chequeados.</span>
            </span>` : ''}
            ${c.recomendado ? ` · <span class="recommended-badge">${icon('starFilled', 'gold')} Recomendado</span>` : ''}
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

      ${c.valor_hora_min ? `<div class="profile__section">
        <h4>Valor hora</h4>
        <p class="profile__tarifa">$${c.valor_hora_min.toLocaleString('es-AR')}${c.valor_hora_max && c.valor_hora_max !== c.valor_hora_min ? ' - $' + c.valor_hora_max.toLocaleString('es-AR') : ''} /h</p>
      </div>` : ''}

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

  // === Familia Nav & User Menu ===
  function cerrarModalContactos() {
    document.getElementById('modalContactos')?.classList.add('hidden');
  }
  function cerrarModalMisDatos() {
    document.getElementById('modalMisDatos')?.classList.add('hidden');
  }
  function cerrarModalRecomendar() {
    document.getElementById('modalRecomendar')?.classList.add('hidden');
  }

  function initFamiliaNav() {
    const familia = JSON.parse(localStorage.getItem('qqmc_familia') || 'null');
    const navIngresar = document.getElementById('navIngresar');
    const navRegistrarme = document.getElementById('navRegistrarme');
    const userMenu = document.getElementById('userMenu');
    if (!userMenu) return;

    if (familia?.id) {
      // Hide guest buttons and "Soy cuidador", show user menu
      navIngresar?.classList.add('hidden');
      navRegistrarme?.classList.add('hidden');
      document.getElementById('navSoyCuidador')?.classList.add('hidden');
      userMenu.classList.remove('hidden');

      // Set avatar initial and name
      const initial = (familia.nombre || familia.email || '?').charAt(0).toUpperCase();
      document.getElementById('userAvatar').textContent = initial;
      document.getElementById('userName').textContent = familia.nombre || 'Mi cuenta';

      // Dropdown toggle
      const btn = document.getElementById('userMenuBtn');
      const dropdown = document.getElementById('userDropdown');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', () => dropdown.classList.add('hidden'));

      // Menu actions
      document.getElementById('menuMisContactos')?.addEventListener('click', () => {
        dropdown.classList.add('hidden');
        abrirMisContactos(familia.id);
      });
      document.getElementById('menuRecomendar')?.addEventListener('click', () => {
        dropdown.classList.add('hidden');
        abrirRecomendar(familia);
      });
      document.getElementById('menuMisDatos')?.addEventListener('click', () => {
        dropdown.classList.add('hidden');
        abrirMisDatos(familia);
      });
      document.getElementById('menuSalir')?.addEventListener('click', () => {
        localStorage.removeItem('qqmc_familia');
        window.location.reload();
      });

      // Banner de verificación pendiente
      const bannerVerif = document.getElementById('bannerVerificacion');
      if (bannerVerif && familia.estado && familia.estado !== 'aprobada') {
        const txtEl = bannerVerif.querySelector('.banner-verificacion__text');
        const iconEl = bannerVerif.querySelector('.banner-verificacion__icon');
        const ctaEl = document.getElementById('bannerVerifCta');

        if (familia.estado === 'rechazada') {
          iconEl.innerHTML = icon('xCircle', 'danger');
          txtEl.innerHTML = '<strong>Tu verificación de identidad no fue aprobada.</strong> Si creés que es un error, escribinos a soporte@cuidy.com.ar.';
          bannerVerif.style.background = '#fee2e2';
          bannerVerif.style.borderBottomColor = '#f87171';
          txtEl.style.color = '#991b1b';
          if (ctaEl) ctaEl.classList.add('hidden');
        } else if (familia.estado === 'pendiente_verificacion') {
          iconEl.innerHTML = icon('hourglass', 'warning');
          txtEl.innerHTML = '<strong>Tu verificación está en revisión.</strong> Podés navegar, buscar perfiles y recomendar cuidadores. Te avisamos por WhatsApp cuando esté aprobada.';
          bannerVerif.style.background = '#fef3c7';
          bannerVerif.style.borderBottomColor = '#f59e0b';
          if (ctaEl) ctaEl.classList.add('hidden');
        }
        // estado === 'pendiente': default banner with CTA to verify (already in HTML)

        bannerVerif.classList.remove('hidden');

        // Show "Verificar identidad" in menu for non-verified families
        if (familia.estado === 'pendiente') {
          document.getElementById('menuVerificar')?.classList.remove('hidden');
        }
      }

      // === Vista diferenciada: familia logueada ===
      // Ocultar secciones de landing (solo visitantes)
      document.querySelectorAll('[data-visitor-only]').forEach(el => el.classList.add('hidden'));

      // Mostrar bienvenida personalizada
      const welcomeEl = document.getElementById('welcomeFamilia');
      if (welcomeEl) {
        const nombreEl = document.getElementById('welcomeNombre');
        if (nombreEl) nombreEl.textContent = familia.nombre || '';
        welcomeEl.classList.remove('hidden');

        // Shortcuts
        document.getElementById('shortcutContactos')?.addEventListener('click', () => {
          abrirMisContactos(familia.id);
        });
        document.getElementById('shortcutRecomendar')?.addEventListener('click', () => {
          abrirRecomendar(familia);
        });
        document.getElementById('shortcutDatos')?.addEventListener('click', () => {
          abrirMisDatos(familia);
        });
      }

      // Actualizar título del asistente para familia logueada
      const tituloAsist = document.getElementById('asistenteTitulo');
      const subAsist = document.getElementById('asistenteSubtitulo');
      if (tituloAsist) tituloAsist.textContent = 'Tu asistente de búsqueda';
      if (subAsist) subAsist.textContent = 'Caro te ayuda a encontrar las mejores opciones según lo que necesitás.';
    }
  }

  // === Mis Datos ===
  function abrirMisDatos(familia) {
    const modal = document.getElementById('modalMisDatos');
    document.getElementById('mdNombre').value = familia.nombre || '';
    document.getElementById('mdApellido').value = familia.apellido || '';
    document.getElementById('mdEmail').value = familia.email || '';
    document.getElementById('mdTelefono').value = familia.telefono || '';

    // Poblar campos de búsqueda si existen
    const tipos = familia.busqueda?.tipos || [];
    document.getElementById('mdTipoNinera').checked = tipos.includes('ninera');
    document.getElementById('mdTipoAdulto').checked = tipos.includes('adulto_mayor');
    document.getElementById('mdTipoDomestica').checked = tipos.includes('domestica');
    document.getElementById('mdTipoCocinera').checked = tipos.includes('cocinera');
    document.getElementById('mdModalidad').value = familia.busqueda?.modalidad || '';

    // Poblar zona
    document.getElementById('mdProvincia').value = familia.zona?.provincia || '';
    document.getElementById('mdLocalidad').value = familia.zona?.localidad || '';

    const msg = document.getElementById('mdMsg');
    msg.classList.add('hidden');
    modal.classList.remove('hidden');

    // Form submit (remove previous listener by replacing)
    const form = document.getElementById('formMisDatos');
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    newForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = document.getElementById('mdNombre').value.trim();
      const apellido = document.getElementById('mdApellido').value.trim();
      const telefono = document.getElementById('mdTelefono').value.trim();
      if (!nombre) { alert('El nombre es obligatorio'); return; }

      // Recolectar tipos de cuidado
      const tiposSeleccionados = [];
      if (document.getElementById('mdTipoNinera').checked) tiposSeleccionados.push('ninera');
      if (document.getElementById('mdTipoAdulto').checked) tiposSeleccionados.push('adulto_mayor');
      if (document.getElementById('mdTipoDomestica').checked) tiposSeleccionados.push('domestica');
      if (document.getElementById('mdTipoCocinera').checked) tiposSeleccionados.push('cocinera');

      const modalidad = document.getElementById('mdModalidad').value;
      const provincia = document.getElementById('mdProvincia').value;
      const localidad = document.getElementById('mdLocalidad').value.trim();

      const btn = document.getElementById('btnGuardarDatos');
      btn.disabled = true;
      btn.textContent = 'Guardando…';
      try {
        const body = { nombre, apellido, telefono };
        if (tiposSeleccionados.length || modalidad) {
          body.busqueda = { tipos: tiposSeleccionados, modalidad };
        }
        if (provincia || localidad) {
          body.zona = { provincia, localidad };
        }

        const res = await fetch(`${API_BASE}/familias/${familia.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const json = await res.json();
        if (json.ok) {
          familia.nombre = nombre;
          familia.apellido = apellido;
          familia.telefono = telefono;
          if (body.busqueda) familia.busqueda = body.busqueda;
          if (body.zona) familia.zona = body.zona;
          familiaState = { ...familiaState, ...familia };
          localStorage.setItem('qqmc_familia', JSON.stringify(familiaState));
          document.getElementById('userName').textContent = nombre;
          document.getElementById('userAvatar').textContent = nombre.charAt(0).toUpperCase();
          const msgEl = document.getElementById('mdMsg');
          msgEl.innerHTML = icon('check', 'success') + ' Datos actualizados correctamente';
          msgEl.className = 'misdatos-msg misdatos-msg--ok';
          msgEl.classList.remove('hidden');
        } else {
          alert(json.error || 'Error al guardar');
        }
      } catch {
        alert('Sin conexión. Intentá nuevamente.');
      }
      btn.disabled = false;
      btn.textContent = 'Guardar cambios';
    });

    // Baja de cuenta familia
    const btnBajaFam = document.getElementById('btnBajaFamilia');
    if (btnBajaFam) {
      btnBajaFam.addEventListener('click', async () => {
        const confirmar = confirm('¿Estás seguro/a de que querés eliminar tu cuenta?\n\nTus datos se borrarán definitivamente en 30 días. Te vamos a enviar un email con un link para reactivarla si cambiás de opinión.');
        if (!confirmar) return;

        const msgEl = document.getElementById('bajaFamMsg');
        btnBajaFam.disabled = true;
        btnBajaFam.textContent = 'Procesando...';

        try {
          const email = document.getElementById('mdEmail')?.value;
          if (!email) throw new Error('No se pudo obtener el email');

          const res = await fetch(`${API_BASE}/auth/baja`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, tipo: 'familia' })
          });
          const data = await res.json();

          msgEl.style.display = 'block';
          if (data.ok) {
            msgEl.style.background = '#e6f9f0';
            msgEl.style.color = '#065f46';
            msgEl.style.border = '1px solid #a7f3d0';
            msgEl.textContent = data.mensaje;
            btnBajaFam.style.display = 'none';
            setTimeout(() => {
              localStorage.removeItem('cuidy_familia');
              window.location.href = '/';
            }, 4000);
          } else {
            msgEl.style.background = '#fef2f2';
            msgEl.style.color = '#991b1b';
            msgEl.style.border = '1px solid #fecaca';
            msgEl.textContent = data.error || 'Error al procesar la baja.';
            btnBajaFam.disabled = false;
            btnBajaFam.textContent = 'Dar de baja mi cuenta';
          }
        } catch (err) {
          msgEl.style.display = 'block';
          msgEl.style.background = '#fef2f2';
          msgEl.style.color = '#991b1b';
          msgEl.style.border = '1px solid #fecaca';
          msgEl.textContent = 'Error de conexión. Intentá de nuevo.';
          btnBajaFam.disabled = false;
          btnBajaFam.textContent = 'Dar de baja mi cuenta';
        }
      });
    }
  }

  async function abrirMisContactos(familiaId) {
    const modal = document.getElementById('modalContactos');
    const list = document.getElementById('contactosList');
    modal.classList.remove('hidden');
    list.innerHTML = '<p class="contactos-loading">Cargando solicitudes...</p>';

    try {
      const res = await fetch(`${API_BASE}/contactos/solicitudes?familia_id=${familiaId}`);
      const json = await res.json();
      if (!json.ok || !json.data?.length) {
        list.innerHTML = '<p class="contactos-empty">No tenés solicitudes de contacto todavía.</p>';
        return;
      }
      list.innerHTML = '';
      json.data.forEach(s => {
        const card = contactoCardEl(s);
        list.appendChild(card);
      });
    } catch (err) {
      list.innerHTML = '<p class="contactos-empty">Error al cargar solicitudes.</p>';
    }
  }

  function contactoCardEl(s) {
    const c = s.cuidadores || {};
    const nombre = `${c.nombre || ''} ${c.apellido || ''}`.trim();
    const esp = (c.especialidades || []).map(e => ESPECIALIDAD_LABEL[e] || e).join(', ');
    const loc = [c.localidad, c.provincia].filter(Boolean).join(', ');
    const foto = c.foto_url || 'assets/default-avatar.png';
    const tarifa = c.valor_hora_min
      ? `$${c.valor_hora_min.toLocaleString('es-AR')}${c.valor_hora_max && c.valor_hora_max !== c.valor_hora_min ? ' - $' + c.valor_hora_max.toLocaleString('es-AR') : ''}/h`
      : '';

    const estadoClass = s.estado === 'aceptada' ? 'contacto-estado--aceptada'
      : s.estado === 'rechazada' ? 'contacto-estado--rechazada'
      : 'contacto-estado--pendiente';
    const estadoLabel = s.estado === 'aceptada' ? 'Aceptada'
      : s.estado === 'rechazada' ? 'Rechazada'
      : 'Esperando respuesta';
    const estadoIcon = s.estado === 'aceptada' ? icon('checkCircle', 'success')
      : s.estado === 'rechazada' ? icon('xCircle', 'danger') : icon('hourglass', 'warning');

    let contactInfo = '';
    if (s.estado === 'aceptada') {
      contactInfo = `
        <div class="contacto-card__contacto">
          <strong>Datos de contacto:</strong>
          ${c.telefono ? `<span>${icon('phone')} ${escapeHtml(c.telefono)}</span>` : ''}
          ${c.email ? `<span>${icon('mail')} ${escapeHtml(c.email)}</span>` : ''}
        </div>`;
    }

    let respuesta = '';
    if (s.respuesta_cuidador) {
      respuesta = `<div class="contacto-card__respuesta"><em>"${escapeHtml(s.respuesta_cuidador)}"</em></div>`;
    }

    const fecha = new Date(s.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

    const div = document.createElement('div');
    div.className = 'contacto-card';
    div.innerHTML = `
      <div class="contacto-card__header">
        <img class="contacto-card__foto" src="${foto}" alt="${escapeHtml(nombre)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
        <div class="contacto-card__avatar-fallback" style="display:none;width:56px;height:56px;border-radius:50%;background:var(--teal);color:#fff;align-items:center;justify-content:center;font-size:1.2rem;font-weight:600;flex-shrink:0">${(c.nombre || '?').charAt(0).toUpperCase()}${(c.apellido || '').charAt(0).toUpperCase()}</div>
        <div class="contacto-card__info">
          <h4 class="contacto-card__nombre">${escapeHtml(nombre)}</h4>
          <span class="contacto-card__esp">${esp}</span>
          ${loc ? `<span class="contacto-card__loc">${icon('mapPin')} ${escapeHtml(loc)}</span>` : ''}
          ${tarifa ? `<span class="contacto-card__tarifa">${icon('dollarSign')} ${tarifa}</span>` : ''}
        </div>
        <span class="contacto-estado ${estadoClass}">${estadoIcon} ${estadoLabel}</span>
      </div>
      <div class="contacto-card__mensaje"><strong>Tu mensaje:</strong> ${escapeHtml(s.mensaje)}</div>
      ${respuesta}
      ${contactInfo}
      <div class="contacto-card__footer">
        <span class="contacto-card__fecha">${fecha}</span>
        <button class="contacto-card__ver-perfil btn btn--ghost btn--sm">Ver perfil</button>
      </div>`;

    // Click en "Ver perfil" → abrir ficha del cuidador
    div.querySelector('.contacto-card__ver-perfil').addEventListener('click', () => {
      cerrarModalContactos();
      abrirFicha(c.id);
    });

    return div;
  }

  // === Recomendar Cuidador ===
  async function abrirRecomendar(familia) {
    const modal = document.getElementById('modalRecomendar');
    modal.classList.remove('hidden');

    // Reset form
    document.getElementById('recNombre').value = '';
    document.getElementById('recTelefono').value = '';
    const msgEl = document.getElementById('recMsg');
    msgEl.classList.add('hidden');

    // Load invitations list
    cargarInvitaciones(familia.id);

    // Setup form submit (remove previous listener)
    const form = document.getElementById('formRecomendar');
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);

    newForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const telefono = document.getElementById('recTelefono').value.trim();
      const nombre = document.getElementById('recNombre').value.trim();
      const btn = document.getElementById('btnEnviarInvitacion');
      const msg = document.getElementById('recMsg');

      // Validate phone format
      const telLimpio = telefono.replace(/[\s\-()]/g, '');
      if (!/^\+?54\d{10,12}$/.test(telLimpio) && !/^\d{10,13}$/.test(telLimpio)) {
        msg.textContent = 'Ingresá un número de WhatsApp válido (ej: +54 9 11 1234-5678)';
        msg.className = 'recomendar-msg recomendar-msg--error';
        msg.classList.remove('hidden');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Enviando...';
      msg.classList.add('hidden');

      try {
        const res = await fetch(`${API_BASE}/invitaciones`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            familia_id: familia.id,
            telefono_cuidador: telLimpio.startsWith('+') ? telLimpio : '+' + telLimpio,
            nombre_cuidador: nombre || undefined
          })
        });
        const json = await res.json();
        if (json.ok) {
          msg.innerHTML = icon('check', 'success') + ' Invitación enviada por WhatsApp';
          msg.className = 'recomendar-msg recomendar-msg--ok';
          msg.classList.remove('hidden');
          document.getElementById('recNombre').value = '';
          document.getElementById('recTelefono').value = '';
          // Refresh list
          cargarInvitaciones(familia.id);
          // GA4 event
          if (typeof gtag === 'function') {
            gtag('event', 'invitacion_enviada', { method: 'panel_familia' });
          }
        } else {
          msg.textContent = json.error || 'Error al enviar la invitación';
          msg.className = 'recomendar-msg recomendar-msg--error';
          msg.classList.remove('hidden');
        }
      } catch {
        msg.textContent = 'Sin conexión. Intentá nuevamente.';
        msg.className = 'recomendar-msg recomendar-msg--error';
        msg.classList.remove('hidden');
      }
      btn.disabled = false;
      btn.textContent = 'Enviar invitación por WhatsApp';
    });
  }

  async function cargarInvitaciones(familiaId) {
    const list = document.getElementById('invitacionesList');
    list.innerHTML = '<p class="invitaciones-empty">Cargando...</p>';

    try {
      const res = await fetch(`${API_BASE}/invitaciones/mis-invitaciones?familia_id=${familiaId}`);
      const json = await res.json();
      if (!json.ok || !json.data?.length) {
        list.innerHTML = '<p class="invitaciones-empty">No enviaste invitaciones todavía. Recomendá a un/a cuidador/a de confianza.</p>';
        return;
      }
      list.innerHTML = '';
      json.data.forEach(inv => {
        const card = invitacionCardEl(inv);
        list.appendChild(card);
      });
    } catch {
      list.innerHTML = '<p class="invitaciones-empty">Error al cargar invitaciones.</p>';
    }
  }

  function invitacionCardEl(inv) {
    const nombre = inv.nombre_cuidador || 'Sin nombre';
    const fecha = new Date(inv.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

    const estadoMap = {
      enviada: { icon: icon('send'), label: 'Enviada', cls: 'inv-estado--enviada' },
      abierta: { icon: icon('eye'), label: 'Link abierto', cls: 'inv-estado--abierta' },
      completada: { icon: icon('checkCircle', 'success'), label: 'Registrado/a', cls: 'inv-estado--completada' },
      expirada: { icon: icon('clock', 'warning'), label: 'Expirada', cls: 'inv-estado--expirada' }
    };
    const est = estadoMap[inv.estado] || estadoMap.enviada;

    const div = document.createElement('div');
    div.className = 'invitacion-card';
    div.innerHTML = `
      <div class="invitacion-card__info">
        <span class="invitacion-card__nombre">${escapeHtml(nombre)}</span>
        <span class="invitacion-card__tel">${escapeHtml(inv.telefono_cuidador)}</span>
      </div>
      <div class="invitacion-card__meta">
        <span class="inv-estado ${est.cls}">${est.icon} ${est.label}</span>
        <span class="invitacion-card__fecha">${fecha}</span>
      </div>`;
    return div;
  }

  // === Utils ===
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[s]));
  }
})();
