/* =============================================================
   QQMC · Auth (Supabase Auth + Google SSO)
   Usado por login.html y registro-familia.html
   ============================================================= */

const SUPABASE_URL = 'https://uvndeeabgjkjwxbfdsmi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bmRlZWFiZ2prand4YmZkc21pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDE3OTUsImV4cCI6MjA5MTcxNzc5NX0.fLgkUroPQmgiaa0Qf4wngUa-C4r34bpLrUag7NCLuo0';
const API = '/.netlify/functions/api';

// Supabase client minimal (solo auth, sin SDK pesado)
const supabaseAuth = {
  async signUp(email, password, metadata) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ email, password, data: metadata })
    });
    const json = await res.json();
    if (json.error || json.msg) throw new Error(json.error?.message || json.msg || 'Error al registrar');
    return json;
  },

  async signIn(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ email, password })
    });
    const json = await res.json();
    if (json.error || json.error_description) throw new Error(json.error_description || json.error || 'Credenciales incorrectas');
    return json;
  },

  async signInWithGoogle() {
    const redirectTo = window.location.origin + '/auth-callback.html';
    const url = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
    window.location.href = url;
  },

  async getUser(accessToken) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_ANON_KEY
      }
    });
    return res.json();
  }
};

// ---- Guardar sesión ----
function saveSession(session, familiaData) {
  const state = {
    id: familiaData?.id || session.user?.id || session.id,
    nombre: familiaData?.nombre || session.user?.user_metadata?.nombre || session.user?.user_metadata?.full_name?.split(' ')[0] || '',
    apellido: familiaData?.apellido || session.user?.user_metadata?.apellido || '',
    email: session.user?.email || familiaData?.email || '',
    telefono: familiaData?.telefono || '',
    estado: familiaData?.estado || 'pendiente',
    auth_token: session.access_token,
    suscripcion_activa: false
  };
  localStorage.setItem('qqmc_familia', JSON.stringify(state));
  return state;
}

function getSession() {
  return JSON.parse(localStorage.getItem('qqmc_familia') || 'null');
}

function logout() {
  localStorage.removeItem('qqmc_familia');
  window.location.href = '/';
}

// ---- Login con email/password ----
async function authLogin(email, password) {
  const session = await supabaseAuth.signIn(email, password);

  // Buscar familia en nuestra tabla
  const res = await fetch(`${API}/familias/me?email=${encodeURIComponent(email)}`);
  const json = await res.json();
  const familiaData = json.ok ? json.data : null;

  saveSession(session, familiaData);
  window.location.href = '/';
}

// ---- Registro con email/password ----
async function authRegistro(datos) {
  // 1. Crear usuario en Supabase Auth
  const session = await supabaseAuth.signUp(datos.email, datos.password, {
    nombre: datos.nombre,
    apellido: datos.apellido
  });

  // 2. Crear familia en nuestra tabla
  const familiaId = session.user?.id || session.id;

  // Tracking: referido y UTMs
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref') || sessionStorage.getItem('cuidy_ref_code') || null;
  const utmSource = urlParams.get('utm_source') || sessionStorage.getItem('cuidy_utm_source') || null;
  const utmCampaign = urlParams.get('utm_campaign') || sessionStorage.getItem('cuidy_utm_campaign') || null;

  // Validar referido si hay código
  let referredBy = null;
  if (refCode) {
    try {
      const refRes = await fetch(`${API}/referidos/validar?codigo=${encodeURIComponent(refCode)}`);
      const refData = await refRes.json();
      if (refData.ok) referredBy = refData.data.id;
    } catch {}
  }

  const res = await fetch(`${API}/familias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cuenta: {
        nombre: datos.nombre,
        apellido: datos.apellido || '',
        email: datos.email,
        telefono: datos.telefono || ''
      },
      busqueda: {},
      detalle: {},
      zona: {},
      preferencias: {},
      referred_by: referredBy,
      utm_source: utmSource,
      utm_campaign: utmCampaign
    })
  });
  const json = await res.json();

  // Completar referido en el backend
  const realId = json.data?.id || familiaId;
  if (refCode && realId) {
    fetch(`${API}/referidos/completar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: refCode, referee_id: realId, referee_tipo: 'familia' })
    }).catch(() => {});
  }

  // GA4: registro completado
  if (window.CuidyAnalytics) {
    CuidyAnalytics.registrationCompleted('familia', realId);
  }

  saveSession(session, {
    id: realId,
    nombre: datos.nombre,
    apellido: datos.apellido,
    email: datos.email,
    telefono: datos.telefono
  });

  return json;
}

// ---- Google SSO ----
async function authGoogle() {
  await supabaseAuth.signInWithGoogle();
}

// ---- Actualizar UI del menú según estado de login ----
// La lógica principal del user-menu (dropdown, mis contactos, mis datos)
// está en app.js → initFamiliaNav(). Aquí solo ocultamos/mostramos
// los elementos correctos para páginas que no cargan app.js.
function updateNavAuth() {
  const session = getSession();
  const nav = document.querySelector('.topbar__nav');
  if (!nav) return;

  // Si tiene el nuevo user-menu (index.html), dejar que app.js lo maneje
  const userMenu = document.getElementById('userMenu');
  if (userMenu) return;

  // Para otras páginas (registro, login, etc): fallback simple
  if (session?.id && session?.nombre) {
    const loginBtn = nav.querySelector('a[href="login.html"]');
    const regBtn = nav.querySelector('a[href="registro-familia.html"]');
    if (loginBtn) {
      loginBtn.textContent = session.nombre;
      loginBtn.href = '#';
      loginBtn.classList.remove('btn--ghost');
      loginBtn.classList.add('auth-user-name');
    }
    if (regBtn) {
      regBtn.textContent = 'Salir';
      regBtn.href = '#';
      regBtn.className = 'btn btn--ghost';
      regBtn.addEventListener('click', (e) => { e.preventDefault(); logout(); });
    }
  }
}

// Auto-update nav on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateNavAuth);
} else {
  updateNavAuth();
}
