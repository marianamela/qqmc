/* Utilidades compartidas del panel admin */
const API = '/.netlify/functions/api';
let session = null;

async function ensureSession() {
  try {
    const r = await fetch(API + '/admin/me', { credentials: 'same-origin' });
    const j = await r.json();
    if (j.ok && j.data) {
      session = j.data;
      return true;
    }
  } catch {}
  // Sin sesión → a login
  if (!location.pathname.endsWith('/login.html')) location.href = 'login.html';
  return false;
}

async function adminFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  if (res.status === 401) { location.href = 'login.html'; return { ok: false, error: 'No autenticado' }; }
  try { return await res.json(); }
  catch { return { ok: false, error: 'Respuesta inválida' }; }
}

async function logout() {
  await fetch(API + '/admin/logout', { method: 'POST', credentials: 'same-origin' });
  location.href = 'login.html';
}

// --- Labels ---
function labelEstado(e) {
  return ({
    borrador: 'Borrador',
    enviado: 'Enviado',
    identidad_aprobada: 'Identidad OK',
    perfil_completo: 'Perfil completo',
    en_revision: 'En revisión',
    correcciones_pedidas: 'Correcciones pedidas',
    entrevista_agendada: 'Entrevista agendada',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado',
    suspendido: 'Suspendido',
    vencido: 'Antec. vencidos'
  })[e] || e;
}
function labelEsp(e) {
  return ({ ninera: 'Niñera', adulto_mayor: 'Adulto mayor', domestica: 'Empl. doméstica', cocinera: 'Cocinera' })[e] || e;
}
function labelDoc(d) {
  return ({
    dni_frente: 'DNI frente', dni_dorso: 'DNI dorso',
    selfie_dni: 'Selfie con DNI', antecedentes: 'Antecedentes penales',
    cert_rcp: 'Certificado RCP', cert_otros: 'Otros certificados',
    cv: 'Curriculum Vitae'
  })[d] || d;
}
function labelEvento(t) {
  return ({
    registrada: '📥 Candidatura registrada',
    identidad_aprobada: '✅ Identidad aprobada',
    perfil_completado: '📋 Perfil profesional completado',
    correccion_pedida: '✏️ Correcciones pedidas',
    correccion_recibida: '↩️ Correcciones recibidas',
    entrevista_agendada: '📅 Entrevista agendada',
    entrevista_realizada: '🎥 Entrevista realizada',
    aprobada: '✓ Candidatura aprobada',
    rechazada: '✗ Candidatura rechazada',
    suspendida: '⏸ Perfil suspendido',
    nota_interna: '📝 Nota interna',
    antecedentes_actualizados: '🔄 Antecedentes actualizados'
  })[t] || t;
}

// --- Formatters ---
function fmtFecha(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      (String(d).includes('T') && !String(d).endsWith('00:00:00') ?
        ' ' + dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '');
  } catch { return String(d); }
}
function fmtVence(d) {
  if (!d) return '—';
  const dias = Math.round((new Date(d) - Date.now()) / 864e5);
  if (dias < 0) return `<span style="color:var(--magenta)">Vencido</span>`;
  if (dias < 30) return `<span style="color:#b45309">${dias}d</span>`;
  return fmtFecha(d);
}
function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtValoracion(valor, resenas) {
  const v = Number(valor);
  if (!v || v <= 0) return `<span style="color:var(--muted)">Sin reseñas</span>`;
  return `<span class="rating">★ ${v.toFixed(1)}</span><small style="color:var(--muted); margin-left:4px">(${resenas || 0})</small>`;
}
// --- Subnav: agregar link Usuarios si es superadmin ---
function addUsuariosNav() {
  if (!session || session.role !== 'superadmin') return;
  document.querySelectorAll('.admin-subnav').forEach(nav => {
    if (nav.querySelector('a[href="usuarios.html"]')) return;
    const a = document.createElement('a');
    a.href = 'usuarios.html';
    a.textContent = '👥 Usuarios';
    if (location.pathname.endsWith('/usuarios.html')) a.classList.add('is-active');
    nav.appendChild(a);
  });
}

function fmtHora(iso) {
  if (!iso) return '—';
  try {
    const dt = new Date(iso);
    return dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
