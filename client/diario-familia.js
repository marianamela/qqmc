/* =============================================================
   QQMC · Diario de Cuidado — Vista Familia
   Timeline en tiempo real con reacciones y resumen del día.
   Auto-refresh cada 30 segundos.
   ============================================================= */
(() => {
  const API = '/.netlify/functions/api';
  const REFRESH_MS = 30000; // 30 segundos

  // ---- Estado ----
  let contratoId = null;
  let familiaId = null;
  let fechaActual = new Date();
  let refreshTimer = null;
  let soloLectura = false; // true si la suscripción venció

  // ---- DOM ----
  const greeting       = document.getElementById('greeting');
  const personaCuidada = document.getElementById('personaCuidada');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText     = document.getElementById('statusText');
  const dateLabel      = document.getElementById('dateLabel');
  const btnPrevDay     = document.getElementById('btnPrevDay');
  const btnNextDay     = document.getElementById('btnNextDay');
  const resumenDiv     = document.getElementById('resumen');
  const resumenCard    = document.getElementById('resumenCard');
  const timelineList   = document.getElementById('timelineList');
  const emptyMsg       = document.getElementById('emptyMsg');
  const toast          = document.getElementById('toast');

  // ---- Init ----
  document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    contratoId = params.get('contrato');
    familiaId = params.get('familia');

    if (!contratoId || !familiaId) {
      showToast('Faltan datos del contrato');
      return;
    }

    // Verificar suscripción activa
    await checkSuscripcion();

    await loadContrato();
    updateDateUI();
    await refresh();
    await loadMensajesEnviados();

    // Auto-refresh (timeline + mensajes enviados)
    refreshTimer = setInterval(() => { refresh(); loadMensajesEnviados(); }, REFRESH_MS);

    // Navegación de fechas
    btnPrevDay.addEventListener('click', () => changeDate(-1));
    btnNextDay.addEventListener('click', () => changeDate(1));

    // Mensajes al cuidador
    const mensajeInput = document.getElementById('mensajeInput');
    const btnMensaje = document.getElementById('btnMensaje');
    const btnPriority = document.getElementById('btnPriority');
    const mensajeSent = document.getElementById('mensajeSent');
    let prioridadActual = 'normal';

    btnPriority.addEventListener('click', () => {
      prioridadActual = prioridadActual === 'normal' ? 'importante' : 'normal';
      btnPriority.classList.toggle('is-importante', prioridadActual === 'importante');
    });

    async function enviarMensaje() {
      const texto = mensajeInput.value.trim();
      if (!texto) return;
      btnMensaje.disabled = true;
      try {
        const res = await fetch(`${API}/diario/mensajes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contrato_id: contratoId,
            familia_id: familiaId,
            contenido: texto,
            prioridad: prioridadActual
          })
        });
        const json = await res.json();
        if (json.ok) {
          mensajeInput.value = '';
          prioridadActual = 'normal';
          btnPriority.classList.remove('is-importante');
          mensajeSent.textContent = '✓ Mensaje enviado';
          mensajeSent.classList.remove('hidden');
          setTimeout(() => mensajeSent.classList.add('hidden'), 2500);
          await loadMensajesEnviados();
        } else {
          showToast('Error al enviar');
        }
      } catch {
        showToast('Sin conexión');
      } finally {
        btnMensaje.disabled = false;
      }
    }

    btnMensaje.addEventListener('click', enviarMensaje);
    mensajeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); enviarMensaje(); }
    });
  });

  // ---- Verificar suscripción ----
  async function checkSuscripcion() {
    try {
      const res = await fetch(`${API}/suscripciones/estado?familia_id=${familiaId}`);
      const json = await res.json();
      if (json.ok && !json.data.tiene_acceso) {
        soloLectura = true;
        activarModoLectura();
      }
    } catch { /* offline: permitir acceso */ }
  }

  function activarModoLectura() {
    // Ocultar envío de mensajes
    const mensajeBar = document.getElementById('mensajeBar');
    if (mensajeBar) {
      mensajeBar.innerHTML = `
        <div style="text-align:center;padding:8px;width:100%">
          <p style="font-size:13px;color:var(--muted);margin:0 0 6px">
            🔒 Tu plan venció. Renovalo para enviar mensajes y recibir notificaciones.
          </p>
          <a href="/" style="font-size:13px;font-weight:700;color:var(--teal);text-decoration:none">
            Renovar plan →
          </a>
        </div>
      `;
    }
    // Marcar el auto-refresh como menos frecuente (solo historial)
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => refresh(), 120000); // cada 2 min en vez de 30s
  }

  // ---- Cargar contrato ----
  async function loadContrato() {
    try {
      const res = await fetch(`${API}/diario/contratos?familia_id=${familiaId}`);
      const json = await res.json();
      if (json.ok && json.data.length) {
        const contrato = json.data.find(c => c.id === contratoId) || json.data[0];
        personaCuidada.textContent = contrato.persona_cuidada || '';
        const cuidador = contrato.cuidadores;
        if (cuidador) {
          greeting.textContent = `Cuidado por ${cuidador.nombre} ${cuidador.apellido}`;
        }
      }
    } catch { /* silenciar */ }
  }

  // ---- Refresh (entradas + resumen) ----
  async function refresh() {
    const fecha = toDateStr(fechaActual);
    await Promise.all([
      loadTimeline(fecha),
      loadResumen(fecha)
    ]);
  }

  // ---- Timeline ----
  async function loadTimeline(fecha) {
    try {
      const res = await fetch(`${API}/diario/entradas?contrato_id=${contratoId}&fecha=${fecha}`);
      const json = await res.json();
      if (json.ok) {
        renderTimeline(json.data);
        updateStatus(json.data);
      }
    } catch { /* offline */ }
  }

  function renderTimeline(entries) {
    if (!entries.length) {
      timelineList.innerHTML = '<p class="diario-timeline__empty">Todavía no hay registros para este día.</p>';
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

      // Nombres asociados a la entrada
      const entryPersonas = e.metadata?.personas || [];
      const personasTag = entryPersonas.length > 0
        ? `<span class="timeline-entry__personas">${entryPersonas.join(', ')}</span>`
        : '';

      // Reacciones existentes
      const reacciones = (e.diario_reacciones || []).map(r =>
        `<span class="timeline-reaction">${r.tipo === 'corazon' ? '❤️' : r.tipo === 'gracias' ? '🙏' : '👁️'}${r.comentario ? ' ' + esc(r.comentario) : ''}</span>`
      ).join('');

      // ¿Ya reaccionó esta familia?
      const yaReacciono = (e.diario_reacciones || []).some(r => r.familia_id === familiaId);

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
          ${!soloLectura && !yaReacciono && e.tipo !== 'checkin' && e.tipo !== 'checkout'
            ? `<button class="timeline-entry__react-btn" data-entry-id="${e.id}">❤️ Me encanta</button>`
            : ''}
        </div>
      `;

      // Listener para reacción
      const reactBtn = el.querySelector('.timeline-entry__react-btn');
      if (reactBtn) {
        reactBtn.addEventListener('click', () => react(e.id, reactBtn));
      }

      timelineList.appendChild(el);
    });
  }

  // ---- Reaccionar a una entrada ----
  async function react(entradaId, btn) {
    btn.classList.add('is-reacted');
    btn.textContent = '❤️ Enviado';
    btn.disabled = true;

    try {
      await fetch(`${API}/diario/reaccion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entrada_id: entradaId,
          familia_id: familiaId,
          tipo: 'corazon'
        })
      });
      showToast('Reacción enviada');
    } catch {
      showToast('Error al enviar');
      btn.classList.remove('is-reacted');
      btn.textContent = '❤️ Me encanta';
      btn.disabled = false;
    }
  }

  // ---- Status del cuidador ----
  function updateStatus(entries) {
    const checkin = entries.find(e => e.tipo === 'checkin');
    const checkout = entries.find(e => e.tipo === 'checkout');

    if (checkin && !checkout) {
      statusIndicator.classList.add('is-active');
      statusText.textContent = `Presente desde las ${formatTime(new Date(checkin.created_at))}`;
    } else if (checkin && checkout) {
      statusIndicator.classList.remove('is-active');
      statusText.textContent = `Estuvo de ${formatTime(new Date(checkin.created_at))} a ${formatTime(new Date(checkout.created_at))}`;
    } else {
      statusIndicator.classList.remove('is-active');
      statusText.textContent = 'Esperando check-in';
    }
  }

  // ---- Resumen del día ----
  async function loadResumen(fecha) {
    try {
      const res = await fetch(`${API}/diario/resumen?contrato_id=${contratoId}&fecha=${fecha}`);
      const json = await res.json();
      if (json.ok && json.data.total_entradas > 0) {
        renderResumen(json.data);
        resumenDiv.classList.remove('hidden');
      } else {
        resumenDiv.classList.add('hidden');
      }
    } catch {
      resumenDiv.classList.add('hidden');
    }
  }

  function renderResumen(data) {
    const checkinStr = data.checkin ? formatTime(new Date(data.checkin)) : '—';
    const checkoutStr = data.checkout ? formatTime(new Date(data.checkout)) : 'en curso';

    const actResumen = data.actividades.map(a => `${a.icono} ${a.categoria}`);
    // Agrupar actividades por categoría y contar
    const conteo = {};
    actResumen.forEach(a => { conteo[a] = (conteo[a] || 0) + 1; });
    const actTexto = Object.entries(conteo)
      .map(([k, v]) => v > 1 ? `${k} (×${v})` : k)
      .join(' · ');

    resumenCard.innerHTML = `
      <div class="resumen__title">Resumen del día</div>
      <div class="resumen__stats">
        <div class="resumen__stat">
          <span class="resumen__stat-icon">🕐</span>
          ${checkinStr} → ${checkoutStr}
        </div>
        <div class="resumen__stat">
          <span class="resumen__stat-icon">📋</span>
          ${data.total_entradas} registros
        </div>
        ${data.fotos > 0 ? `
        <div class="resumen__stat">
          <span class="resumen__stat-icon">📷</span>
          ${data.fotos} foto${data.fotos > 1 ? 's' : ''}
        </div>` : ''}
      </div>
      ${actTexto ? `<div class="resumen__activities">${actTexto}</div>` : ''}
    `;
  }

  // ---- Navegación de fechas ----
  function changeDate(delta) {
    fechaActual.setDate(fechaActual.getDate() + delta);
    updateDateUI();
    refresh();
  }

  function updateDateUI() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const sel = new Date(fechaActual);
    sel.setHours(0, 0, 0, 0);

    if (sel.getTime() === hoy.getTime()) {
      dateLabel.textContent = 'Hoy';
    } else {
      const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      dateLabel.textContent = `${dias[fechaActual.getDay()]} ${fechaActual.getDate()} ${meses[fechaActual.getMonth()]}`;
    }

    // No permitir ir al futuro
    btnNextDay.disabled = sel >= hoy;
  }

  // ---- Historial de mensajes enviados ----
  async function loadMensajesEnviados() {
    const container = document.getElementById('mensajesHistorial');
    if (!container) return;
    try {
      const res = await fetch(`${API}/diario/mensajes?contrato_id=${contratoId}`);
      const json = await res.json();
      if (!json.ok) return;
      const mensajes = json.data || [];
      if (!mensajes.length) {
        container.classList.add('hidden');
        return;
      }
      container.classList.remove('hidden');
      const lista = container.querySelector('.mensajes-historial__list');
      lista.innerHTML = '';
      mensajes.forEach(m => {
        const el = document.createElement('div');
        const esImportante = m.prioridad === 'importante';
        el.className = `msg-enviado${esImportante ? ' msg-enviado--importante' : ''}`;

        const hora = formatTime(new Date(m.created_at));
        const fecha = formatFecha(new Date(m.created_at));

        let estadoHtml;
        if (m.leido) {
          const leidoHora = m.leido_at ? formatTime(new Date(m.leido_at)) : '';
          estadoHtml = `<span class="msg-enviado__estado msg-enviado__estado--leido">✓✓ Leído${leidoHora ? ' a las ' + leidoHora : ''}</span>`;
        } else {
          estadoHtml = '<span class="msg-enviado__estado msg-enviado__estado--pendiente">✓ Enviado · sin leer</span>';
        }

        el.innerHTML = `
          <div class="msg-enviado__header">
            <span class="msg-enviado__fecha">${fecha} ${hora}</span>
            ${esImportante ? '<span class="msg-enviado__badge">Importante</span>' : ''}
          </div>
          <div class="msg-enviado__texto">${esc(m.contenido)}</div>
          ${estadoHtml}
        `;
        lista.appendChild(el);
      });
    } catch { /* silenciar */ }
  }

  function formatFecha(date) {
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    const d = new Date(date);
    d.setHours(0,0,0,0);
    if (d.getTime() === hoy.getTime()) return 'Hoy';
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    if (d.getTime() === ayer.getTime()) return 'Ayer';
    return `${d.getDate()}/${d.getMonth()+1}`;
  }

  // ---- Utils ----
  function toDateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

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
})();
