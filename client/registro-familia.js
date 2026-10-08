/* Registro de familia — formulario simplificado (Red de Confianza)
   Campos: nombre completo, email, zona, contraseña
   Flujo: formulario → crear cuenta → modal éxito → home
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
        if (session?.id) {
          await fetch(`${API_BASE}/familias/${session.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              zona: { localidad: zona }
            })
          });
        }

        // GA4
        if (window.CuidyAnalytics) {
          CuidyAnalytics.registrationCompleted('familia', session?.id);
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
})();
