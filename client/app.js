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
    initForm();
    initModal();
    // Búsqueda inicial mostrando todos
    fetchCuidadores({ tipo: 'todos', zona: '' });
  });

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
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cerrarModal();
    });
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
    const res = await fetch(`${API_BASE}/cuidadores/${id}`);
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
    list.innerHTML = `<p class="results__hint" style="margin-bottom:10px">
      ${cuidadores.length} resultado${cuidadores.length === 1 ? '' : 's'}
    </p>`;
    cuidadores.forEach(c => list.appendChild(cardEl(c)));
  }

  function cardEl(c) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = c.id;
    el.innerHTML = `
      <img class="card__avatar" src="${c.foto}" alt="${c.nombre}" />
      <div class="card__body">
        <div class="card__name">
          ${escapeHtml(c.nombre)}, ${c.edad}
          ${c.verificado ? '<span class="card__badge">Verificado</span>' : ''}
        </div>
        <div class="card__meta">${ESPECIALIDAD_LABEL[c.especialidad] || ''} · ${escapeHtml(c.zona)}</div>
        <div class="card__rating">★ ${c.valoracion.toFixed(1)} <span>(${c.resenas} reseñas)</span></div>
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

    cuidadores.forEach(c => {
      const marker = L.circleMarker([c.lat, c.lng], {
        radius: 10,
        color: '#fff',
        weight: 2,
        fillColor: COLORS[c.especialidad] || '#6d28d9',
        fillOpacity: 0.95
      });
      marker.bindPopup(`
        <div class="popup__name">${escapeHtml(c.nombre)}, ${c.edad}</div>
        <div class="popup__meta">${ESPECIALIDAD_LABEL[c.especialidad] || ''} · ${escapeHtml(c.zona)}</div>
        <div class="popup__meta">★ ${c.valoracion.toFixed(1)} (${c.resenas})</div>
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

    // Ajustar vista a los markers
    if (cuidadores.length) {
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
      const { data: c, requiere_suscripcion } = await fetchCuidadorDetalle(id);
      body.innerHTML = fichaHtml(c, requiere_suscripcion);
    } catch (err) {
      body.innerHTML = `<p>Error: ${err.message}</p>`;
    }
  }

  function cerrarModal() {
    document.getElementById('modal').classList.add('hidden');
  }

  function fichaHtml(c, requiereSuscripcion) {
    const contactoBloque = requiereSuscripcion
      ? `
        <div class="locked">
          <div class="locked__title">🔒 Datos de contacto bloqueados</div>
          <div class="locked__text">
            Para ver teléfono y email de ${escapeHtml(c.nombre.split(' ')[0])} necesitás
            un plan activo o el pago único de contacto.
          </div>
          <button class="btn btn--primary">Ver planes</button>
        </div>`
      : `
        <div class="profile__section">
          <h4>Contacto</h4>
          <p>📞 ${escapeHtml(c.contacto?.telefono || '')}</p>
          <p>✉️ ${escapeHtml(c.contacto?.email || '')}</p>
        </div>`;

    return `
      <div class="profile__head">
        <img class="profile__avatar" src="${c.foto}" alt="${escapeHtml(c.nombre)}" />
        <div>
          <h3 class="profile__name">${escapeHtml(c.nombre)}, ${c.edad}</h3>
          <div class="profile__sub">
            ${ESPECIALIDAD_LABEL[c.especialidad] || ''} · ${escapeHtml(c.zona)}
          </div>
          <div class="profile__sub" style="color:#f59e0b;font-weight:600;margin-top:4px">
            ★ ${c.valoracion.toFixed(1)} <span style="color:#6b7280;font-weight:400">(${c.resenas} reseñas)</span>
            ${c.verificado ? ' · <span style="color:#10b981">✓ Verificado</span>' : ''}
          </div>
        </div>
      </div>

      <div class="profile__section">
        <h4>Sobre mí</h4>
        <p>${escapeHtml(c.bio || '')}</p>
      </div>

      <div class="profile__section">
        <h4>Experiencia</h4>
        <p>${c.experiencia_anios} años en el rubro</p>
      </div>

      <div class="profile__section">
        <h4>Disponibilidad</h4>
        <p>${escapeHtml(c.disponibilidad || '')}</p>
      </div>

      ${contactoBloque}
    `;
  }

  // === Utils ===
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[s]));
  }
})();
