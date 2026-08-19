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
    registrada: icon('inbox') + ' Candidatura registrada',
    identidad_aprobada: icon('checkCircle', 'success') + ' Identidad aprobada',
    perfil_completado: icon('clipboardList') + ' Perfil profesional completado',
    correccion_pedida: icon('penLine') + ' Correcciones pedidas',
    correccion_recibida: icon('undo') + ' Correcciones recibidas',
    entrevista_agendada: icon('calendar') + ' Entrevista agendada',
    entrevista_realizada: icon('video') + ' Entrevista realizada',
    aprobada: icon('check') + ' Candidatura aprobada',
    rechazada: icon('xCircle', 'danger') + ' Candidatura rechazada',
    suspendida: icon('pause') + ' Perfil suspendido',
    nota_interna: icon('fileText') + ' Nota interna',
    antecedentes_actualizados: icon('refreshCw') + ' Antecedentes actualizados'
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
  return `<span class="rating">${icon("starFilled", "gold")} ${v.toFixed(1)}</span><small style="color:var(--muted); margin-left:4px">(${resenas || 0})</small>`;
}
// --- Subnav: agregar link Usuarios si es superadmin ---
function addUsuariosNav() {
  if (!session || session.role !== 'superadmin') return;
  document.querySelectorAll('.admin-subnav').forEach(nav => {
    if (nav.querySelector('a[href="usuarios.html"]')) return;
    const a = document.createElement('a');
    a.href = 'usuarios.html';
    a.innerHTML = icon('users') + ' Usuarios';
    if (location.pathname.endsWith('/usuarios.html')) a.classList.add('is-active');
    nav.appendChild(a);
  });
}

function addFamiliasNav() {
  document.querySelectorAll('.admin-subnav').forEach(nav => {
    if (nav.querySelector('a[href="familias.html"]')) return;
    // Insertar después del primer link (Candidaturas)
    const first = nav.querySelector('a');
    const a = document.createElement('a');
    a.href = 'familias.html';
    a.innerHTML = icon('users') + ' Familias';
    if (location.pathname.endsWith('/familias.html')) a.classList.add('is-active');
    if (first && first.nextSibling) {
      nav.insertBefore(a, first.nextSibling);
    } else {
      nav.appendChild(a);
    }
  });
}

function addOperacionesNav() {
  document.querySelectorAll('.admin-subnav').forEach(nav => {
    if (nav.querySelector('a[href="operaciones.html"]')) return;
    const a = document.createElement('a');
    a.href = 'operaciones.html';
    a.innerHTML = icon('settings') + ' Operaciones';
    if (location.pathname.endsWith('/operaciones.html')) a.classList.add('is-active');
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
