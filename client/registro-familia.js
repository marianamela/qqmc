/* Registro de familia — formulario simplificado (Red de Confianza)
   Campos: nombre completo, email, zona, contraseña
   Flujo: formulario → crear cuenta → verificación Didit → aprobada/pendiente
*/
(() => {
  const API_BASE = '/.netlify/functions/api';

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('year').textContent = new Date().getFullYear();
    initSubmit();

    // GA4: registro iniciado
    if (window.CuidyAnalytics) {
      CuidyAnalytics.registrationStarted('familia');
    }
  });

  // === Validación ===
  function validate() {
    clearErrors();
    const form = document.getElementById('registroForm');

    const nombre = form.nombre.value.trim();
    if (!nombre) { markError('nombre', 'Campo requerido'); return false; }

    const email = form.email.value.trim();
    if (!email) { markError('email', 'Campo requerido'); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      markError('email', 'Email inválido'); return false;
    }

    const zona = form.zona.value.trim();
    if (!zona) { markError('zona', 'Campo requerido'); return false; }

    const password = form.password.value;
    if (!password) { markError('password', 'Campo requerido'); return false; }
    if (password.length < 8) { markError('password', 'Mínimo 8 caracteres'); return false; }

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

  // === Submit ===
  function initSubmit() {
    document.getElementById('registroForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validate()) return;

      const btn = document.getElementById('btnSubmit');
      btn.disabled = true;
      btn.textContent = 'Creando cuenta…';

      const form = e.target;
      const nombreCompleto = form.nombre.value.trim();
      const parts = nombreCompleto.split(/\s+/);
      const nombre = parts[0];
      const apellido = parts.slice(1).join(' ') || '';
      const email = form.email.value.trim();
      const zona = form.zona.value.trim();
      const password = form.password.value;

      try {
        // 1. Crear usuario en Supabase Auth + tabla familias
        const authResult = await authRegistro({
          nombre,
          apellido,
          email,
          telefono: '',
          password,
          zona
        });

        // 2. Actualizar la familia con zona (localidad)
        const session = getSession();
        const familiaId = session?.id;
        if (familiaId) {
          await fetch(`${API_BASE}/familias/${familiaId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              zona: { localidad: zona }
            })
          });
        }

        // GA4
        if (window.CuidyAnalytics) {
          CuidyAnalytics.registrationCompleted('familia', familiaId);
        }

        // Hide form, show verification step
        document.querySelector('.registro-split').style.display = 'none';
        document.getElementById('verifStep').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Start identity verification
        iniciarVerificacion(familiaId, email);

      } catch (err) {
        alert('No pudimos crear la cuenta: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Crear cuenta';
      }
    });
  }

  // ========== Verificación de identidad (Didit.me) ==========
  let diditVerificado = false;
  let pollingTimer = null;

  async function iniciarVerificacion(familiaId, email) {
    showVerifState('loading');

    try {
      const res = await fetch(`${API_BASE}/verificacion/iniciar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'familia', id: familiaId })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Error al iniciar verificación');

      // Already verified
      if (json.ya_verificado) {
        diditVerificado = true;
        mostrarResultadoAprobado();
        return;
      }

      // Sandbox mode (Didit not configured)
      if (json.sandbox) {
        showVerifState('sandbox');
        return;
      }

      // Didit session URL → show iframe
      if (json.url) {
        const iframe = document.getElementById('diditFrame');
        iframe.src = json.url;
        showVerifState('iframe');
        window.addEventListener('message', function onDiditMsg(event) {
          if (!event.data) return;
          const data = typeof event.data === 'string' ? (() => { try { return JSON.parse(event.data); } catch { return {}; } })() : event.data;
          if (data.type === 'didit_verification_complete' || data.status === 'Approved' || data.event === 'session_completed') {
            diditVerificado = true;
            window.removeEventListener('message', onDiditMsg);
            mostrarResultadoAprobado();
          }
        });
        startPolling(familiaId);
      } else {
        // No URL, poll for status
        startPolling(familiaId);
      }
    } catch (err) {
      console.error('[verificacion familia]', err);
      document.getElementById('verifErrorMsg').textContent = err.message;
      showVerifState('error');
    }

    // Retry button
    document.getElementById('btnRetryVerif').onclick = () => iniciarVerificacion(familiaId, email);

    // Skip buttons → go to pending review
    document.getElementById('btnSkipVerif').onclick = () => mostrarResultadoPendiente();
    document.getElementById('btnSkipVerifError').onclick = () => mostrarResultadoPendiente();
  }

  function showVerifState(state) {
    const map = {
      loading: 'verifLoading',
      iframe: 'verifIframe',
      sandbox: 'verifSandbox',
      error: 'verifError'
    };
    Object.values(map).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', map[state] !== id);
    });
  }

  function startPolling(familiaId) {
    if (pollingTimer) clearInterval(pollingTimer);
    let attempts = 0;
    pollingTimer = setInterval(async () => {
      attempts++;
      if (attempts > 60 || diditVerificado) { clearInterval(pollingTimer); return; }
      try {
        const res = await fetch(`${API_BASE}/verificacion/estado/${familiaId}?tipo=familia`);
        const json = await res.json();
        if (json.ok && json.verificacion) {
          if (json.verificacion.estado === 'approved') {
            diditVerificado = true;
            clearInterval(pollingTimer);
            mostrarResultadoAprobado();
          } else if (json.verificacion.estado === 'declined') {
            clearInterval(pollingTimer);
            mostrarResultadoPendiente();
          }
        }
      } catch {}
    }, 5000);
  }

  function mostrarResultadoAprobado() {
    document.getElementById('verifStep').classList.add('hidden');
    document.getElementById('verifApproved').classList.remove('hidden');
    // Update session state
    try {
      const session = JSON.parse(localStorage.getItem('qqmc_familia') || '{}');
      session.estado = 'identidad_aprobada';
      localStorage.setItem('qqmc_familia', JSON.stringify(session));
    } catch {}
    if (window.CuidyAnalytics) CuidyAnalytics.registrationStep('familia', 2, 'identidad_aprobada');
  }

  function mostrarResultadoPendiente() {
    if (pollingTimer) clearInterval(pollingTimer);
    document.getElementById('verifStep').classList.add('hidden');
    document.getElementById('verifPending').classList.remove('hidden');
    // Update session state
    try {
      const session = JSON.parse(localStorage.getItem('qqmc_familia') || '{}');
      session.estado = 'pendiente_revision';
      localStorage.setItem('qqmc_familia', JSON.stringify(session));
    } catch {}
  }
})();
