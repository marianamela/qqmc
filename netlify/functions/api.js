/* =============================================================
   QQMC · API (Netlify Functions)
   - Público: GET /cuidadores, GET /cuidadores/:id, POST /cuidadores, POST /familias
   - Admin:   POST /admin/login, POST /admin/logout, GET /admin/me,
              GET /admin/candidaturas (filtros: estado,q,especialidad,zona,min_valoracion),
              GET /admin/candidaturas/:id,
              PATCH /admin/candidaturas/:id (cambio de estado + metadata),
              POST /admin/candidaturas/:id/notas,
              GET /admin/schedule, PUT /admin/schedule,
              GET /admin/entrevistas?from&to,
              GET /admin/entrevistas/slots?fecha=YYYY-MM-DD,
              GET /admin/usuarios, POST /admin/usuarios,
              PATCH /admin/usuarios/:id, DELETE /admin/usuarios/:id,
              GET /admin/familias, GET /admin/familias/:id, PATCH /admin/familias/:id
   ============================================================= */

const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')
const webpush = require('web-push')
let MercadoPagoConfig, Preference, Payment
try {
  const mp = require('mercadopago')
  MercadoPagoConfig = mp.MercadoPagoConfig
  Preference = mp.Preference
  Payment = mp.Payment
} catch { /* mercadopago no instalado — modo simulación */ }

// ---- Supabase clients ----------------------------------------
// Public client (ANON key): respeta RLS, solo ve cuidadores aprobados
const supabase = process.env.SUPABASE_URL
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null

// Admin client (SERVICE_ROLE key): bypasea RLS para operaciones internas
const supabaseAdmin = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null

// ---- Web Push ------------------------------------------------
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      'mailto:' + (process.env.VAPID_EMAIL || 'contacto@qqmc.com.ar'),
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    )
  } catch (err) {
    console.warn('[vapid] No se pudo configurar web-push:', err.message)
  }
}

async function enviarPush(usuarioTipo, usuarioId, payload) {
  if (!process.env.VAPID_PUBLIC_KEY || !supabaseAdmin) return
  try {
    const { data: subs } = await supabaseAdmin.from('push_suscripciones')
      .select('endpoint,keys').eq('usuario_tipo', usuarioTipo).eq('usuario_id', usuarioId)
    if (!subs || !subs.length) return
    const body = JSON.stringify(payload)
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body)
      } catch (err) {
        // Si la suscripción expiró (410 Gone), la eliminamos
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabaseAdmin.from('push_suscripciones').delete().eq('endpoint', sub.endpoint)
        }
      }
    }
  } catch (err) {
    console.error('[push] error:', err.message)
  }
}

// ---- WhatsApp Business API (Meta Cloud API) --------------------
const WA_PHONE_ID = process.env.WA_PHONE_ID || process.env.WHATSAPP_PHONE_ID || ''
const WA_TOKEN = process.env.WA_TOKEN || process.env.WHATSAPP_TOKEN || ''
const WA_API = `https://graph.facebook.com/v25.0/${WA_PHONE_ID}/messages`

/**
 * Normalizar teléfono argentino a formato internacional E.164: 549XXXXXXXXXX
 * Acepta: +54 9 11 1234-5678, 54911 12345678, 011 15 1234-5678, 11 1234-5678, etc.
 */
function normalizarTelefono(raw) {
  if (!raw) return null
  // Remover todo excepto dígitos y el + inicial
  let digits = raw.replace(/[^\d]/g, '')
  // Si empieza con 0, quitar (ej: 011 → 11)
  if (digits.startsWith('0')) digits = digits.substring(1)
  // Si empieza con 15, quitar (viejo formato celular)
  if (digits.startsWith('15') && digits.length <= 10) digits = digits.substring(2)
  // Si empieza con 54 pero no con 549, agregar 9 (celular)
  if (digits.startsWith('54') && !digits.startsWith('549')) {
    digits = '549' + digits.substring(2)
  }
  // Si no empieza con 54, agregar 549
  if (!digits.startsWith('54')) {
    digits = '549' + digits
  }
  // Validar longitud: 549 + 10 dígitos = 13
  if (digits.length < 12 || digits.length > 13) return null
  return digits
}

function validarTelefonoArgentino(raw) {
  return normalizarTelefono(raw) !== null
}

/**
 * Enviar mensaje de WhatsApp usando Meta Cloud API
 * @param {string} to - Número en formato E.164 sin + (ej: 5491112345678)
 * @param {string} templateName - Nombre del template aprobado en Meta
 * @param {string} languageCode - Código de idioma (default: es_AR)
 * @param {Array} components - Parámetros del template
 */
async function enviarWhatsApp(to, templateName, languageCode = 'es_AR', components = []) {
  if (!WA_PHONE_ID || !WA_TOKEN) {
    console.log(`[whatsapp] Modo simulado → template="${templateName}" to=${to}`, JSON.stringify(components))
    return { simulado: true }
  }
  try {
    const body = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length ? { components } : {})
      }
    }
    const res = await fetch(WA_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    if (!res.ok) {
      console.error('[whatsapp] error:', JSON.stringify(data))
      return { error: data }
    }
    console.log(`[whatsapp] enviado → ${to} template=${templateName}`)
    return data
  } catch (err) {
    console.error('[whatsapp] excepción:', err.message)
    return { error: err.message }
  }
}

/**
 * Enviar mensaje de texto libre por WhatsApp (para OTP, etc.)
 */
// Formato alternativo con "15" (legacy argentino) como fallback
// Ej: 5491141985184 → 54111541985184
function formatoWhatsAppLegacy(num) {
  if (!num || !num.startsWith('549')) return null
  const sinPrefijo = num.substring(3) // quitar 549
  if (sinPrefijo.length === 10) {
    const codArea = sinPrefijo.substring(0, 2)
    const numero = sinPrefijo.substring(2)
    return `54${codArea}15${numero}`
  }
  return null
}

async function enviarWhatsAppTexto(to, texto) {
  if (!WA_PHONE_ID || !WA_TOKEN) {
    console.log(`[whatsapp] Modo simulado → texto a ${to}: ${texto}`)
    return { simulado: true }
  }

  // Argentina: probar formato con 15 primero (el que Meta acepta en sandbox),
  // luego formato estándar 549..., luego sin 9
  const con15 = formatoWhatsAppLegacy(to)
  const sin9 = to.startsWith('549') ? '54' + to.substring(3) : null
  const variantes = [con15, to, sin9].filter((v, i, a) => v && a.indexOf(v) === i)

  for (const destino of variantes) {
    try {
      console.log(`[whatsapp] Intentando enviar a: ${destino}`)
      const body = {
        messaging_product: 'whatsapp',
        to: destino,
        type: 'text',
        text: { body: texto }
      }
      const res = await fetch(WA_API, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WA_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (res.ok) {
        console.log(`[whatsapp] Enviado OK a ${destino}`)
        return data
      }
      console.error(`[whatsapp] error con ${destino}:`, JSON.stringify(data))
      if (data?.error?.code === 131030 && variantes.indexOf(destino) < variantes.length - 1) {
        continue
      }
      return data
    } catch (err) {
      console.error('[whatsapp] excepción texto:', err.message)
      if (variantes.indexOf(destino) < variantes.length - 1) continue
      return { error: err.message }
    }
  }
}

// OTP helpers usando Supabase (serverless-safe, no depende de memoria)
async function otpSet(telefono, code) {
  if (!supabase) return
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  // Upsert: si ya existe el teléfono, actualizar código
  await supabase.from('otp_codes').upsert(
    { telefono, code, expires_at: expires },
    { onConflict: 'telefono' }
  )
}
async function otpGet(telefono) {
  if (!supabase) return null
  const { data } = await supabase.from('otp_codes')
    .select('code, expires_at')
    .eq('telefono', telefono)
    .single()
  return data
}
async function otpDelete(telefono) {
  if (!supabase) return
  await supabase.from('otp_codes').delete().eq('telefono', telefono)
}

// ---- MercadoPago ------------------------------------------------
const mpClient = process.env.MP_ACCESS_TOKEN
  ? new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
  : null

// ---- Config / constantes -------------------------------------
const SITE_URL = process.env.SITE_URL || process.env.URL || 'https://cuidy-ar.netlify.app'
const TIPOS_VALIDOS_CUIDADOR = ['ninera', 'adulto_mayor', 'domestica', 'cocinera']
const DOCS_OBLIGATORIOS = ['dni_frente', 'dni_dorso', 'selfie_dni']
const ESTADOS_VALIDOS = [
  'borrador', 'enviado', 'lista_espera', 'identidad_aprobada', 'perfil_completo',
  'en_revision', 'correcciones_pedidas',
  'entrevista_agendada', 'aprobado', 'rechazado', 'suspendido', 'vencido',
  'baja_solicitada'
]

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json'
}

const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: { ...CORS_HEADERS, ...extraHeaders },
  body: JSON.stringify(body)
})

// ---- Auth admin (cookie firmada) -----------------------------
const SESSION_COOKIE = 'qqmc_admin'
const SESSION_MAX_AGE = 60 * 60 * 8 // 8 horas

function signSession(payload) {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET no configurado')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}
function verifySession(token) {
  try {
    if (!token) return null
    const [body, sig] = token.split('.')
    if (!body || !sig) return null
    const secret = process.env.SESSION_SECRET
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url')
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (payload.exp && payload.exp < Date.now() / 1000) return null
    return payload
  } catch { return null }
}
function parseCookies(cookieHeader = '') {
  const out = {}
  cookieHeader.split(';').forEach(p => {
    const [k, ...v] = p.trim().split('=')
    if (k) out[k] = v.join('=')
  })
  return out
}
function getAdminSession(event) {
  const raw = parseCookies(event.headers?.cookie || event.headers?.Cookie || '')[SESSION_COOKIE]
  return verifySession(raw)
}

function requireAdmin(event) {
  const s = getAdminSession(event)
  if (!s || (s.role !== 'admin' && s.role !== 'superadmin')) return null
  return s
}

// ---- Utilidades ---------------------------------------------
function edadEn(fecha) {
  return (Date.now() - new Date(fecha).getTime()) / (365.25 * 864e5)
}

// Sanitiza para público (oculta contacto/dirección)
function sanitizarPublico(c) {
  if (!c) return c
  const { email, telefono, direccion, dni, ...pub } = c
  return pub
}

// Convierte una fila de DB a formato compatible con el frontend existente
// Offset aleatorio para ubicación difusa (~500m-1km)
function fuzzyCoord(val) {
  if (val == null) return null
  const offset = (Math.random() - 0.5) * 0.014 // ~0.7km en cada dirección
  return Math.round((val + offset) * 10000) / 10000
}

// Nombre parcial: "María L."
function nombreParcial(nombre, apellido) {
  return `${nombre} ${(apellido || '').charAt(0)}.`
}

// Listado público: sin datos sensibles, ubicación difusa, nombre parcial
function rowToListado(r) {
  return {
    id: r.id,
    nombre: nombreParcial(r.nombre, r.apellido),
    edad: r.fecha_nacimiento ? Math.floor(edadEn(r.fecha_nacimiento)) : null,
    especialidad: r.especialidades?.[0] || null,
    especialidades: r.especialidades || [],
    valoracion: r.valoracion != null ? Number(r.valoracion) : 0,
    resenas: r.resenas || 0,
    zona: [r.localidad, r.provincia?.toUpperCase()].filter(Boolean).join(', '),
    lat: fuzzyCoord(r.lat), lng: fuzzyCoord(r.lng),
    experiencia_anios: r.experiencia_anios || 0,
    bio: r.bio,
    disponibilidad: r.disponibilidad || {},
    foto: r.foto_url || `https://i.pravatar.cc/200?u=${r.id}`,
    verificado: !!r.verificado,
    recomendado: !!r.recomendado_por,
    valor_hora_min: r.valor_hora_min || null,
    valor_hora_max: r.valor_hora_max || null
    // NUNCA incluir: telefono, email, direccion, dni, fecha_nacimiento
  }
}

// Ficha completa (para suscriptoras activas) — nombre parcial por privacidad
function rowToFichaCompleta(r) {
  const base = rowToListado(r)
  // Mantener nombre parcial (ej: "Silvina M.") para proteger la identidad del cuidador
  // El apellido completo solo se revela cuando ambas partes aceptan el contacto
  return base
}

// ---- Validaciones -------------------------------------------

// Validación para registro simplificado (solo identidad + contacto + zona)
function validarCuidadorSimplificado(p) {
  const errors = []
  const id = p?.identidad || {}
  if (!id.nombre) errors.push('identidad.nombre requerido')
  if (!id.apellido) errors.push('identidad.apellido requerido')
  if (!id.dni || !/^\d{7,9}$/.test(String(id.dni).replace(/\D/g, ''))) errors.push('identidad.dni inválido')
  if (!id.fecha_nacimiento) errors.push('identidad.fecha_nacimiento requerido')
  else if (edadEn(id.fecha_nacimiento) < 18) errors.push('debe ser mayor de 18 años')

  const ct = p?.contacto || {}
  if (!ct.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ct.email)) errors.push('contacto.email inválido')
  if (!ct.telefono) errors.push('contacto.telefono requerido')
  if (!p?.password || p.password.length < 8) errors.push('password mínimo 8 caracteres')

  const zona = p?.zona || {}
  if (!zona.provincia) errors.push('zona.provincia requerido')
  if (!zona.localidad) errors.push('zona.localidad requerido')

  const esp = p?.especialidades || []
  if (!Array.isArray(esp) || esp.length === 0) errors.push('especialidades requerido (al menos una)')
  else if (esp.some(e => !TIPOS_VALIDOS_CUIDADOR.includes(e))) errors.push('especialidades contiene valores inválidos')

  const cs = p?.consentimientos || {}
  if (!cs.privacidad) errors.push('consentimiento de privacidad requerido')
  if (!cs.datos_veraces) errors.push('consentimiento de datos veraces requerido')

  return errors
}

// Validación para completar perfil (después de aprobación de identidad)
function validarCompletarPerfil(p) {
  const errors = []
  if (!p?.bio || String(p.bio).length < 80) errors.push('bio mínimo 80 caracteres')
  if (typeof p?.experiencia_anios !== 'number' || p.experiencia_anios < 0) errors.push('experiencia_anios inválido')

  const dom = p || {}
  if (dom.direccion && (!dom.lat || !dom.lng)) errors.push('Si ponés dirección, ubicá el pin en el mapa')

  // Disponibilidad: al menos un día con al menos una franja
  const dispEntries = Object.entries(p?.disponibilidad || {})
  const diasValidos = dispEntries.filter(([_, franjas]) => {
    if (!franjas || typeof franjas !== 'object') return false
    if (franjas.desde && franjas.hasta) return true
    return Object.values(franjas).some(r => r && r.desde && r.hasta)
  })
  if (diasValidos.length === 0) errors.push('disponibilidad: marcá al menos un día con horario')

  if (!p?.zonas_trabajo) errors.push('zonas_trabajo requerido')

  // Valor hora obligatorio
  if (!p?.valor_hora_min || !p?.valor_hora_max) errors.push('valor_hora_min y valor_hora_max son requeridos')
  else if (p.valor_hora_min > p.valor_hora_max) errors.push('valor_hora_min no puede ser mayor a valor_hora_max')

  return errors
}

// Validación legacy (registro completo en un solo paso - por compatibilidad)
function validarCuidador(p) {
  // Si es registro simplificado, usar la validación reducida
  if (p?.registro_simplificado) return validarCuidadorSimplificado(p)

  const errors = []
  const id = p?.identidad || {}
  if (!id.nombre) errors.push('identidad.nombre requerido')
  if (!id.apellido) errors.push('identidad.apellido requerido')
  if (!id.dni || !/^\d{7,9}$/.test(String(id.dni).replace(/\D/g, ''))) errors.push('identidad.dni inválido')
  if (!id.fecha_nacimiento) errors.push('identidad.fecha_nacimiento requerido')
  else if (edadEn(id.fecha_nacimiento) < 18) errors.push('debe ser mayor de 18 años')

  const ct = p?.contacto || {}
  if (!ct.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ct.email)) errors.push('contacto.email inválido')
  if (!ct.telefono) errors.push('contacto.telefono requerido')
  if (!p?.password || p.password.length < 8) errors.push('password mínimo 8 caracteres')

  const esp = p?.especialidades || []
  if (!Array.isArray(esp) || esp.length === 0) errors.push('especialidades requerido (al menos una)')
  else if (esp.some(e => !TIPOS_VALIDOS_CUIDADOR.includes(e))) errors.push('especialidades contiene valores inválidos')

  if (!p?.bio || String(p.bio).length < 80) errors.push('bio mínimo 80 caracteres')

  const dom = p?.domicilio || {}
  if (!dom.provincia) errors.push('domicilio.provincia requerido')
  if (!dom.localidad) errors.push('domicilio.localidad requerido')

  return errors
}

function validarFamilia(p) {
  const errors = []
  const c = p?.cuenta || {}
  if (!c.nombre) errors.push('cuenta.nombre requerido')
  if (!c.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) errors.push('cuenta.email inválido')
  // apellido, telefono, busqueda, zona son opcionales (pueden completarse después vía PATCH)
  return errors
}

// ---- Helper: registrar evento + cambio de estado -------------
async function registrarEvento(cuidadorId, tipo, detalle, metadata, actor) {
  if (!supabaseAdmin) return
  await supabaseAdmin.from('cuidador_eventos').insert({
    cuidador_id: cuidadorId, tipo, detalle, metadata: metadata || {}, actor
  })
}

// ==============================================================
//  HANDLER
// ==============================================================
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {})

  const path = (event.path || '').replace(/^.*\/api\/?/, '')
  const params = event.queryStringParameters || {}

  // Health check para diagnóstico
  if (path === 'health') {
    return json(200, {
      ok: true,
      supabase: !!supabase,
      supabaseAdmin: !!supabaseAdmin,
      env: {
        hasUrl: !!process.env.SUPABASE_URL,
        hasAnon: !!process.env.SUPABASE_ANON_KEY,
        hasService: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        hasSupabaseAdmin: !!supabaseAdmin,
        hasSession: !!process.env.SESSION_SECRET,
        nodeEnv: process.env.NODE_ENV || 'not set'
      }
    })
  }

  try {
    // ========== ADMIN ==========
    if (path === 'admin/login' && event.httpMethod === 'POST') {
      const { user, password } = safeParse(event.body)
      if (!user || !password) return json(400, { ok: false, error: 'user y password requeridos' })
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Base de datos no configurada' })

      // Buscar usuario en la base de datos
      const { data: adminUser, error: dbErr } = await supabaseAdmin
        .from('admin_usuarios')
        .select('id, usuario, password_hash, nombre, rol, activo')
        .eq('usuario', user)
        .single()

      if (dbErr || !adminUser) {
        return json(401, { ok: false, error: 'Credenciales inválidas' })
      }
      if (!adminUser.activo) {
        return json(401, { ok: false, error: 'Usuario desactivado. Revisá tu email para activar tu cuenta.' })
      }
      if (!adminUser.password_hash) {
        return json(401, { ok: false, error: 'Todavía no configuraste tu contraseña. Revisá tu email.' })
      }

      // Verificar password con scrypt
      const [salt, storedHash] = adminUser.password_hash.split(':')
      const hash = crypto.scryptSync(password, salt, 64).toString('hex')
      if (hash !== storedHash) {
        return json(401, { ok: false, error: 'Credenciales inválidas' })
      }

      const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
      const token = signSession({ user: adminUser.usuario, role: adminUser.rol, nombre: adminUser.nombre, exp })
      const cookie = [
        `${SESSION_COOKIE}=${token}`,
        'Path=/',
        `Max-Age=${SESSION_MAX_AGE}`,
        'HttpOnly',
        'SameSite=Strict',
        process.env.NODE_ENV === 'production' ? 'Secure' : ''
      ].filter(Boolean).join('; ')
      return json(200, { ok: true, data: { user: adminUser.usuario, nombre: adminUser.nombre, rol: adminUser.rol } }, { 'Set-Cookie': cookie })
    }

    if (path === 'admin/logout' && event.httpMethod === 'POST') {
      const cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`
      return json(200, { ok: true }, { 'Set-Cookie': cookie })
    }

    if (path === 'admin/me' && event.httpMethod === 'GET') {
      const s = getAdminSession(event)
      return json(200, { ok: true, data: s ? { user: s.user, role: s.role, nombre: s.nombre } : null })
    }

    // POST /admin/setup-password → configurar contraseña con token (público, no requiere sesión)
    if (path === 'admin/setup-password' && event.httpMethod === 'POST') {
      const { token, password } = safeParse(event.body)
      if (!token || !password) return json(400, { ok: false, error: 'token y password requeridos' })
      if (password.length < 6) return json(400, { ok: false, error: 'La contraseña debe tener al menos 6 caracteres' })
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Base de datos no configurada' })

      // Buscar usuario con ese token
      const { data: adminUser, error: dbErr } = await supabaseAdmin
        .from('admin_usuarios')
        .select('id, usuario, nombre, setup_token_expires')
        .eq('setup_token', token)
        .single()

      if (dbErr || !adminUser) {
        return json(400, { ok: false, error: 'Token inválido o ya utilizado' })
      }
      if (new Date(adminUser.setup_token_expires) < new Date()) {
        return json(400, { ok: false, error: 'El link expiró. Pedile al administrador que te reenvíe la invitación.' })
      }

      // Hashear password y activar usuario
      const salt = crypto.randomBytes(16).toString('hex')
      const hash = crypto.scryptSync(password, salt, 64).toString('hex')
      const password_hash = `${salt}:${hash}`

      const { error: upErr } = await supabaseAdmin
        .from('admin_usuarios')
        .update({ password_hash, activo: true, setup_token: null, setup_token_expires: null })
        .eq('id', adminUser.id)

      if (upErr) return json(500, { ok: false, error: upErr.message })
      return json(200, { ok: true, data: { usuario: adminUser.usuario, nombre: adminUser.nombre } })
    }

    // POST /admin/resend-invite/:id → reenviar email de activación (requiere superadmin)
    const mResend = path.match(/^admin\/resend-invite\/([0-9a-f-]{36})$/)
    if (mResend && event.httpMethod === 'POST') {
      // Este endpoint necesita sesión de superadmin
      const sess = getAdminSession(event)
      if (!sess || sess.role !== 'superadmin') return json(403, { ok: false, error: 'Solo superadmin' })
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Base de datos no configurada' })

      const userId = mResend[1]
      const { data: adminUser } = await supabaseAdmin
        .from('admin_usuarios')
        .select('id, usuario, nombre, email, password_hash')
        .eq('id', userId)
        .single()
      if (!adminUser) return json(404, { ok: false, error: 'Usuario no encontrado' })
      if (adminUser.password_hash) return json(400, { ok: false, error: 'Este usuario ya configuró su contraseña' })

      // Generar nuevo token
      const setup_token = crypto.randomBytes(32).toString('hex')
      const setup_token_expires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      await supabaseAdmin.from('admin_usuarios')
        .update({ setup_token, setup_token_expires })
        .eq('id', userId)

      await enviarEmailActivacionAdmin({ to: adminUser.email, nombre: adminUser.nombre, usuario: adminUser.usuario, token: setup_token })
      return json(200, { ok: true })
    }

    // Todas las rutas /admin/* que siguen requieren sesión
    if (path.startsWith('admin/')) {
      if (!requireAdmin(event)) return json(401, { ok: false, error: 'No autenticado' })
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado (falta SERVICE_ROLE_KEY)' })

      // GET /admin/candidaturas
      if (path === 'admin/candidaturas' && event.httpMethod === 'GET') {
        let q = supabaseAdmin.from('cuidadores')
          .select('id,created_at,estado,nombre,apellido,email,telefono,dni,especialidades,localidad,provincia,experiencia_anios,foto_url,antecedentes_vence,valoracion,resenas', { count: 'exact' })
          .order('created_at', { ascending: false })
        if (params.estado) q = q.eq('estado', params.estado)
        if (params.especialidad && TIPOS_VALIDOS_CUIDADOR.includes(params.especialidad)) {
          q = q.contains('especialidades', [params.especialidad])
        }
        if (params.zona) {
          const z = params.zona.trim()
          q = q.or(`localidad.ilike.%${z}%,provincia.ilike.%${z}%,zonas_trabajo.ilike.%${z}%`)
        }
        if (params.min_valoracion) {
          const min = Number(params.min_valoracion)
          if (!isNaN(min) && min > 0) q = q.gte('valoracion', min)
        }
        if (params.q) q = q.or(`nombre.ilike.%${params.q}%,apellido.ilike.%${params.q}%,email.ilike.%${params.q}%,dni.ilike.%${params.q}%`)
        const { data, count, error } = await q
        if (error) return json(500, { ok: false, error: error.message })

        // Contadores por estado (1 query extra)
        const { data: contadores } = await supabaseAdmin
          .from('cuidadores').select('estado')
        const counts = {}
        ;(contadores || []).forEach(r => { counts[r.estado] = (counts[r.estado] || 0) + 1 })

        return json(200, { ok: true, data, total: count, counts })
      }

      // GET /admin/schedule → configuración de horarios del admin actual
      if (path === 'admin/schedule' && event.httpMethod === 'GET') {
        const user = getAdminSession(event).user
        const { data, error } = await supabaseAdmin
          .from('admin_schedule').select('*').eq('admin_user', user).maybeSingle()
        if (error) return json(500, { ok: false, error: error.message })

        if (!data) return json(200, { ok: true, data: defaultSchedule(user) })

        // Si no hay horarios guardados (registros previos al cambio), los derivamos del legado
        if (!data.horarios || Object.keys(data.horarios).length === 0) {
          const horarios = {}
          for (const d of (data.dias_habiles || [])) {
            horarios[d] = {
              desde: (data.hora_desde || '09:00').slice(0, 5),
              hasta: (data.hora_hasta || '18:00').slice(0, 5)
            }
          }
          data.horarios = horarios
        }
        return json(200, { ok: true, data })
      }

      // PUT /admin/schedule → actualiza configuración
      if (path === 'admin/schedule' && event.httpMethod === 'PUT') {
        const user = getAdminSession(event).user
        const body = safeParse(event.body)

        // Sanear horarios: solo claves 0..6 con formato HH:MM válido y desde < hasta
        const horariosLimpios = {}
        const src = body.horarios && typeof body.horarios === 'object' ? body.horarios : {}
        for (const k of Object.keys(src)) {
          const n = Number(k)
          if (!Number.isInteger(n) || n < 0 || n > 6) continue
          const v = src[k] || {}
          const desde = String(v.desde || '').trim()
          const hasta = String(v.hasta || '').trim()
          if (!/^\d{2}:\d{2}$/.test(desde) || !/^\d{2}:\d{2}$/.test(hasta)) continue
          const toMin = h => {
            const [hh, mm] = h.split(':').map(Number)
            return hh * 60 + mm
          }
          if (toMin(hasta) <= toMin(desde)) continue
          horariosLimpios[n] = { desde, hasta }
        }

        // Derivar dias_habiles + franja global (para compatibilidad con el legado)
        const dias = Object.keys(horariosLimpios).map(Number).sort((a, b) => a - b)
        const franjas = Object.values(horariosLimpios)
        const minDesde = franjas.length
          ? franjas.reduce((a, b) => (a.desde < b.desde ? a : b)).desde
          : '09:00'
        const maxHasta = franjas.length
          ? franjas.reduce((a, b) => (a.hasta > b.hasta ? a : b)).hasta
          : '18:00'

        const payload = {
          admin_user: user,
          dias_habiles: dias.length ? dias : [1,2,3,4,5],
          hora_desde: minDesde,
          hora_hasta: maxHasta,
          horarios: horariosLimpios,
          duracion_min: Number(body.duracion_min) || 30,
          anticipacion_min_horas: Number(body.anticipacion_min_horas) || 24,
          horizonte_dias: Number(body.horizonte_dias) || 30,
          updated_at: new Date().toISOString()
        }
        const { data, error } = await supabaseAdmin.from('admin_schedule')
          .upsert(payload, { onConflict: 'admin_user' }).select().single()
        if (error) return json(500, { ok: false, error: error.message })
        return json(200, { ok: true, data })
      }

      // GET /admin/entrevistas?from=...&to=... → entrevistas agendadas en un rango
      if (path === 'admin/entrevistas' && event.httpMethod === 'GET') {
        const from = params.from ? new Date(params.from) : new Date()
        const to = params.to ? new Date(params.to) : new Date(Date.now() + 60 * 864e5)
        const { data, error } = await supabaseAdmin
          .from('cuidador_eventos')
          .select('id,cuidador_id,metadata,actor,created_at,cuidadores(nombre,apellido,email,estado)')
          .eq('tipo', 'entrevista_agendada')
          .gte('created_at', '1970-01-01')
        if (error) return json(500, { ok: false, error: error.message })
        // Solo las entrevistas cuyo metadata.fecha cae en el rango y cuyo cuidador aún no fue procesado
        const rows = (data || [])
          .filter(e => e.metadata?.fecha)
          .filter(e => {
            const f = new Date(e.metadata.fecha)
            return f >= from && f <= to
          })
          .filter(e => {
            const est = e.cuidadores?.estado
            // si el cuidador ya pasó a aprobado/rechazado/suspendido, ignoramos ese slot
            return est === 'entrevista_agendada' || est === 'en_revision' || est === 'enviado' || est === 'correcciones_pedidas'
          })
          .map(e => ({
            id: e.id,
            cuidador_id: e.cuidador_id,
            cuidador_nombre: e.cuidadores ? `${e.cuidadores.nombre} ${e.cuidadores.apellido}` : '—',
            fecha: e.metadata.fecha,
            link: e.metadata.link || null,
            actor: e.actor
          }))
          .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
        return json(200, { ok: true, data: rows })
      }

      // GET /admin/entrevistas/slots?fecha=YYYY-MM-DD → slots libres ese día
      if (path === 'admin/entrevistas/slots' && event.httpMethod === 'GET') {
        const user = getAdminSession(event).user
        if (!params.fecha) return json(400, { ok: false, error: 'fecha requerida' })
        const fecha = params.fecha // YYYY-MM-DD
        // Traer config
        const { data: cfgRow } = await supabaseAdmin
          .from('admin_schedule').select('*').eq('admin_user', user).maybeSingle()
        const cfg = cfgRow || defaultSchedule(user)

        const slots = buildSlots(fecha, cfg)
        if (!slots.length) return json(200, { ok: true, data: [], config: cfg })

        // Traer entrevistas del día
        const [y, m, d] = fecha.split('-').map(Number)
        const dayStart = new Date(y, m - 1, d, 0, 0, 0)
        const dayEnd = new Date(y, m - 1, d, 23, 59, 59)
        const { data: eventos } = await supabaseAdmin
          .from('cuidador_eventos')
          .select('metadata,cuidador_id,cuidadores(estado,nombre,apellido)')
          .eq('tipo', 'entrevista_agendada')
        const ocupados = new Set()
        const ocupadosDetalle = {}
        ;(eventos || []).forEach(e => {
          if (!e.metadata?.fecha) return
          const f = new Date(e.metadata.fecha)
          if (f < dayStart || f > dayEnd) return
          const est = e.cuidadores?.estado
          if (!['entrevista_agendada', 'en_revision', 'enviado', 'correcciones_pedidas'].includes(est)) return
          const key = `${pad2(f.getHours())}:${pad2(f.getMinutes())}`
          ocupados.add(key)
          ocupadosDetalle[key] = e.cuidadores ? `${e.cuidadores.nombre} ${e.cuidadores.apellido}` : '—'
        })

        const out = slots.map(s => ({
          hora: s,
          ocupado: ocupados.has(s),
          quien: ocupadosDetalle[s] || null
        }))
        return json(200, { ok: true, data: out, config: cfg })
      }

      // GET /admin/candidaturas/:id
      const mDet = path.match(/^admin\/candidaturas\/([0-9a-f-]{36})$/)
      if (mDet && event.httpMethod === 'GET') {
        const id = mDet[1]
        const [cand, docs, refs, eventos, notas] = await Promise.all([
          supabaseAdmin.from('cuidadores').select('*').eq('id', id).single(),
          supabaseAdmin.from('cuidador_documentos').select('*').eq('cuidador_id', id),
          supabaseAdmin.from('cuidador_referencias').select('*').eq('cuidador_id', id),
          supabaseAdmin.from('cuidador_eventos').select('*').eq('cuidador_id', id).order('created_at', { ascending: false }),
          supabaseAdmin.from('cuidador_notas').select('*').eq('cuidador_id', id).order('created_at', { ascending: false })
        ])
        if (cand.error) return json(404, { ok: false, error: cand.error.message })
        return json(200, {
          ok: true,
          data: {
            candidatura: cand.data,
            documentos: docs.data || [],
            referencias: refs.data || [],
            eventos: eventos.data || [],
            notas: notas.data || []
          }
        })
      }

      // PATCH /admin/candidaturas/:id  → cambio de estado
      if (mDet && event.httpMethod === 'PATCH') {
        const id = mDet[1]
        const body = safeParse(event.body)
        const { accion, detalle, fecha_entrevista, link_entrevista } = body
        const actor = 'admin:' + (getAdminSession(event)?.user || '')

        // Mapa de acciones → estado destino + tipo de evento
        let nuevoEstado, tipoEvento, metadata = {}
        switch (accion) {
          case 'tomar_revision':
            nuevoEstado = 'en_revision'; tipoEvento = 'registrada'; break
          case 'aprobar_identidad':
            nuevoEstado = 'identidad_aprobada'; tipoEvento = 'identidad_aprobada'
            metadata = { aprobado_por: actor }
            break
          case 'pedir_correcciones':
            if (!detalle) return json(400, { ok: false, error: 'detalle requerido' })
            nuevoEstado = 'correcciones_pedidas'; tipoEvento = 'correccion_pedida'; break
          case 'agendar_entrevista':
            if (!fecha_entrevista) return json(400, { ok: false, error: 'fecha_entrevista requerida' })
            // Chequear que el slot no esté ocupado por otra candidatura
            {
              const f = new Date(fecha_entrevista)
              if (isNaN(f)) return json(400, { ok: false, error: 'fecha_entrevista inválida' })
              const { data: otros } = await supabaseAdmin
                .from('cuidador_eventos')
                .select('cuidador_id,metadata,cuidadores(estado)')
                .eq('tipo', 'entrevista_agendada')
                .neq('cuidador_id', id)
              const choca = (otros || []).some(e => {
                if (!e.metadata?.fecha) return false
                const estActivo = ['entrevista_agendada', 'en_revision', 'enviado', 'correcciones_pedidas'].includes(e.cuidadores?.estado)
                return estActivo && Math.abs(new Date(e.metadata.fecha) - f) < 60 * 1000
              })
              if (choca) return json(409, { ok: false, error: 'Ese horario ya está ocupado por otra entrevista' })
            }
            nuevoEstado = 'entrevista_agendada'; tipoEvento = 'entrevista_agendada'
            metadata = { fecha: fecha_entrevista, link: link_entrevista || null }
            break
          case 'aprobar':
            nuevoEstado = 'aprobado'; tipoEvento = 'aprobada'; break
          case 'rechazar':
            if (!detalle) return json(400, { ok: false, error: 'detalle (motivo) requerido' })
            nuevoEstado = 'rechazado'; tipoEvento = 'rechazada'; break
          case 'suspender':
            nuevoEstado = 'suspendido'; tipoEvento = 'suspendida'; break
          default:
            return json(400, { ok: false, error: 'acción inválida' })
        }

        const updates = { estado: nuevoEstado }
        if (accion === 'aprobar') updates.verificado = true
        if (accion === 'rechazar') updates.motivo_rechazo = detalle
        if (accion === 'pedir_correcciones') updates.feedback_correcciones = detalle

        const { error: upErr } = await supabaseAdmin.from('cuidadores').update(updates).eq('id', id)
        if (upErr) return json(500, { ok: false, error: upErr.message })

        await registrarEvento(id, tipoEvento, detalle || null, metadata, actor)

        // Notificaciones al cuidador según la acción
        if (accion === 'aprobar_identidad') {
          const { data: cuid } = await supabaseAdmin.from('cuidadores')
            .select('nombre,apellido,email,telefono').eq('id', id).single()
          if (cuid) {
            // Email para completar perfil (tiene link y se puede guardar)
            await enviarEmailCompletarPerfil({
              to: cuid.email,
              nombre: cuid.nombre,
              apellido: cuid.apellido,
              id
            })
            // WhatsApp: aviso principal + mencionar el email
            const telCuid = normalizarTelefono(cuid.telefono)
            if (telCuid) {
              const msgWa = `🎉 ¡Hola ${cuid.nombre}!\n\nTu identidad fue verificada en *Cuidy*. 🎊\n\nTe enviamos un email a ${cuid.email} con un link para completar tu perfil profesional. Revisalo y completá tus datos para que las familias puedan encontrarte.\n\nTambién podés completarlo desde tu panel:\n${SITE_URL}/login.html?rol=cuidador\n\n¡Estás cada vez más cerca!`
              enviarWhatsAppTexto(telCuid, msgWa)
            }
          }
        } else if (accion === 'aprobar') {
          // Perfil aprobado → WhatsApp con link al login
          const { data: cuid } = await supabaseAdmin.from('cuidadores')
            .select('nombre,apellido,email,telefono').eq('id', id).single()
          if (cuid) {
            const telCuid = normalizarTelefono(cuid.telefono)
            if (telCuid) {
              const msgWa = `🎉 ¡Felicitaciones ${cuid.nombre}!\n\nTu perfil fue *aprobado* en Cuidy. A partir de ahora las familias de tu zona pueden verte y contactarte.\n\n👉 Ingresá a tu panel para ver solicitudes y gestionar tus datos:\n${SITE_URL}/login.html?rol=cuidador\n\n¡Bienvenida al equipo Cuidy! 💙`
              enviarWhatsAppTexto(telCuid, msgWa)
            }
          }
        } else if (accion === 'agendar_entrevista') {
          const { data: cuid } = await supabaseAdmin.from('cuidadores')
            .select('nombre,apellido,email,telefono').eq('id', id).single()
          if (cuid) {
            // Si no se proporcionó link, generar uno con Jitsi Meet (gratuito, sin login)
            const meetLink = link_entrevista || `https://meet.jit.si/qqmc-entrevista-${id.slice(0, 8)}`
            // Actualizar metadata con el link final
            if (!link_entrevista) {
              metadata.link = meetLink
              await supabaseAdmin.from('cuidador_eventos')
                .update({ metadata })
                .eq('cuidador_id', id)
                .eq('tipo', 'entrevista_agendada')
                .order('created_at', { ascending: false })
                .limit(1)
            }
            // Email con la entrevista (para agendar en calendario)
            await enviarEmailEntrevista({
              to: cuid.email,
              nombre: cuid.nombre,
              apellido: cuid.apellido,
              fecha: fecha_entrevista,
              link: meetLink
            })
            // WhatsApp: confirmación + reminder automático
            const telCuid = normalizarTelefono(cuid.telefono)
            if (telCuid) {
              const fechaObj = new Date(fecha_entrevista)
              const fechaStr = fechaObj.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
              const horaStr = fechaObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
              const msgWa = `📅 ¡Hola ${cuid.nombre}!\n\nTu entrevista en Cuidy está confirmada:\n\n🗓 *${fechaStr}*\n🕐 *${horaStr} hs*\n🔗 Link: ${meetLink}\n\nTe vamos a enviar un recordatorio 1 hora antes. ¡Éxitos!`
              enviarWhatsAppTexto(telCuid, msgWa)

              // Programar reminder 1h antes (si la entrevista es en el futuro)
              const reminderTime = fechaObj.getTime() - 60 * 60 * 1000
              const ahora = Date.now()
              if (reminderTime > ahora) {
                setTimeout(() => {
                  const reminderMsg = `⏰ ¡Recordatorio!\n\nTu entrevista en Cuidy es en *1 hora*.\n\n🔗 Link: ${meetLink}\n\n¡Te esperamos!`
                  enviarWhatsAppTexto(telCuid, reminderMsg)
                }, reminderTime - ahora)
              }
            }
          }
        } else if (accion === 'rechazar') {
          const { data: cuid } = await supabaseAdmin.from('cuidadores')
            .select('nombre,telefono').eq('id', id).single()
          if (cuid) {
            const telCuid = normalizarTelefono(cuid.telefono)
            if (telCuid) {
              const msgWa = `Hola ${cuid.nombre},\n\nLamentamos informarte que tu perfil en Cuidy no fue aprobado en esta oportunidad.\n\n${detalle ? 'Motivo: ' + detalle + '\n\n' : ''}Si tenés consultas, escribinos a soporte@cuidy.com.ar.\n\nGracias por tu interés.`
              enviarWhatsAppTexto(telCuid, msgWa)
            }
          }
        } else {
          console.log(`[notif→cuidador] ${accion}`, { id, detalle })
        }

        return json(200, { ok: true, data: { estado: nuevoEstado } })
      }

      // POST /admin/candidaturas/:id/notas
      const mNota = path.match(/^admin\/candidaturas\/([0-9a-f-]{36})\/notas$/)
      if (mNota && event.httpMethod === 'POST') {
        const id = mNota[1]
        const { contenido } = safeParse(event.body)
        if (!contenido?.trim()) return json(400, { ok: false, error: 'contenido requerido' })
        const autor = getAdminSession(event)?.user || 'admin'
        const { data, error } = await supabaseAdmin.from('cuidador_notas')
          .insert({ cuidador_id: id, autor, contenido: contenido.trim() })
          .select().single()
        if (error) return json(500, { ok: false, error: error.message })
        return json(201, { ok: true, data })
      }

      // GET /admin/notificaciones → lista de notificaciones
      if (path === 'admin/notificaciones' && event.httpMethod === 'GET') {
        const soloNoLeidas = params.leidas === 'false'
        let q = supabaseAdmin.from('admin_notificaciones')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50)
        if (soloNoLeidas) q = q.eq('leida', false)
        const { data, error } = await q
        if (error) return json(500, { ok: false, error: error.message })
        const { count } = await supabaseAdmin
          .from('admin_notificaciones')
          .select('*', { count: 'exact', head: true })
          .eq('leida', false)
        return json(200, { ok: true, data: data || [], no_leidas: count || 0 })
      }

      // PATCH /admin/notificaciones/:id → marcar como leída
      const mNotif = path.match(/^admin\/notificaciones\/(\d+)$/)
      if (mNotif && event.httpMethod === 'PATCH') {
        const { error } = await supabaseAdmin
          .from('admin_notificaciones')
          .update({ leida: true })
          .eq('id', mNotif[1])
        if (error) return json(500, { ok: false, error: error.message })
        return json(200, { ok: true })
      }

      // POST /admin/notificaciones/leer-todas → marcar todas como leídas
      if (path === 'admin/notificaciones/leer-todas' && event.httpMethod === 'POST') {
        const { error } = await supabaseAdmin
          .from('admin_notificaciones')
          .update({ leida: true })
          .eq('leida', false)
        if (error) return json(500, { ok: false, error: error.message })
        return json(200, { ok: true })
      }

      // ========== GESTIÓN DE USUARIOS ADMIN (solo superadmin) ==========

      // Helper: verificar que el usuario actual es superadmin
      const requireSuperadmin = () => {
        const s = getAdminSession(event)
        return s && s.role === 'superadmin'
      }

      // GET /admin/usuarios → listar usuarios admin
      if (path === 'admin/usuarios' && event.httpMethod === 'GET') {
        if (!requireSuperadmin()) return json(403, { ok: false, error: 'Solo superadmin puede gestionar usuarios' })
        const { data, error } = await supabaseAdmin
          .from('admin_usuarios')
          .select('id, usuario, nombre, email, rol, activo, password_hash, created_at, updated_at')
          .order('created_at', { ascending: true })
        if (error) return json(500, { ok: false, error: error.message })
        // No enviar el hash real, solo si tiene password configurado
        const cleaned = (data || []).map(u => ({
          ...u,
          password_configurado: !!u.password_hash,
          password_hash: undefined
        }))
        return json(200, { ok: true, data: cleaned })
      }

      // POST /admin/usuarios → crear usuario admin (sin password, envía email de activación)
      if (path === 'admin/usuarios' && event.httpMethod === 'POST') {
        if (!requireSuperadmin()) return json(403, { ok: false, error: 'Solo superadmin puede crear usuarios' })
        const { usuario, nombre, email, rol } = safeParse(event.body)
        if (!usuario || !nombre || !email) {
          return json(400, { ok: false, error: 'usuario, nombre y email son requeridos' })
        }
        const rolFinal = (rol === 'superadmin' || rol === 'admin') ? rol : 'admin'

        // Generar token de activación (válido 48hs)
        const setup_token = crypto.randomBytes(32).toString('hex')
        const setup_token_expires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

        const { data, error } = await supabaseAdmin
          .from('admin_usuarios')
          .insert({ usuario, nombre, email, rol: rolFinal, password_hash: null, activo: false, setup_token, setup_token_expires })
          .select('id, usuario, nombre, email, rol, activo, created_at')
          .single()
        if (error) {
          if (error.code === '23505') return json(409, { ok: false, error: 'Ya existe un usuario con ese nombre' })
          return json(500, { ok: false, error: error.message })
        }

        // Enviar email de activación
        await enviarEmailActivacionAdmin({ to: email, nombre, usuario, token: setup_token })

        return json(201, { ok: true, data })
      }

      // PATCH /admin/usuarios/:id → editar usuario admin
      const mAdminUser = path.match(/^admin\/usuarios\/([0-9a-f-]{36})$/)
      if (mAdminUser && event.httpMethod === 'PATCH') {
        if (!requireSuperadmin()) return json(403, { ok: false, error: 'Solo superadmin puede editar usuarios' })
        const userId = mAdminUser[1]
        const body = safeParse(event.body)
        const updates = {}

        if (body.nombre) updates.nombre = body.nombre
        if (body.email !== undefined) updates.email = body.email || null
        if (body.rol === 'superadmin' || body.rol === 'admin') updates.rol = body.rol
        if (typeof body.activo === 'boolean') updates.activo = body.activo

        // Si se envía nuevo password, hashearlo
        if (body.password) {
          if (body.password.length < 6) {
            return json(400, { ok: false, error: 'El password debe tener al menos 6 caracteres' })
          }
          const salt = crypto.randomBytes(16).toString('hex')
          const hash = crypto.scryptSync(body.password, salt, 64).toString('hex')
          updates.password_hash = `${salt}:${hash}`
        }

        if (Object.keys(updates).length === 0) {
          return json(400, { ok: false, error: 'Nada que actualizar' })
        }

        const { data, error } = await supabaseAdmin
          .from('admin_usuarios')
          .update(updates)
          .eq('id', userId)
          .select('id, usuario, nombre, email, rol, activo, updated_at')
          .single()
        if (error) return json(500, { ok: false, error: error.message })
        return json(200, { ok: true, data })
      }

      // DELETE /admin/usuarios/:id → eliminar usuario definitivamente
      if (mAdminUser && event.httpMethod === 'DELETE') {
        if (!requireSuperadmin()) return json(403, { ok: false, error: 'Solo superadmin puede eliminar usuarios' })
        const userId = mAdminUser[1]

        // No permitir eliminarse a sí mismo
        const currentUser = getAdminSession(event)?.user
        const { data: target } = await supabaseAdmin
          .from('admin_usuarios')
          .select('usuario')
          .eq('id', userId)
          .single()
        if (target && target.usuario === currentUser) {
          return json(400, { ok: false, error: 'No podés eliminar tu propio usuario' })
        }

        const { error } = await supabaseAdmin
          .from('admin_usuarios')
          .delete()
          .eq('id', userId)
        if (error) return json(500, { ok: false, error: error.message })
        return json(200, { ok: true })
      }

      // ---- ADMIN FAMILIAS ----

      // GET /admin/familias → listado de familias con filtros
      if (path === 'admin/familias' && event.httpMethod === 'GET') {
        let q = supabaseAdmin.from('familias')
          .select('id,nombre,apellido,email,telefono,estado,created_at', { count: 'exact' })
          .order('created_at', { ascending: false })

        if (params.estado) q = q.eq('estado', params.estado)
        if (params.q) q = q.or(`nombre.ilike.%${params.q}%,apellido.ilike.%${params.q}%,email.ilike.%${params.q}%`)

        const page = parseInt(params.page) || 1
        const perPage = parseInt(params.per_page) || 20
        q = q.range((page - 1) * perPage, page * perPage - 1)

        const { data, error, count } = await q
        if (error) return json(500, { ok: false, error: error.message })
        return json(200, { ok: true, data: data || [], total: count, page, per_page: perPage })
      }

      // GET /admin/familias/:id → detalle de una familia
      const mAdmFam = path.match(/^admin\/familias\/([0-9a-f-]{36})$/)
      if (mAdmFam && event.httpMethod === 'GET') {
        const { data, error } = await supabaseAdmin.from('familias')
          .select('*')
          .eq('id', mAdmFam[1])
          .maybeSingle()
        if (error) return json(500, { ok: false, error: error.message })
        if (!data) return json(404, { ok: false, error: 'Familia no encontrada' })
        return json(200, { ok: true, data })
      }

      // PATCH /admin/familias/:id → aprobar o rechazar familia
      if (mAdmFam && event.httpMethod === 'PATCH') {
        const familiaId = mAdmFam[1]
        const body = safeParse(event.body)
        const { accion, motivo } = body

        if (accion === 'aprobar') {
          const { error } = await supabaseAdmin.from('familias')
            .update({ estado: 'aprobada' }).eq('id', familiaId)
          if (error) return json(500, { ok: false, error: error.message })

          const { data: fam } = await supabaseAdmin.from('familias')
            .select('nombre,telefono').eq('id', familiaId).single()
          if (fam?.telefono) {
            const tel = normalizarTelefono(fam.telefono)
            if (tel) {
              const msg = `✅ ¡Hola ${fam.nombre}!\n\nTu identidad fue verificada en *Cuidy*. Ya podés contactar cuidadores verificados desde la plataforma.\n\n👉 Ingresá acá: ${SITE_URL}/login.html\n\n¡Éxitos en tu búsqueda! 💙`
              enviarWhatsAppTexto(tel, msg)
            }
          }
          console.log('[admin] familia aprobada', { id: familiaId })
          return json(200, { ok: true, data: { estado: 'aprobada' } })

        } else if (accion === 'rechazar') {
          if (!motivo) return json(400, { ok: false, error: 'motivo requerido' })
          const { error } = await supabaseAdmin.from('familias')
            .update({ estado: 'rechazada', motivo_rechazo: motivo }).eq('id', familiaId)
          if (error) return json(500, { ok: false, error: error.message })

          const { data: fam } = await supabaseAdmin.from('familias')
            .select('nombre,telefono').eq('id', familiaId).single()
          if (fam?.telefono) {
            const tel = normalizarTelefono(fam.telefono)
            if (tel) {
              const msg = `Hola ${fam.nombre},\n\nNo pudimos verificar tu identidad en Cuidy.\n\nMotivo: ${motivo}\n\nSi creés que es un error, escribinos a soporte@cuidy.com.ar.`
              enviarWhatsAppTexto(tel, msg)
            }
          }
          console.log('[admin] familia rechazada', { id: familiaId, motivo })
          return json(200, { ok: true, data: { estado: 'rechazada' } })

        } else {
          return json(400, { ok: false, error: 'acción inválida (aprobar/rechazar)' })
        }
      }

      // POST /admin/familias/:id/recordar → enviar WhatsApp recordatorio de verificación
      const mAdmFamRecordar = path.match(/^admin\/familias\/([0-9a-f-]{36})\/recordar$/)
      if (mAdmFamRecordar && event.httpMethod === 'POST') {
        const familiaId = mAdmFamRecordar[1]
        const { data: fam, error } = await supabaseAdmin.from('familias')
          .select('nombre,telefono,estado,email')
          .eq('id', familiaId)
          .maybeSingle()
        if (error) return json(500, { ok: false, error: error.message })
        if (!fam) return json(404, { ok: false, error: 'Familia no encontrada' })
        if (fam.estado !== 'pendiente') return json(400, { ok: false, error: 'Solo se puede recordar a familias sin verificar' })

        const tel = fam.telefono ? normalizarTelefono(fam.telefono) : null
        if (tel) {
          const msg = `Hola ${fam.nombre}! 👋\n\nTe escribimos desde *Cuidy*. Para que puedas contactar cuidadores verificados, necesitamos que completes la verificación de identidad.\n\nEs rápido: solo necesitamos una foto de tu DNI y una selfie.\n\n👉 Verificá tu identidad acá: ${SITE_URL}/verificar-identidad.html?email=${encodeURIComponent(fam.email)}\n\n¿Dudas? Escribinos a soporte@cuidy.com.ar 💙`
          enviarWhatsAppTexto(tel, msg)
          console.log('[admin] recordatorio verificación enviado', { id: familiaId, tel })
          return json(200, { ok: true, mensaje: 'Recordatorio enviado por WhatsApp' })
        } else {
          return json(400, { ok: false, error: 'La familia no tiene teléfono registrado' })
        }
      }

      // ---- PURGA DE BAJAS ----

      // POST /admin/purgar-bajas → eliminar definitivamente cuentas con baja > 30 días
      if (path === 'admin/purgar-bajas' && event.httpMethod === 'POST') {
        const limite = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        const resultado = { familias_purgadas: 0, cuidadores_purgados: 0 }

        const { data: familiasBaja } = await supabaseAdmin.from('familias')
          .select('id, email')
          .eq('estado', 'baja_solicitada')
          .lt('baja_solicitada_at', limite)
        if (familiasBaja && familiasBaja.length > 0) {
          for (const fam of familiasBaja) {
            await supabaseAdmin.from('solicitudes_contacto').delete().eq('familia_id', fam.id)
            await supabaseAdmin.from('mensajes').delete().eq('familia_id', fam.id)
            await supabaseAdmin.from('invitaciones').delete().eq('familia_id', fam.id)
            await supabaseAdmin.from('push_subscriptions').delete().eq('familia_id', fam.id)
            await supabaseAdmin.from('familias').delete().eq('id', fam.id)
            console.log(`[purga] Familia eliminada: ${fam.email}`)
            resultado.familias_purgadas++
          }
        }

        const { data: cuidadoresBaja } = await supabaseAdmin.from('cuidadores')
          .select('id, email')
          .eq('estado', 'baja_solicitada')
          .lt('baja_solicitada_at', limite)
        if (cuidadoresBaja && cuidadoresBaja.length > 0) {
          for (const cui of cuidadoresBaja) {
            await supabaseAdmin.from('solicitudes_contacto').delete().eq('cuidador_id', cui.id)
            await supabaseAdmin.from('mensajes').delete().eq('cuidador_id', cui.id)
            await supabaseAdmin.from('diario_entradas').delete().eq('cuidador_id', cui.id)
            await supabaseAdmin.from('push_subscriptions').delete().eq('cuidador_id', cui.id)
            await supabaseAdmin.from('cuidadores').delete().eq('id', cui.id)
            console.log(`[purga] Cuidador eliminado: ${cui.email}`)
            resultado.cuidadores_purgados++
          }
        }

        console.log(`[purga] Resultado: ${resultado.familias_purgadas} familias, ${resultado.cuidadores_purgados} cuidadores`)
        return json(200, { ok: true, ...resultado })
      }

      // ---- OPERACIONES: STATS ----

      // GET /admin/stats/solicitudes-recomendacion
      if (path === 'admin/stats/solicitudes-recomendacion' && event.httpMethod === 'GET') {
        const { count } = await supabaseAdmin.from('solicitudes_recomendacion')
          .select('id', { count: 'exact', head: true })
          .in('estado', ['pendiente', 'enviada'])
        return json(200, { ok: true, pendientes: count || 0 })
      }

      // GET /admin/stats/lista-espera
      if (path === 'admin/stats/lista-espera' && event.httpMethod === 'GET') {
        const { count } = await supabaseAdmin.from('lista_espera_cuidadores')
          .select('id', { count: 'exact', head: true })
          .in('estado', ['pendiente', 'en_revision'])
        return json(200, { ok: true, pendientes: count || 0 })
      }

      // GET /admin/stats/revision-pendiente
      if (path === 'admin/stats/revision-pendiente' && event.httpMethod === 'GET') {
        const { count } = await supabaseAdmin.from('invitaciones')
          .select('id', { count: 'exact', head: true })
          .eq('requiere_revision', true)
          .eq('estado', 'revision_pendiente')
        return json(200, { ok: true, pendientes: count || 0 })
      }

      // ---- OPERACIONES: INVITACIONES EN REVISIÓN ----

      // GET /admin/invitaciones?requiere_revision=true
      if (path === 'admin/invitaciones' && event.httpMethod === 'GET') {
        let query = supabaseAdmin.from('invitaciones').select('*').order('created_at', { ascending: false })
        if (event.queryStringParameters?.requiere_revision === 'true') {
          query = query.eq('requiere_revision', true).eq('estado', 'revision_pendiente')
        }
        const { data, error: qErr } = await query.limit(50)
        if (qErr) return json(500, { ok: false, error: qErr.message })
        return json(200, { ok: true, data })
      }

      // POST /admin/invitaciones/:id/aprobar|rechazar → aprobar o rechazar recomendación retenida
      const invMatch = path.match(/^admin\/invitaciones\/([^/]+)\/(aprobar|rechazar)$/)
      if (invMatch && event.httpMethod === 'POST') {
        const invId = invMatch[1]
        const accion = invMatch[2]

        const { data: inv, error: invErr } = await supabaseAdmin.from('invitaciones')
          .select('*').eq('id', invId).single()
        if (invErr || !inv) return json(404, { ok: false, error: 'Invitación no encontrada' })

        if (accion === 'aprobar') {
          await supabaseAdmin.from('invitaciones')
            .update({ requiere_revision: false, estado: 'enviada', updated_at: new Date().toISOString() })
            .eq('id', invId)

          // Enviar WhatsApp al cuidador con link de registro
          const linkRegistro = `${SITE_URL}/registro-cuidador.html?inv=${inv.codigo}`
          const nombreFam = inv.familia_nombre || 'Una familia'
          const textoWA = `¡Hola! *${nombreFam}* te recomienda en *Cuidy*, una plataforma donde familias buscan cuidadores de confianza.\n\nAl registrarte con esta invitación, tu perfil va a tener la insignia de *Recomendado* y prioridad en la validación.\n\nRegistrate acá:\n${linkRegistro}`
          try {
            await enviarWhatsAppTexto(inv.cuidador_telefono, textoWA)
            console.log('[admin] Invitación aprobada y WA enviado:', invId)
          } catch (waErr) {
            console.error('[admin] Error WA al aprobar invitación:', waErr.message)
          }
          return json(200, { ok: true, mensaje: 'Invitación aprobada y WhatsApp enviado al cuidador.' })

        } else {
          await supabaseAdmin.from('invitaciones')
            .update({ estado: 'rechazada', updated_at: new Date().toISOString() })
            .eq('id', invId)
          console.log('[admin] Invitación rechazada:', invId)
          return json(200, { ok: true, mensaje: 'Invitación rechazada.' })
        }
      }

      // ---- OPERACIONES: LISTA DE ESPERA ----

      // GET /admin/lista-espera → listar cuidadores en lista de espera
      if (path === 'admin/lista-espera' && event.httpMethod === 'GET') {
        const { data, error: qErr } = await supabaseAdmin.from('lista_espera_cuidadores')
          .select('*')
          .in('estado', ['pendiente', 'en_revision'])
          .order('created_at', { ascending: true })
          .limit(50)
        if (qErr) return json(500, { ok: false, error: qErr.message })
        return json(200, { ok: true, data })
      }

      return json(404, { ok: false, error: 'Ruta admin no encontrada' })
    }

    // ========== OTP WhatsApp ==========

    // POST /auth/otp-send → enviar código OTP por WhatsApp
    if (path === 'auth/otp-send' && event.httpMethod === 'POST') {
      const body = safeParse(event.body)
      const telefono = normalizarTelefono(body.telefono)
      if (!telefono) return json(400, { ok: false, error: 'Número de teléfono inválido. Usá formato: +54 9 11 1234-5678' })

      const code = String(Math.floor(100000 + Math.random() * 900000))
      await otpSet(telefono, code)

      const texto = `🔐 Tu código de verificación Cuidy es: *${code}*\n\nExpira en 5 minutos. No lo compartas con nadie.`
      await enviarWhatsAppTexto(telefono, texto)

      return json(200, { ok: true, telefono_normalizado: telefono })
    }

    // POST /auth/otp-verify → verificar código OTP
    if (path === 'auth/otp-verify' && event.httpMethod === 'POST') {
      const body = safeParse(event.body)
      const telefono = normalizarTelefono(body.telefono)
      if (!telefono) return json(400, { ok: false, error: 'Teléfono inválido' })

      const stored = await otpGet(telefono)
      if (!stored) return json(400, { ok: false, error: 'No hay código pendiente. Solicitá uno nuevo.' })
      if (new Date(stored.expires_at) < new Date()) {
        await otpDelete(telefono)
        return json(400, { ok: false, error: 'Código expirado. Solicitá uno nuevo.' })
      }
      if (stored.code !== body.code) {
        return json(400, { ok: false, error: 'Código incorrecto' })
      }
      await otpDelete(telefono)
      return json(200, { ok: true, verificado: true, telefono })
    }

    // ========== BAJA DE CUENTA ==========

    // POST /auth/baja → solicitar baja de cuenta (familia o cuidador)
    if (path === 'auth/baja' && event.httpMethod === 'POST') {
      const body = safeParse(event.body)
      const { email, tipo } = body // tipo: 'familia' | 'cuidador'
      if (!email || !tipo) return json(400, { ok: false, error: 'Email y tipo requeridos' })
      if (!['familia', 'cuidador'].includes(tipo)) return json(400, { ok: false, error: 'Tipo debe ser familia o cuidador' })
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase no configurado' })

      const tabla = tipo === 'familia' ? 'familias' : 'cuidadores'

      // Buscar usuario
      const { data: usuario, error: errBuscar } = await supabaseAdmin.from(tabla)
        .select('id, nombre, email, estado')
        .eq('email', email)
        .maybeSingle()
      if (errBuscar) return json(500, { ok: false, error: errBuscar.message })
      if (!usuario) return json(404, { ok: false, error: 'Usuario no encontrado' })
      if (usuario.estado === 'baja_solicitada') return json(400, { ok: false, error: 'Ya solicitaste la baja. Tu cuenta será eliminada en 30 días.' })

      // Guardar estado previo y marcar baja
      const ahora = new Date().toISOString()
      const { error: errUpdate } = await supabaseAdmin.from(tabla)
        .update({
          estado: 'baja_solicitada',
          estado_previo_baja: usuario.estado,
          baja_solicitada_at: ahora
        })
        .eq('id', usuario.id)
      if (errUpdate) return json(500, { ok: false, error: errUpdate.message })

      // Enviar email de confirmación con link de reactivación
      try {
        const reactivarUrl = `${SITE_URL}/reactivar.html?email=${encodeURIComponent(email)}&tipo=${tipo}`
        const htmlEmail = `
          <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1F2933;">
            <div style="background: #006D77; padding: 24px 32px; border-radius: 12px 12px 0 0; text-align: center;">
              <img src="https://cuidy-ar.netlify.app/assets/logo-white.png" alt="Cuidy" width="120" height="40" style="display: inline-block; max-height: 50px; width: auto;" />
            </div>
            <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <h2 style="color: #006D77; margin-top: 0;">Tu solicitud de baja fue recibida</h2>
              <p>Hola <strong>${usuario.nombre}</strong>,</p>
              <p>Recibimos tu solicitud para eliminar tu cuenta de Cuidy. Tu cuenta fue desactivada y <strong>tus datos serán eliminados definitivamente en 30 días</strong>.</p>
              <p>Durante estos 30 días no vas a poder acceder a tu cuenta ni aparecer en búsquedas.</p>

              <div style="background: #FFF5F5; border: 1px solid rgba(255,107,107,.2); border-radius: 12px; padding: 20px; margin: 24px 0;">
                <h3 style="margin: 0 0 8px; color: #FF6B6B; font-size: 15px;">¿Te arrepentiste?</h3>
                <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.7;">Si cambiás de opinión, podés reactivar tu cuenta antes de que pasen los 30 días.</p>
                <a href="${reactivarUrl}" style="display: inline-block; background: #006D77; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 24px; font-size: 14px; font-weight: 700; font-family: 'Montserrat', Arial, sans-serif;">
                  Reactivar mi cuenta
                </a>
              </div>

              <p style="font-size: 13px; color: #9ca3af; margin-top: 24px;">
                Si no solicitaste esta baja, reactivá tu cuenta inmediatamente y cambiá tu contraseña.
              </p>
            </div>
            <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 16px;">
              © ${new Date().getFullYear()} Cuidy · Cuidadores de confianza para cada familia
            </p>
          </div>
        `
        const RESEND_KEY = process.env.RESEND_API_KEY
        if (RESEND_KEY) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: process.env.RESEND_FROM || 'Cuidy <noreply@qqmc.com.ar>',
              to: [email],
              subject: 'Tu solicitud de baja fue recibida — Cuidy',
              html: htmlEmail
            })
          })
          console.log('[baja] email de confirmación enviado a', email)
        }
      } catch (err) {
        console.error('[baja] error al enviar email:', err.message)
      }

      console.log(`[baja] Baja solicitada: ${tipo} ${email} (estado previo: ${usuario.estado})`)
      return json(200, { ok: true, mensaje: 'Baja solicitada. Tu cuenta será eliminada en 30 días. Te enviamos un email de confirmación.' })
    }

    // POST /auth/reactivar → cancelar baja y reactivar cuenta
    if (path === 'auth/reactivar' && event.httpMethod === 'POST') {
      const body = safeParse(event.body)
      const { email, tipo } = body
      if (!email || !tipo) return json(400, { ok: false, error: 'Email y tipo requeridos' })
      if (!['familia', 'cuidador'].includes(tipo)) return json(400, { ok: false, error: 'Tipo inválido' })
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase no configurado' })

      const tabla = tipo === 'familia' ? 'familias' : 'cuidadores'

      const { data: usuario, error: errBuscar } = await supabaseAdmin.from(tabla)
        .select('id, nombre, email, estado, estado_previo_baja, baja_solicitada_at')
        .eq('email', email)
        .maybeSingle()
      if (errBuscar) return json(500, { ok: false, error: errBuscar.message })
      if (!usuario) return json(404, { ok: false, error: 'Usuario no encontrado' })
      if (usuario.estado !== 'baja_solicitada') return json(400, { ok: false, error: 'Tu cuenta no tiene una baja pendiente.' })

      // Verificar que no pasaron más de 30 días
      const diasDesde = (Date.now() - new Date(usuario.baja_solicitada_at).getTime()) / (1000 * 60 * 60 * 24)
      if (diasDesde > 30) return json(400, { ok: false, error: 'El plazo de 30 días expiró. Tus datos ya fueron eliminados.' })

      // Restaurar estado previo
      const estadoRestaurar = usuario.estado_previo_baja || (tipo === 'familia' ? 'activo' : 'enviado')
      const { error: errUpdate } = await supabaseAdmin.from(tabla)
        .update({
          estado: estadoRestaurar,
          estado_previo_baja: null,
          baja_solicitada_at: null
        })
        .eq('id', usuario.id)
      if (errUpdate) return json(500, { ok: false, error: errUpdate.message })

      console.log(`[baja] Cuenta reactivada: ${tipo} ${email} (estado restaurado: ${estadoRestaurar})`)
      return json(200, { ok: true, mensaje: '¡Tu cuenta fue reactivada! Ya podés volver a usar Cuidy.' })
    }

    // ========== PÚBLICO ==========

    // GET /cuidadores   (desde DB: solo aprobados)
    if (event.httpMethod === 'GET' && (path === 'cuidadores' || path === '')) {
      if (!supabase) return json(500, { ok: false, error: 'Supabase no configurado' })
      let q = supabase.from('cuidadores')
        .select('id,nombre,apellido,fecha_nacimiento,especialidades,valoracion,resenas,localidad,provincia,lat,lng,experiencia_anios,bio,disponibilidad,foto_url,verificado,recomendado_por')
        .eq('estado', 'aprobado')
      if (params.tipo && params.tipo !== 'todos') q = q.contains('especialidades', [params.tipo])
      if (params.zona) q = q.or(`localidad.ilike.%${params.zona}%,provincia.ilike.%${params.zona}%,zonas_trabajo.ilike.%${params.zona}%`)
      if (params.experiencia_min) {
        const min = Number(params.experiencia_min)
        if (!isNaN(min) && min > 0) q = q.gte('experiencia_anios', min)
      }
      if (params.verificado === '1') q = q.eq('verificado', true)
      if (params.valoracion_min) {
        const min = Number(params.valoracion_min)
        if (!isNaN(min) && min > 0) q = q.gte('valoracion', min)
      }
      const { data, error } = await q
      if (error) return json(500, { ok: false, error: error.message })

      let resultados = (data || []).map(rowToListado)

      // Filtro de disponibilidad en memoria (día + franja)
      if (params.dias || params.franja) {
        const diasFiltro = params.dias ? params.dias.split(',') : null
        const franjaFiltro = params.franja || null // manana, tarde, noche
        resultados = resultados.filter(c => {
          const disp = c.disponibilidad || {}
          const diasCheck = diasFiltro || Object.keys(disp)
          return diasCheck.some(dia => {
            const franjas = disp[dia]
            if (!franjas || typeof franjas !== 'object') return false
            if (franjaFiltro) return !!(franjas[franjaFiltro] && franjas[franjaFiltro].desde)
            return Object.values(franjas).some(f => f && f.desde)
          })
        })
      }

      // Ordenar: recomendados primero, luego verificados, luego por valoración
      resultados.sort((a, b) => {
        const aRec = a.recomendado ? 1 : 0
        const bRec = b.recomendado ? 1 : 0
        if (aRec !== bRec) return bRec - aRec
        if (a.verificado !== b.verificado) return b.verificado ? 1 : -1
        return (b.valoracion || 0) - (a.valoracion || 0)
      })

      return json(200, { ok: true, data: resultados })
    }

    // GET /cuidadores/:id (uuid)
    const mId = path.match(/^cuidadores\/([0-9a-f-]{36})$/)
    if (mId && event.httpMethod === 'GET') {
      const id = mId[1]
      const { data, error } = await supabase.from('cuidadores')
        .select('*').eq('id', id).eq('estado', 'aprobado').single()
      if (error || !data) return json(404, { ok: false, error: 'Cuidador no encontrado' })
      const base = rowToListado(data)

      // Verificar si la familia tiene acceso al contacto
      let tieneAcceso = false
      if (params.familia_id && supabaseAdmin) {
        try {
          // ¿Ya desbloqueó este contacto?
          const { data: desbloqueado } = await supabaseAdmin.from('contactos_desbloqueados')
            .select('id').eq('familia_id', params.familia_id).eq('cuidador_id', id).maybeSingle()
          if (desbloqueado) {
            tieneAcceso = true
          } else {
            // ¿Tiene suscripción activa?
            const { data: sub } = await supabaseAdmin.from('suscripciones')
              .select('id').eq('familia_id', params.familia_id).eq('estado', 'activa').limit(1).maybeSingle()
            if (sub) tieneAcceso = true
          }
        } catch { /* sin acceso */ }
      }

      // tieneAcceso = suscripción activa (puede ver nombre completo + enviar mensaje por plataforma)
      // contactoDesbloqueado = ambas partes aceptaron → teléfono/email visible
      const { data: desbloqueadoFull } = tieneAcceso && params.familia_id
        ? await supabaseAdmin.from('contactos_desbloqueados')
            .select('id').eq('familia_id', params.familia_id).eq('cuidador_id', id).maybeSingle()
        : { data: null }

      const fichaData = tieneAcceso ? rowToFichaCompleta(data) : base

      // Solo incluir contacto directo si fue mutuamente desbloqueado
      if (desbloqueadoFull) {
        fichaData.contacto = { telefono: data.telefono, email: data.email }
      }

      // Buscar solicitud existente de esta familia a este cuidador
      let solicitudEstado = null
      if (tieneAcceso && params.familia_id && !desbloqueadoFull) {
        const { data: sol } = await supabaseAdmin.from('solicitudes_contacto')
          .select('id,estado,created_at').eq('familia_id', params.familia_id).eq('cuidador_id', id).maybeSingle()
        if (sol) solicitudEstado = sol
      }

      return json(200, {
        ok: true,
        data: fichaData,
        requiere_suscripcion: !tieneAcceso,
        contacto_visible: !!desbloqueadoFull,
        solicitud: solicitudEstado
      })
    }

    // POST /cuidadores  → alta de candidatura (simplificada o completa)
    if (event.httpMethod === 'POST' && path === 'cuidadores') {
      const payload = safeParse(event.body)
      const esSimplificado = !!payload.registro_simplificado
      const errors = validarCuidador(payload)
      if (errors.length) return json(422, { ok: false, error: 'Datos incompletos', detalles: errors })
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })

      const passHash = crypto.createHash('sha256')
        .update((process.env.SESSION_SECRET || 'qqmc') + ':' + payload.password).digest('hex')

      const zona = payload.zona || payload.domicilio || {}
      // Verificar si viene con código de invitación
      let invitacion = null
      if (payload.invitacion_codigo) {
        const { data: inv } = await supabaseAdmin.from('invitaciones')
          .select('*').eq('codigo', payload.invitacion_codigo).maybeSingle()
        if (inv && inv.estado !== 'completada') invitacion = inv
      }

      // Si tiene invitación → estado 'enviado' (prioridad), si no → 'lista_espera'
      const estadoInicial = invitacion ? 'enviado' : 'lista_espera'

      const insert = {
        estado: estadoInicial,
        nombre: payload.identidad.nombre,
        apellido: payload.identidad.apellido,
        dni: String(payload.identidad.dni).replace(/\D/g, ''),
        fecha_nacimiento: payload.identidad.fecha_nacimiento,
        genero: payload.identidad?.genero || null,
        nacionalidad: payload.identidad?.nacionalidad || null,
        email: payload.contacto.email,
        telefono: normalizarTelefono(payload.contacto.telefono) || payload.contacto.telefono,
        password_hash: passHash,
        provincia: zona.provincia,
        localidad: zona.localidad,
        direccion: zona.direccion || null,
        lat: zona.lat || null,
        lng: zona.lng || null,
        especialidades: payload.especialidades,
        experiencia_anios: payload.experiencia_anios || 0,
        valor_hora_min: payload.valor_hora_min || null,
        valor_hora_max: payload.valor_hora_max || null,
        bio: payload.bio || null,
        empleos: payload.empleos || [],
        educacion: payload.educacion || null,
        certificaciones: payload.certificaciones || [],
        certificaciones_otras: payload.certificaciones_otras || null,
        idiomas: payload.idiomas || null,
        disponibilidad: payload.disponibilidad || {},
        modalidades: payload.modalidades || [],
        zonas_trabajo: payload.zonas_trabajo || zona.localidad || null,
        radio_km: payload.radio_km || null,
        antecedentes_fecha: payload.antecedentes_fecha || null,
        consentimientos: payload.consentimientos || {},
        referred_by: payload.referred_by || null,
        utm_source: payload.utm_source || null,
        utm_campaign: payload.utm_campaign || null,
        registro_simplificado: esSimplificado,
        perfil_completo: !esSimplificado,
        recomendado_por: invitacion ? invitacion.familia_id : null,
        invitacion_codigo: invitacion ? invitacion.codigo : null
      }

      const { data: nuevo, error: errIns } = await supabaseAdmin.from('cuidadores')
        .insert(insert).select().single()
      if (errIns) return json(500, { ok: false, error: errIns.message })

      // Guardar verificación de identidad (DNI foto + selfie) como documentos
      if (esSimplificado && payload.verificacion) {
        const verDocs = []
        if (payload.verificacion.dni_foto) {
          verDocs.push({
            cuidador_id: nuevo.id, tipo: 'dni_frente',
            file_name: 'dni_frente.jpg', file_type: 'image/jpeg', file_size: 0,
            data_url: payload.verificacion.dni_foto
          })
        }
        if (payload.verificacion.selfie) {
          verDocs.push({
            cuidador_id: nuevo.id, tipo: 'selfie_dni',
            file_name: 'selfie_dni.jpg', file_type: 'image/jpeg', file_size: 0,
            data_url: payload.verificacion.selfie
          })
        }
        if (verDocs.length) {
          await supabaseAdmin.from('cuidador_documentos').upsert(verDocs, { onConflict: 'cuidador_id,tipo' })
        }
      }

      // Documentos legacy (registro completo)
      if (!esSimplificado && payload.documentos) {
        const CV_MAX_SIZE = 5 * 1024 * 1024
        const CV_VALID_TYPES = ['application/pdf', 'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
        const docsRows = Object.entries(payload.documentos).map(([tipo, meta]) => {
          if (tipo === 'cv') {
            if (meta.size && meta.size > CV_MAX_SIZE) return null
            if (meta.type && !CV_VALID_TYPES.includes(meta.type)) return null
          }
          return {
            cuidador_id: nuevo.id, tipo,
            file_name: meta.name, file_type: meta.type, file_size: meta.size,
            data_url: meta.data_url || null
          }
        }).filter(Boolean)
        if (docsRows.length) {
          await supabaseAdmin.from('cuidador_documentos').upsert(docsRows, { onConflict: 'cuidador_id,tipo' })
        }
      }

      // Referencias (solo si hay, registro completo)
      const refsRows = (payload.referencias || []).map(r => ({
        cuidador_id: nuevo.id, nombre: r.nombre, relacion: r.relacion || null, telefono: r.telefono
      }))
      if (refsRows.length) await supabaseAdmin.from('cuidador_referencias').insert(refsRows)

      // Si vino con invitación, marcarla como completada
      if (invitacion) {
        await supabaseAdmin.from('invitaciones').update({
          estado: 'completada',
          cuidador_id: nuevo.id,
          completed_at: new Date().toISOString()
        }).eq('id', invitacion.id)
        console.log('[invitaciones] completada:', invitacion.codigo, '→ cuidador', nuevo.id)
      }

      // Evento inicial
      const tipoRegistro = invitacion
        ? `Registro por invitación de ${invitacion.familia_nombre}`
        : (esSimplificado ? 'Registro simplificado — lista de espera' : 'Registro sin invitación — lista de espera')
      await registrarEvento(nuevo.id, 'registrada', tipoRegistro, { simplificado: esSimplificado, invitacion: !!invitacion }, 'sistema')

      // Notificación al admin
      await crearNotificacionAdmin(nuevo.id, nuevo.nombre, nuevo.apellido)

      // Email de confirmación al candidato
      await enviarEmailConfirmacion({
        to: nuevo.email,
        nombre: nuevo.nombre,
        apellido: nuevo.apellido,
        id: nuevo.id,
        simplificado: esSimplificado
      })

      console.log('[cuidadores] nueva candidatura', {
        id: nuevo.id, nombre: `${nuevo.nombre} ${nuevo.apellido}`, email: nuevo.email,
        simplificado: esSimplificado
      })

      const proximosPasos = esSimplificado
        ? [
            'Nuestro equipo revisa tu identidad (24-48 hs)',
            'Te pedimos que completes tu perfil profesional',
            'Coordinamos una entrevista virtual',
            'Tu perfil se publica y empezás a recibir contactos'
          ]
        : [
            'Nuestro equipo revisa tu identidad y documentación',
            'Te contactamos para coordinar entrevista virtual',
            'Si la entrevista es satisfactoria, aprobamos tu perfil'
          ]

      return json(201, {
        ok: true,
        data: {
          id: nuevo.id, email: nuevo.email, estado: estadoInicial, creado_en: nuevo.created_at,
          recomendado: !!invitacion,
          recomendado_por_nombre: invitacion ? invitacion.familia_nombre : null,
          proximos_pasos: proximosPasos
        }
      })
    }

    // PATCH /cuidadores/:id → completar perfil O editar datos desde panel
    const mCuidPatch = path.match(/^cuidadores\/([0-9a-f-]{36})$/)
    if (mCuidPatch && event.httpMethod === 'PATCH') {
      const id = mCuidPatch[1]
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })

      const { data: cuid, error: cuidErr } = await supabaseAdmin.from('cuidadores')
        .select('id,estado,email,nombre,apellido').eq('id', id).single()
      if (cuidErr || !cuid) return json(404, { ok: false, error: 'Cuidador no encontrado' })

      const payload = safeParse(event.body)

      // --- Modo "editar datos" desde panel (accion=editar_datos) ---
      if (payload.accion === 'editar_datos') {
        const update = {}
        if (payload.nombre) update.nombre = payload.nombre
        if (payload.apellido) update.apellido = payload.apellido
        if (payload.telefono !== undefined) update.telefono = payload.telefono
        if (payload.provincia) update.provincia = payload.provincia
        if (payload.localidad) update.localidad = payload.localidad
        if (payload.especialidades) update.especialidades = payload.especialidades
        if (payload.bio !== undefined) update.bio = payload.bio
        if (payload.disponibilidad) update.disponibilidad = payload.disponibilidad
        if (payload.modalidades) update.modalidades = payload.modalidades
        if (payload.valor_hora_min !== undefined) update.valor_hora_min = payload.valor_hora_min
        if (payload.valor_hora_max !== undefined) update.valor_hora_max = payload.valor_hora_max
        if (payload.zonas_trabajo) update.zonas_trabajo = payload.zonas_trabajo
        if (payload.radio_km !== undefined) update.radio_km = payload.radio_km
        if (payload.foto_url) update.foto_url = payload.foto_url

        if (!Object.keys(update).length) return json(400, { ok: false, error: 'No hay datos para actualizar' })

        const { data: updated, error: upErr } = await supabaseAdmin.from('cuidadores')
          .update(update).eq('id', id).select().maybeSingle()
        if (upErr) return json(500, { ok: false, error: upErr.message })

        return json(200, { ok: true, data: updated })
      }

      // --- Modo "completar perfil" (flujo original, requiere estado identidad_aprobada) ---
      if (cuid.estado !== 'identidad_aprobada') {
        return json(400, { ok: false, error: `No se puede completar el perfil en estado "${cuid.estado}". Se requiere estado "identidad_aprobada".` })
      }

      const errors = validarCompletarPerfil(payload)
      if (errors.length) return json(422, { ok: false, error: 'Datos incompletos', detalles: errors })

      const update = {
        estado: 'perfil_completo',
        perfil_completo: true,
        bio: payload.bio,
        experiencia_anios: payload.experiencia_anios,
        valor_hora_min: payload.valor_hora_min || null,
        valor_hora_max: payload.valor_hora_max || null,
        empleos: payload.empleos || [],
        educacion: payload.educacion || null,
        certificaciones: payload.certificaciones || [],
        certificaciones_otras: payload.certificaciones_otras || null,
        idiomas: payload.idiomas || null,
        disponibilidad: payload.disponibilidad || {},
        modalidades: payload.modalidades || [],
        zonas_trabajo: payload.zonas_trabajo,
        radio_km: payload.radio_km || null,
        antecedentes_fecha: payload.antecedentes_fecha || null
      }
      if (payload.direccion) update.direccion = payload.direccion
      if (payload.lat) update.lat = payload.lat
      if (payload.lng) update.lng = payload.lng

      const { error: upErr } = await supabaseAdmin.from('cuidadores').update(update).eq('id', id)
      if (upErr) return json(500, { ok: false, error: upErr.message })

      if (payload.documentos) {
        const docsRows = Object.entries(payload.documentos).map(([tipo, meta]) => ({
          cuidador_id: id, tipo,
          file_name: meta.name, file_type: meta.type, file_size: meta.size,
          data_url: meta.data_url || null
        }))
        if (docsRows.length) {
          await supabaseAdmin.from('cuidador_documentos').upsert(docsRows, { onConflict: 'cuidador_id,tipo' })
        }
      }

      if (payload.referencias?.length) {
        await supabaseAdmin.from('cuidador_referencias').delete().eq('cuidador_id', id)
        const refsRows = payload.referencias.map(r => ({
          cuidador_id: id, nombre: r.nombre, relacion: r.relacion || null, telefono: r.telefono
        }))
        await supabaseAdmin.from('cuidador_referencias').insert(refsRows)
      }

      if (payload.foto_url) {
        await supabaseAdmin.from('cuidadores').update({ foto_url: payload.foto_url }).eq('id', id)
      }

      await registrarEvento(id, 'perfil_completado', 'Perfil profesional completado', {}, 'cuidador:' + id)
      await crearNotificacionAdmin(id, cuid.nombre, cuid.apellido)

      return json(200, {
        ok: true,
        data: { id, estado: 'perfil_completo' },
        mensaje: 'Perfil completado. Nuestro equipo va a continuar con la revisión.'
      })
    }

    // POST /cuidadores/login → login de cuidador con email + password
    if (event.httpMethod === 'POST' && path === 'cuidadores/login') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase no configurado' })
      const payload = safeParse(event.body)
      if (!payload.email || !payload.password) return json(400, { ok: false, error: 'Email y contraseña requeridos' })

      const passHash = crypto.createHash('sha256')
        .update((process.env.SESSION_SECRET || 'qqmc') + ':' + payload.password).digest('hex')

      const { data, error } = await supabaseAdmin.from('cuidadores')
        .select('id,nombre,apellido,email,telefono,estado,especialidades,provincia,localidad,bio,foto_url,disponibilidad,modalidades,valor_hora_min,valor_hora_max,zonas_trabajo,radio_km')
        .eq('email', payload.email.trim().toLowerCase())
        .eq('password_hash', passHash)
        .maybeSingle()

      if (error) return json(500, { ok: false, error: error.message })
      if (!data) return json(401, { ok: false, error: 'Email o contraseña incorrectos' })

      return json(200, { ok: true, data })
    }

    // GET /cuidadores/me?email=... → datos del cuidador para panel o completar perfil
    const mCuidMe = path === 'cuidadores/me' && event.httpMethod === 'GET'
    if (mCuidMe) {
      const email = params.email
      if (!email) return json(400, { ok: false, error: 'email requerido' })
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase no configurado' })

      const { data, error } = await supabaseAdmin.from('cuidadores')
        .select('id,nombre,apellido,email,telefono,estado,especialidades,provincia,localidad,bio,foto_url,disponibilidad,modalidades,valor_hora_min,valor_hora_max,zonas_trabajo,radio_km')
        .eq('email', email)
        .maybeSingle()

      if (error) return json(500, { ok: false, error: error.message })
      if (!data) return json(404, { ok: false, error: 'Cuidador no encontrado' })

      return json(200, { ok: true, data })
    }

    // GET /familias/me?email=...
    if (event.httpMethod === 'GET' && path === 'familias/me') {
      const email = params.email
      if (!email) return json(400, { ok: false, error: 'email requerido' })
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase no configurado' })

      const { data, error } = await supabaseAdmin.from('familias')
        .select('id, nombre, apellido, email, telefono, zona, estado, busqueda, preferencias, foto_url, created_at')
        .eq('email', email)
        .maybeSingle()

      if (error) return json(500, { ok: false, error: error.message })
      if (!data) return json(404, { ok: false, error: 'Familia no encontrada' })

      return json(200, { ok: true, data })
    }

    // POST /familias
    if (event.httpMethod === 'POST' && path === 'familias') {
      const payload = safeParse(event.body)
      const errors = validarFamilia(payload)
      if (errors.length) return json(422, { ok: false, error: 'Datos incompletos', detalles: errors })
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })

      const insert = {
        nombre: payload.cuenta.nombre,
        apellido: payload.cuenta.apellido,
        email: payload.cuenta.email,
        telefono: payload.cuenta.telefono,
        fecha_nacimiento: payload.cuenta.fecha_nacimiento || null,
        estado: 'pendiente',
        busqueda: payload.busqueda || {},
        detalle: payload.detalle || {},
        zona: payload.zona || {},
        preferencias: payload.preferencias || {},
        referred_by: payload.referred_by || null,
        utm_source: payload.utm_source || null,
        utm_campaign: payload.utm_campaign || null
      }
      const { data, error } = await supabaseAdmin.from('familias').insert(insert).select().single()
      if (error) return json(500, { ok: false, error: error.message })

      console.log('[familias] nueva familia registrada', { id: data.id, email: data.email, utm_source: insert.utm_source })

      return json(201, { ok: true, data: { id: data.id, email: data.email, creado_en: data.created_at } })
    }

    // PATCH /familias/:id  (actualizar datos extra del wizard)
    const mFamilia = path.match(/^familias\/([0-9a-f-]{36})$/)
    if (event.httpMethod === 'PATCH' && mFamilia) {
      const familiaId = mFamilia[1]
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase no configurado' })

      const payload = safeParse(event.body)
      const update = {}
      if (payload.nombre) update.nombre = payload.nombre
      if (payload.apellido) update.apellido = payload.apellido
      if (payload.busqueda) update.busqueda = payload.busqueda
      if (payload.detalle) update.detalle = payload.detalle
      if (payload.zona) update.zona = payload.zona
      if (payload.preferencias) update.preferencias = payload.preferencias
      if (payload.verificacion) {
        update.verificacion = payload.verificacion
        // Si envía verificación con fotos, cambiar estado a pendiente_verificacion
        if (payload.verificacion.dni_foto && payload.verificacion.selfie) {
          update.estado = 'pendiente_verificacion'
        }
      }
      if (payload.consentimientos) update.consentimientos = payload.consentimientos
      if (payload.fecha_nacimiento) update.fecha_nacimiento = payload.fecha_nacimiento
      if (payload.telefono !== undefined) update.telefono = payload.telefono
      if (payload.foto_url !== undefined) update.foto_url = payload.foto_url

      const { data, error } = await supabaseAdmin.from('familias')
        .update(update)
        .eq('id', familiaId)
        .select()
        .maybeSingle()

      if (error) return json(500, { ok: false, error: error.message })
      return json(200, { ok: true, data })
    }

    // ========== DIARIO DE CUIDADO ==========

    // GET /diario/contratos?cuidador_id=...  → contratos activos del cuidador
    if (path === 'diario/contratos' && event.httpMethod === 'GET') {
      if (!supabase) return json(500, { ok: false, error: 'Supabase no configurado' })
      const cuidadorId = params.cuidador_id
      const familiaId = params.familia_id
      if (!cuidadorId && !familiaId) return json(400, { ok: false, error: 'cuidador_id o familia_id requerido' })

      let q = supabase.from('contratos')
        .select('*,cuidadores(nombre,apellido,foto_url),familias(nombre,apellido)')
        .eq('estado', 'activo')
      if (cuidadorId) q = q.eq('cuidador_id', cuidadorId)
      if (familiaId) q = q.eq('familia_id', familiaId)
      const { data, error } = await q
      if (error) return json(500, { ok: false, error: error.message })
      return json(200, { ok: true, data: data || [] })
    }

    // POST /diario/contratos  → crear contrato + categorías por defecto
    if (path === 'diario/contratos' && event.httpMethod === 'POST') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const body = safeParse(event.body)
      if (!body.familia_id || !body.cuidador_id || !body.tipo_cuidado) {
        return json(400, { ok: false, error: 'familia_id, cuidador_id y tipo_cuidado requeridos' })
      }
      const { data: contrato, error: errC } = await supabaseAdmin.from('contratos')
        .insert({
          familia_id: body.familia_id,
          cuidador_id: body.cuidador_id,
          tipo_cuidado: body.tipo_cuidado,
          persona_cuidada: body.persona_cuidada || null,
          notas: body.notas || null
        }).select().single()
      if (errC) return json(500, { ok: false, error: errC.message })

      // Copiar categorías template para este tipo de cuidado
      const { data: templates } = await supabaseAdmin.from('diario_categorias_template')
        .select('*').eq('tipo_cuidado', body.tipo_cuidado).order('orden')
      if (templates && templates.length) {
        const cats = templates.map(t => ({
          contrato_id: contrato.id,
          nombre: t.nombre,
          icono: t.icono,
          tipo: t.tipo,
          opciones_rapidas: t.opciones_rapidas,
          orden: t.orden
        }))
        await supabaseAdmin.from('diario_categorias').insert(cats)
      }

      return json(201, { ok: true, data: contrato })
    }

    // GET /diario/categorias?contrato_id=...  → categorías para un contrato
    if (path === 'diario/categorias' && event.httpMethod === 'GET') {
      if (!supabase) return json(500, { ok: false, error: 'Supabase no configurado' })
      if (!params.contrato_id) return json(400, { ok: false, error: 'contrato_id requerido' })
      const { data, error } = await supabase.from('diario_categorias')
        .select('*').eq('contrato_id', params.contrato_id).eq('activa', true).order('orden')
      if (error) return json(500, { ok: false, error: error.message })
      return json(200, { ok: true, data: data || [] })
    }

    // POST /diario/entrada  → cuidador registra una entrada
    if (path === 'diario/entrada' && event.httpMethod === 'POST') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const body = safeParse(event.body)
      if (!body.contrato_id || !body.cuidador_id) {
        return json(400, { ok: false, error: 'contrato_id y cuidador_id requeridos' })
      }
      const entrada = {
        contrato_id: body.contrato_id,
        cuidador_id: body.cuidador_id,
        categoria_id: body.categoria_id || null,
        tipo: body.tipo || 'actividad',
        contenido: body.contenido || null,
        foto_url: body.foto_url || null,
        metadata: body.metadata || {},
        lat: body.lat || null,
        lng: body.lng || null
      }
      const { data, error } = await supabaseAdmin.from('diario_entradas')
        .insert(entrada).select().single()
      if (error) return json(500, { ok: false, error: error.message })
      return json(201, { ok: true, data })
    }

    // GET /diario/entradas?contrato_id=...&fecha=YYYY-MM-DD  → timeline del día
    if (path === 'diario/entradas' && event.httpMethod === 'GET') {
      if (!supabase) return json(500, { ok: false, error: 'Supabase no configurado' })
      if (!params.contrato_id) return json(400, { ok: false, error: 'contrato_id requerido' })

      let q = supabase.from('diario_entradas')
        .select('*,diario_categorias(nombre,icono),diario_reacciones(tipo,comentario,familia_id)')
        .eq('contrato_id', params.contrato_id)
        .order('created_at', { ascending: true })

      // Filtrar por fecha si se pasa
      if (params.fecha) {
        const desde = params.fecha + 'T00:00:00'
        const hasta = params.fecha + 'T23:59:59'
        q = q.gte('created_at', desde).lte('created_at', hasta)
      }

      q = q.limit(100)
      const { data, error } = await q
      if (error) return json(500, { ok: false, error: error.message })
      return json(200, { ok: true, data: data || [] })
    }

    // POST /diario/reaccion  → familia reacciona a una entrada
    if (path === 'diario/reaccion' && event.httpMethod === 'POST') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const body = safeParse(event.body)
      if (!body.entrada_id || !body.familia_id) {
        return json(400, { ok: false, error: 'entrada_id y familia_id requeridos' })
      }
      const { data, error } = await supabaseAdmin.from('diario_reacciones')
        .upsert({
          entrada_id: body.entrada_id,
          familia_id: body.familia_id,
          tipo: body.tipo || 'corazon',
          comentario: body.comentario || null
        }, { onConflict: 'entrada_id,familia_id' }).select().single()
      if (error) return json(500, { ok: false, error: error.message })
      return json(200, { ok: true, data })
    }

    // GET /diario/resumen?contrato_id=...&fecha=YYYY-MM-DD  → resumen del día
    if (path === 'diario/resumen' && event.httpMethod === 'GET') {
      if (!supabase) return json(500, { ok: false, error: 'Supabase no configurado' })
      if (!params.contrato_id || !params.fecha) {
        return json(400, { ok: false, error: 'contrato_id y fecha requeridos' })
      }
      const desde = params.fecha + 'T00:00:00'
      const hasta = params.fecha + 'T23:59:59'

      const { data: entradas } = await supabase.from('diario_entradas')
        .select('*,diario_categorias(nombre,icono)')
        .eq('contrato_id', params.contrato_id)
        .gte('created_at', desde).lte('created_at', hasta)
        .order('created_at')

      const items = entradas || []
      const checkin = items.find(e => e.tipo === 'checkin')
      const checkout = items.find(e => e.tipo === 'checkout')
      const actividades = items.filter(e => !['checkin', 'checkout'].includes(e.tipo))
      const fotos = items.filter(e => e.foto_url).length

      const resumen = {
        fecha: params.fecha,
        total_entradas: items.length,
        checkin: checkin ? checkin.created_at : null,
        checkout: checkout ? checkout.created_at : null,
        actividades: actividades.map(a => ({
          hora: a.created_at,
          categoria: a.diario_categorias?.nombre || a.tipo,
          icono: a.diario_categorias?.icono || '📝',
          contenido: a.contenido
        })),
        fotos
      }

      return json(200, { ok: true, data: resumen })
    }

    // GET /diario/recordatorios?contrato_id=...  → recordatorios activos
    if (path === 'diario/recordatorios' && event.httpMethod === 'GET') {
      if (!supabase) return json(500, { ok: false, error: 'Supabase no configurado' })
      if (!params.contrato_id) return json(400, { ok: false, error: 'contrato_id requerido' })
      const { data, error } = await supabase.from('diario_recordatorios')
        .select('*').eq('contrato_id', params.contrato_id).eq('activo', true).order('hora')
      if (error) return json(500, { ok: false, error: error.message })
      return json(200, { ok: true, data: data || [] })
    }

    // ========== MENSAJES FAMILIA → CUIDADOR ==========

    // POST /diario/mensajes  → familia envía mensaje
    if (path === 'diario/mensajes' && event.httpMethod === 'POST') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const body = safeParse(event.body)
      if (!body.contrato_id || !body.familia_id || !body.contenido?.trim()) {
        return json(400, { ok: false, error: 'contrato_id, familia_id y contenido requeridos' })
      }
      const { data, error } = await supabaseAdmin.from('diario_mensajes')
        .insert({
          contrato_id: body.contrato_id,
          familia_id: body.familia_id,
          contenido: body.contenido.trim(),
          prioridad: body.prioridad || 'normal'
        }).select().single()
      if (error) return json(500, { ok: false, error: error.message })

      // Enviar push al cuidador
      const { data: contrato } = await supabaseAdmin.from('contratos')
        .select('cuidador_id').eq('id', body.contrato_id).single()
      if (contrato?.cuidador_id) {
        const titulo = body.prioridad === 'importante' ? '⚠️ Mensaje importante' : '💬 Nuevo mensaje'
        enviarPush('cuidador', contrato.cuidador_id, {
          title: titulo,
          body: body.contenido.trim().substring(0, 100),
          url: `/diario-cuidador.html?contrato=${body.contrato_id}&cuidador=${contrato.cuidador_id}`
        })
      }

      return json(201, { ok: true, data })
    }

    // GET /diario/mensajes?contrato_id=...&no_leidos=1  → mensajes para el cuidador
    if (path === 'diario/mensajes' && event.httpMethod === 'GET') {
      if (!supabase) return json(500, { ok: false, error: 'Supabase no configurado' })
      if (!params.contrato_id) return json(400, { ok: false, error: 'contrato_id requerido' })
      let q = supabase.from('diario_mensajes')
        .select('*,familias(nombre,apellido)')
        .eq('contrato_id', params.contrato_id)
        .order('created_at', { ascending: false })
        .limit(20)
      if (params.no_leidos === '1') q = q.eq('leido', false)
      const { data, error } = await q
      if (error) return json(500, { ok: false, error: error.message })
      return json(200, { ok: true, data: data || [] })
    }

    // PATCH /diario/mensajes/:id  → cuidador marca como leído
    const mMsg = path.match(/^diario\/mensajes\/([0-9a-f-]{36})$/)
    if (mMsg && event.httpMethod === 'PATCH') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const { error } = await supabaseAdmin.from('diario_mensajes')
        .update({ leido: true, leido_at: new Date().toISOString() })
        .eq('id', mMsg[1])
      if (error) return json(500, { ok: false, error: error.message })
      return json(200, { ok: true })
    }

    // ============================================================
    // SUSCRIPCIONES Y PAGOS
    // ============================================================

    // GET /planes → listar planes activos
    if (path === 'planes' && event.httpMethod === 'GET') {
      if (!supabase) return json(500, { ok: false, error: 'Supabase no configurado' })
      const { data, error } = await supabase.from('planes')
        .select('*').eq('activo', true).order('precio_ars')
      if (error) return json(500, { ok: false, error: error.message })
      return json(200, { ok: true, data: data || [] })
    }

    // POST /suscripciones/crear → crear suscripción + preferencia MercadoPago
    if (path === 'suscripciones/crear' && event.httpMethod === 'POST') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Configuración incompleta' })
      const body = safeParse(event.body)
      if (!body.familia_id || !body.plan_id) {
        return json(400, { ok: false, error: 'familia_id y plan_id requeridos' })
      }
      // Si no tiene cuenta de familia, crearla o vincular existente por email
      if (body.email && body.nombre) {
        // Primero buscar por ID
        const { data: porId } = await supabaseAdmin.from('familias')
          .select('id').eq('id', body.familia_id).maybeSingle()
        if (!porId) {
          // Buscar por email (puede que ya exista de antes)
          const { data: porEmail } = await supabaseAdmin.from('familias')
            .select('id').eq('email', body.email).maybeSingle()
          if (porEmail) {
            // Usar el ID existente en vez del generado
            body.familia_id = porEmail.id
          } else {
            const { error: famErr } = await supabaseAdmin.from('familias').insert({
              id: body.familia_id,
              nombre: body.nombre,
              apellido: body.apellido || '',
              email: body.email,
              telefono: body.telefono || ''
            })
            if (famErr) return json(500, { ok: false, error: 'Error al crear cuenta: ' + famErr.message })
          }
        }
      }

      // Obtener plan
      const { data: plan } = await supabaseAdmin.from('planes')
        .select('*').eq('id', body.plan_id).eq('activo', true).single()
      if (!plan) return json(404, { ok: false, error: 'Plan no encontrado' })

      // Crear suscripción en estado pendiente
      const { data: sub, error: subErr } = await supabaseAdmin.from('suscripciones')
        .insert({
          familia_id: body.familia_id,
          plan_id: body.plan_id,
          estado: 'pendiente'
        }).select().single()
      if (subErr) return json(500, { ok: false, error: subErr.message })

      // Si MercadoPago no está configurado → modo simulación
      if (!mpClient) {
        const ahora = new Date()
        const fin = new Date(ahora)
        if (plan.duracion_dias > 0) fin.setDate(fin.getDate() + plan.duracion_dias)

        await supabaseAdmin.from('suscripciones').update({
          estado: 'activa',
          mp_payment_id: 'SIMULADO-' + Date.now(),
          fecha_inicio: ahora.toISOString(),
          fecha_fin: plan.duracion_dias > 0 ? fin.toISOString() : null,
          updated_at: ahora.toISOString()
        }).eq('id', sub.id)

        await supabaseAdmin.from('pagos').insert({
          familia_id: body.familia_id,
          suscripcion_id: sub.id,
          monto_ars: plan.precio_ars,
          monto_usd: plan.precio_usd,
          metodo: 'simulado',
          mp_payment_id: 'SIMULADO-' + Date.now(),
          mp_status: 'approved',
          mp_status_detail: 'Pago simulado para testing'
        })

        // Enviar email de bienvenida
        if (body.email) {
          enviarEmailBienvenidaFamilia({ to: body.email, nombre: body.nombre, planNombre: plan.nombre })
        }

        return json(201, {
          ok: true,
          data: {
            suscripcion_id: sub.id,
            familia_id: body.familia_id,
            simulado: true,
            mensaje: 'Pago simulado — suscripción activada'
          }
        })
      }

      // Crear preferencia en MercadoPago (modo producción)
      const siteUrl = process.env.SITE_URL || 'https://qqmc.com.ar'
      const preference = new Preference(mpClient)
      const mpPref = await preference.create({
        body: {
          items: [{
            id: plan.id,
            title: `QqmC · ${plan.nombre}`,
            description: plan.descripcion,
            quantity: 1,
            unit_price: Number(plan.precio_ars),
            currency_id: 'ARS'
          }],
          payer: {
            email: body.email || ''
          },
          back_urls: {
            success: `${siteUrl}/pago-exitoso.html?sub=${sub.id}`,
            failure: `${siteUrl}/pago-fallido.html`,
            pending: `${siteUrl}/pago-pendiente.html?sub=${sub.id}`
          },
          auto_return: 'approved',
          external_reference: sub.id,
          notification_url: `${siteUrl}/.netlify/functions/api/pagos/webhook`,
          metadata: {
            suscripcion_id: sub.id,
            familia_id: body.familia_id,
            plan_id: body.plan_id
          }
        }
      })

      // Guardar preference_id en la suscripción
      await supabaseAdmin.from('suscripciones')
        .update({ mp_preference_id: mpPref.id })
        .eq('id', sub.id)

      return json(201, {
        ok: true,
        data: {
          suscripcion_id: sub.id,
          mp_preference_id: mpPref.id,
          mp_init_point: mpPref.init_point,
          mp_sandbox_init_point: mpPref.sandbox_init_point
        }
      })
    }

    // POST /pagos/webhook → webhook de MercadoPago (notificación de pago)
    if (path === 'pagos/webhook' && event.httpMethod === 'POST') {
      if (!supabaseAdmin || !mpClient) return json(200, { ok: true }) // responder 200 siempre a MP
      const body = safeParse(event.body)

      // MercadoPago envía type=payment cuando se confirma un pago
      if (body.type === 'payment' && body.data?.id) {
        try {
          const payment = new Payment(mpClient)
          const pago = await payment.get({ id: body.data.id })

          if (pago.status === 'approved') {
            const subId = pago.external_reference || pago.metadata?.suscripcion_id

            if (subId) {
              // Obtener suscripción
              const { data: sub } = await supabaseAdmin.from('suscripciones')
                .select('*, planes(*)').eq('id', subId).single()

              if (sub && sub.estado !== 'activa') {
                const ahora = new Date()
                const fin = new Date(ahora)
                if (sub.planes.duracion_dias > 0) {
                  fin.setDate(fin.getDate() + sub.planes.duracion_dias)
                }

                // Activar suscripción
                await supabaseAdmin.from('suscripciones').update({
                  estado: 'activa',
                  mp_payment_id: String(pago.id),
                  fecha_inicio: ahora.toISOString(),
                  fecha_fin: sub.planes.duracion_dias > 0 ? fin.toISOString() : null,
                  updated_at: ahora.toISOString()
                }).eq('id', subId)

                // Registrar pago
                await supabaseAdmin.from('pagos').insert({
                  familia_id: sub.familia_id,
                  suscripcion_id: subId,
                  monto_ars: pago.transaction_amount,
                  monto_usd: sub.planes.precio_usd,
                  metodo: 'mercadopago',
                  mp_payment_id: String(pago.id),
                  mp_status: pago.status,
                  mp_status_detail: pago.status_detail
                })
              }
            }
          }
        } catch (err) {
          console.error('[webhook] Error procesando pago:', err.message)
        }
      }
      return json(200, { ok: true })
    }

    // GET /suscripciones/estado?familia_id=...  → estado actual de la familia
    if (path === 'suscripciones/estado' && event.httpMethod === 'GET') {
      if (!supabase) return json(500, { ok: false, error: 'Supabase no configurado' })
      if (!params.familia_id) return json(400, { ok: false, error: 'familia_id requerido' })

      const { data: sub } = await supabase.from('suscripciones')
        .select('*, planes(*)')
        .eq('familia_id', params.familia_id)
        .eq('estado', 'activa')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      // Contactos desbloqueados
      const { data: contactos } = await supabase.from('contactos_desbloqueados')
        .select('cuidador_id')
        .eq('familia_id', params.familia_id)

      return json(200, {
        ok: true,
        data: {
          suscripcion: sub || null,
          contactos_desbloqueados: (contactos || []).map(c => c.cuidador_id),
          tiene_acceso: !!sub
        }
      })
    }

    // POST /contactos/desbloquear → registrar que la familia vio un contacto
    if (path === 'contactos/desbloquear' && event.httpMethod === 'POST') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const body = safeParse(event.body)
      if (!body.familia_id || !body.cuidador_id) {
        return json(400, { ok: false, error: 'familia_id y cuidador_id requeridos' })
      }

      // Verificar que tiene suscripción activa o es contacto único ya pagado
      const { data: sub } = await supabaseAdmin.from('suscripciones')
        .select('*, planes(*)')
        .eq('familia_id', body.familia_id)
        .eq('estado', 'activa')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!sub) return json(403, { ok: false, error: 'Sin suscripción activa' })

      // Verificar si ya lo desbloqueó antes (no consume crédito)
      const { data: yaDesbloqueado } = await supabaseAdmin.from('contactos_desbloqueados')
        .select('id')
        .eq('familia_id', body.familia_id)
        .eq('cuidador_id', body.cuidador_id)
        .single()

      if (yaDesbloqueado) {
        // Ya lo tiene, devolver datos del cuidador
        const { data: cuidador } = await supabaseAdmin.from('cuidadores')
          .select('telefono,email').eq('id', body.cuidador_id).single()
        return json(200, { ok: true, data: cuidador, ya_desbloqueado: true })
      }

      // Verificar límite de contactos (NULL = ilimitados)
      if (sub.planes.contactos_incluidos !== null && sub.contactos_usados >= sub.planes.contactos_incluidos) {
        return json(403, { ok: false, error: 'Límite de contactos alcanzado', contactos_usados: sub.contactos_usados, limite: sub.planes.contactos_incluidos })
      }

      // Registrar desbloqueo
      await supabaseAdmin.from('contactos_desbloqueados').insert({
        familia_id: body.familia_id,
        cuidador_id: body.cuidador_id,
        suscripcion_id: sub.id
      })

      // Incrementar contador
      await supabaseAdmin.from('suscripciones')
        .update({ contactos_usados: sub.contactos_usados + 1, updated_at: new Date().toISOString() })
        .eq('id', sub.id)

      // Devolver datos de contacto
      const { data: cuidador } = await supabaseAdmin.from('cuidadores')
        .select('telefono,email').eq('id', body.cuidador_id).single()

      return json(200, { ok: true, data: cuidador })
    }

    // ============================================================
    // SOLICITUDES DE CONTACTO (capa de seguridad)
    // ============================================================

    // POST /contactos/solicitud → familia envía solicitud de contacto al cuidador
    if (path === 'contactos/solicitud' && event.httpMethod === 'POST') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const body = safeParse(event.body)
      if (!body.familia_id || !body.cuidador_id || !body.mensaje?.trim()) {
        return json(400, { ok: false, error: 'familia_id, cuidador_id y mensaje requeridos' })
      }

      // Verificar que la familia esté aprobada (identidad verificada)
      const { data: famCheck } = await supabaseAdmin.from('familias')
        .select('estado').eq('id', body.familia_id).maybeSingle()
      if (!famCheck || famCheck.estado !== 'aprobada') {
        return json(403, { ok: false, error: 'Tu identidad aún está en revisión. Podrás contactar cuidadores una vez que sea verificada.', codigo: 'identidad_pendiente' })
      }

      // Verificar suscripción activa
      const { data: sub } = await supabaseAdmin.from('suscripciones')
        .select('id').eq('familia_id', body.familia_id).eq('estado', 'activa').limit(1).maybeSingle()
      if (!sub) return json(403, { ok: false, error: 'Necesitás una suscripción activa' })

      // Verificar si ya existe solicitud
      const { data: existente } = await supabaseAdmin.from('solicitudes_contacto')
        .select('id,estado').eq('familia_id', body.familia_id).eq('cuidador_id', body.cuidador_id).maybeSingle()
      if (existente) {
        return json(200, { ok: true, data: existente, ya_enviada: true })
      }

      const { data, error } = await supabaseAdmin.from('solicitudes_contacto')
        .insert({
          familia_id: body.familia_id,
          cuidador_id: body.cuidador_id,
          suscripcion_id: sub.id,
          mensaje: body.mensaje.trim()
        }).select().single()
      if (error) return json(500, { ok: false, error: error.message })

      // Notificar al cuidador por push + WhatsApp
      enviarPush('cuidador', body.cuidador_id, {
        title: '👋 Nueva solicitud de contacto',
        body: body.mensaje.trim().substring(0, 100),
        url: `/panel-cuidador.html`
      })

      // WhatsApp al cuidador (notificación urgente)
      try {
        const { data: cuidador } = await supabaseAdmin.from('cuidadores')
          .select('nombre,telefono').eq('id', body.cuidador_id).single()
        const { data: famInfo } = await supabaseAdmin.from('familias')
          .select('nombre').eq('id', body.familia_id).single()
        const nombreFamilia = famInfo?.nombre || 'Una familia'
        if (cuidador?.telefono) {
          const telNorm = normalizarTelefono(cuidador.telefono)
          if (telNorm) {
            const msgWa = `👋 ¡Hola ${cuidador.nombre}!\n\n*${nombreFamilia}* quiere contactarte en Cuidy.\n\n💬 _"${body.mensaje.trim().substring(0, 150)}"_\n\nIngresá a tu panel para ver la solicitud y responder:\n${SITE_URL}/login.html?rol=cuidador\n\n¡No la hagas esperar! 💙`
            enviarWhatsAppTexto(telNorm, msgWa)
          }
        }
      } catch (e) { console.error('[wa] error nueva solicitud:', e.message) }

      return json(201, { ok: true, data })
    }

    // GET /contactos/solicitudes?cuidador_id=... → solicitudes pendientes para el cuidador
    // GET /contactos/solicitudes?familia_id=...  → solicitudes enviadas por la familia
    if (path === 'contactos/solicitudes' && event.httpMethod === 'GET') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase no configurado' })

      const selectCols = params.familia_id
        ? '*,cuidadores(id,nombre,apellido,especialidades,foto_url,localidad,provincia,valor_hora_min,valor_hora_max,telefono,email)'
        : '*,familias(nombre,apellido,email,telefono,zona,busqueda,detalle,foto_url)'

      let data, error
      if (params.cuidador_id) {
        ({ data, error } = await supabaseAdmin.from('solicitudes_contacto')
          .select(selectCols)
          .eq('cuidador_id', params.cuidador_id)
          .order('created_at', { ascending: false }))
      } else if (params.familia_id) {
        // Buscar todos los familia_id que comparten email (por si pagó sin login y después hizo SSO)
        const { data: fam } = await supabaseAdmin.from('familias')
          .select('email').eq('id', params.familia_id).maybeSingle()
        let familiaIds = [params.familia_id]
        if (fam?.email) {
          const { data: sameEmail } = await supabaseAdmin.from('familias')
            .select('id').eq('email', fam.email)
          if (sameEmail?.length) familiaIds = sameEmail.map(f => f.id)
        }
        ({ data, error } = await supabaseAdmin.from('solicitudes_contacto')
          .select(selectCols)
          .in('familia_id', familiaIds)
          .order('created_at', { ascending: false }))
      } else {
        return json(400, { ok: false, error: 'cuidador_id o familia_id requerido' })
      }
      if (error) return json(500, { ok: false, error: error.message })

      // Ocultar datos de contacto según estado
      const dataSafe = (data || []).map(s => {
        if (params.cuidador_id && s.estado !== 'aceptada') {
          if (s.familias) {
            s.familias = {
              nombre: s.familias.nombre,
              apellido: (s.familias.apellido || '').charAt(0) + '.',
              zona: s.familias.zona,
              busqueda: s.familias.busqueda,
              detalle: s.familias.detalle,
              foto_url: s.familias.foto_url
            }
          }
        }
        if (params.familia_id && s.estado !== 'aceptada') {
          if (s.cuidadores) {
            s.cuidadores = {
              id: s.cuidadores.id,
              nombre: s.cuidadores.nombre,
              apellido: (s.cuidadores.apellido || '').charAt(0) + '.',
              especialidades: s.cuidadores.especialidades,
              foto_url: s.cuidadores.foto_url,
              localidad: s.cuidadores.localidad,
              provincia: s.cuidadores.provincia,
              valor_hora_min: s.cuidadores.valor_hora_min,
              valor_hora_max: s.cuidadores.valor_hora_max
            }
          }
        }
        return s
      })

      return json(200, { ok: true, data: dataSafe })
    }

    // PATCH /contactos/solicitudes/:id → cuidador acepta o rechaza
    const mSol = path.match(/^contactos\/solicitudes\/([0-9a-f-]{36})$/)
    if (mSol && event.httpMethod === 'PATCH') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const body = safeParse(event.body)
      if (!['aceptada', 'rechazada'].includes(body.estado)) {
        return json(400, { ok: false, error: 'estado debe ser aceptada o rechazada' })
      }

      const { data: solicitud } = await supabaseAdmin.from('solicitudes_contacto')
        .select('*').eq('id', mSol[1]).single()
      if (!solicitud) return json(404, { ok: false, error: 'Solicitud no encontrada' })

      // Actualizar estado
      await supabaseAdmin.from('solicitudes_contacto')
        .update({
          estado: body.estado,
          respuesta_cuidador: body.respuesta || null,
          respondido_at: new Date().toISOString()
        }).eq('id', mSol[1])

      // Si acepta → desbloquear contacto mutuo
      if (body.estado === 'aceptada') {
        // Obtener suscripción activa de la familia
        const { data: sub } = await supabaseAdmin.from('suscripciones')
          .select('id,contactos_usados,planes(contactos_incluidos)')
          .eq('familia_id', solicitud.familia_id).eq('estado', 'activa')
          .limit(1).maybeSingle()

        if (sub) {
          // Registrar desbloqueo (si no existe ya)
          await supabaseAdmin.from('contactos_desbloqueados')
            .upsert({
              familia_id: solicitud.familia_id,
              cuidador_id: solicitud.cuidador_id,
              suscripcion_id: sub.id
            }, { onConflict: 'familia_id,cuidador_id' })

          // Incrementar contador solo si tiene límite
          if (sub.planes?.contactos_incluidos !== null) {
            await supabaseAdmin.from('suscripciones')
              .update({ contactos_usados: (sub.contactos_usados || 0) + 1, updated_at: new Date().toISOString() })
              .eq('id', sub.id)
          }
        }

        // Notificar a la familia
        enviarPush('familia', solicitud.familia_id, {
          title: '✅ Solicitud aceptada',
          body: 'Tu solicitud de contacto fue aceptada. Ya podés ver los datos de contacto.',
          url: '/login.html'
        })
      }

      // Enviar WhatsApp a la familia (aceptada o rechazada)
      try {
        const { data: familia } = await supabaseAdmin.from('familias')
          .select('nombre, email, telefono').eq('id', solicitud.familia_id).single()
        const { data: cuidador } = await supabaseAdmin.from('cuidadores')
          .select('nombre, apellido').eq('id', solicitud.cuidador_id).single()
        if (familia && cuidador) {
          const nombreCuidador = cuidador.nombre + ' ' + (cuidador.apellido?.[0] || '') + '.'
          // WhatsApp (notificación principal)
          const telFamilia = normalizarTelefono(familia.telefono)
          if (telFamilia) {
            const msgWa = body.estado === 'aceptada'
              ? `✅ ¡Buenas noticias, ${familia.nombre}!\n\n*${nombreCuidador}* aceptó tu solicitud de contacto en Cuidy.\n\nIngresá a la plataforma para ver sus datos de contacto y coordinar:\n${SITE_URL}/login.html\n\n¡Esperamos que sea el inicio de un gran vínculo! 💙`
              : `Hola ${familia.nombre},\n\n*${nombreCuidador}* no pudo aceptar tu solicitud en este momento.\n\nPero no te preocupes, hay muchos cuidadores verificados en Cuidy esperando conectar con vos. Ingresá y seguí buscando:\n${SITE_URL}/login.html`
            enviarWhatsAppTexto(telFamilia, msgWa)
          } else {
            console.warn(`[wa] familia ${solicitud.familia_id} sin teléfono válido, no se pudo notificar`)
          }
        }
      } catch (e) { console.error('[wa] error al preparar notificación respuesta:', e.message) }

      return json(200, { ok: true })
    }

    // ============================================================
    // PUSH NOTIFICATIONS
    // ============================================================

    // POST /push/subscribe → registrar suscripción push del navegador
    if (path === 'push/subscribe' && event.httpMethod === 'POST') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const body = safeParse(event.body)
      if (!body.usuario_tipo || !body.usuario_id || !body.subscription?.endpoint || !body.subscription?.keys) {
        return json(400, { ok: false, error: 'usuario_tipo, usuario_id y subscription requeridos' })
      }
      const { error } = await supabaseAdmin.from('push_suscripciones')
        .upsert({
          usuario_tipo: body.usuario_tipo,
          usuario_id: body.usuario_id,
          endpoint: body.subscription.endpoint,
          keys: body.subscription.keys
        }, { onConflict: 'endpoint' })
      if (error) return json(500, { ok: false, error: error.message })
      return json(200, { ok: true })
    }

    // DELETE /push/subscribe → desuscribir
    if (path === 'push/subscribe' && event.httpMethod === 'DELETE') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const body = safeParse(event.body)
      if (!body.endpoint) return json(400, { ok: false, error: 'endpoint requerido' })
      await supabaseAdmin.from('push_suscripciones').delete().eq('endpoint', body.endpoint)
      return json(200, { ok: true })
    }

    // ============================================================
    // INVITACIONES (familia invita cuidador)
    // ============================================================

    // POST /invitaciones → familia envía invitación a un cuidador por teléfono
    if (path === 'invitaciones' && event.httpMethod === 'POST') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const body = safeParse(event.body)
      if (!body.familia_id || !body.telefono_cuidador) {
        return json(422, { ok: false, error: 'familia_id y telefono_cuidador requeridos' })
      }

      // Normalizar teléfono
      const telNorm = normalizarTelefono(body.telefono_cuidador) || body.telefono_cuidador

      // Verificar que la familia existe
      const { data: familia, error: famErr } = await supabaseAdmin.from('familias')
        .select('id, nombre, apellido').eq('id', body.familia_id).single()
      if (famErr || !familia) return json(404, { ok: false, error: 'Familia no encontrada' })

      // Verificar si ya invitó a ese teléfono
      const { data: existente } = await supabaseAdmin.from('invitaciones')
        .select('id, estado').eq('familia_id', body.familia_id).eq('telefono_cuidador', telNorm).maybeSingle()
      if (existente && existente.estado !== 'expirada') {
        return json(409, { ok: false, error: 'Ya enviaste una invitación a este número', invitacion: existente })
      }

      // Generar código único
      const codigo = crypto.randomBytes(6).toString('hex')

      const { data: inv, error: invErr } = await supabaseAdmin.from('invitaciones').insert({
        familia_id: body.familia_id,
        familia_nombre: `${familia.nombre} ${familia.apellido}`,
        telefono_cuidador: telNorm,
        nombre_cuidador: body.nombre_cuidador || null,
        codigo,
        estado: 'enviada',
        mensaje: body.mensaje || null
      }).select().single()
      if (invErr) return json(500, { ok: false, error: invErr.message })

      // Enviar WhatsApp con link de invitación
      const linkRegistro = `${SITE_URL}/registro-cuidador.html?inv=${codigo}`
      const nombreFam = familia.nombre
      const textoWA = `Hola! *${nombreFam}* te invita a registrarte en *Cuidy* como cuidador/a verificado/a.\n\nCuidy es una plataforma donde familias buscan cuidadores de confianza. Al registrarte con esta invitación, tu perfil tendrá la insignia de *Recomendado* y prioridad en la validación.\n\nRegistrate acá:\n${linkRegistro}`

      try {
        await enviarWhatsAppTexto(telNorm, textoWA)
        console.log('[invitaciones] WhatsApp enviado a', telNorm, 'código:', codigo)
      } catch (waErr) {
        console.error('[invitaciones] Error WhatsApp:', waErr.message)
        // No falla la invitación por error de WA
      }

      return json(201, { ok: true, data: { id: inv.id, codigo, telefono: telNorm, link: linkRegistro } })
    }

    // GET /invitaciones/validar?codigo=xxx → valida invitación
    if (path === 'invitaciones/validar' && event.httpMethod === 'GET') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const codigo = params.codigo
      if (!codigo) return json(422, { ok: false, error: 'codigo requerido' })

      const { data, error } = await supabaseAdmin.from('invitaciones')
        .select('*').eq('codigo', codigo).maybeSingle()
      if (error || !data) return json(404, { ok: false, error: 'Invitación no encontrada' })
      if (data.estado === 'completada') return json(410, { ok: false, error: 'Esta invitación ya fue utilizada' })
      if (data.estado === 'revision_pendiente') return json(403, { ok: false, error: 'Esta recomendación está siendo revisada por nuestro equipo. Te avisaremos cuando esté habilitada.' })

      // Marcar como abierta si es la primera vez
      if (data.estado === 'enviada') {
        await supabaseAdmin.from('invitaciones')
          .update({ estado: 'abierta', opened_at: new Date().toISOString() })
          .eq('id', data.id)
      }

      return json(200, {
        ok: true,
        data: {
          id: data.id,
          codigo: data.codigo,
          familia_nombre: data.familia_nombre,
          familia_id: data.familia_id,
          nombre_cuidador: data.nombre_cuidador
        }
      })
    }

    // GET /invitaciones/mis-invitaciones?familia_id=xxx → lista invitaciones de una familia
    if (path === 'invitaciones/mis-invitaciones' && event.httpMethod === 'GET') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const familiaId = params.familia_id
      if (!familiaId) return json(422, { ok: false, error: 'familia_id requerido' })

      const { data, error } = await supabaseAdmin.from('invitaciones')
        .select('id, telefono_cuidador, nombre_cuidador, codigo, estado, created_at, cuidador_id')
        .eq('familia_id', familiaId)
        .order('created_at', { ascending: false })
      if (error) return json(500, { ok: false, error: error.message })

      return json(200, { ok: true, data: data || [] })
    }

    // POST /recomendaciones/rapida → recomendación rápida desde landing (sin cuenta)
    // Con capas anti-fraude: OTP, cruce de teléfonos, contexto, scoring
    if (path === 'recomendaciones/rapida' && event.httpMethod === 'POST') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const body = safeParse(event.body)

      // Validar datos mínimos de la familia
      if (!body.familia_nombre || !body.familia_email || !body.familia_telefono) {
        return json(422, { ok: false, error: 'Nombre, email y teléfono de la familia son requeridos' })
      }
      // Validar datos del cuidador
      if (!body.cuidador_nombre || !body.cuidador_telefono) {
        return json(422, { ok: false, error: 'Nombre y WhatsApp del cuidador son requeridos' })
      }
      // Validar preguntas de contexto (Capa 3)
      if (!body.tipo_servicio || !body.duracion_relacion || body.actualmente_trabaja === undefined) {
        return json(422, { ok: false, error: 'Completá las preguntas sobre tu experiencia con esta persona' })
      }

      const telFamilia = normalizarTelefono(body.familia_telefono) || body.familia_telefono
      const telCuidador = normalizarTelefono(body.cuidador_telefono) || body.cuidador_telefono

      // ===== CAPA 1: Verificar que el teléfono fue verificado por OTP =====
      const telefonoVerificado = !!body.familia_telefono_verificado
      if (!telefonoVerificado) {
        return json(422, { ok: false, error: 'Verificá tu WhatsApp antes de enviar la recomendación' })
      }

      // ===== CAPA 2: Cruce de teléfonos =====
      // 2a. Teléfono familia ≠ teléfono cuidador
      if (telFamilia === telCuidador) {
        return json(422, { ok: false, error: 'El WhatsApp del cuidador debe ser diferente al tuyo' })
      }

      // 2b. Teléfono familia no debe estar registrado como cuidador
      const { data: esCuidador } = await supabaseAdmin.from('cuidadores')
        .select('id').eq('telefono', telFamilia).maybeSingle()
      if (esCuidador) {
        return json(422, { ok: false, error: 'Este WhatsApp está registrado como cuidador. Solo familias pueden recomendar.' })
      }

      // 2c. Límite de recomendaciones por teléfono (máx 5 activas)
      const { count: totalRecs } = await supabaseAdmin.from('invitaciones')
        .select('id', { count: 'exact', head: true })
        .eq('familia_telefono', telFamilia)
        .neq('estado', 'expirada')
      if (totalRecs >= 5) {
        return json(429, { ok: false, error: 'Alcanzaste el máximo de 5 recomendaciones. Si necesitás recomendar a más personas, creá una cuenta.' })
      }

      // Verificar duplicado (ya existente)
      const { data: existente } = await supabaseAdmin.from('invitaciones')
        .select('id, estado')
        .eq('telefono_cuidador', telCuidador)
        .eq('familia_telefono', telFamilia)
        .maybeSingle()
      if (existente && existente.estado !== 'expirada') {
        return json(409, { ok: false, error: 'Ya enviaste una recomendación para este número' })
      }

      // ===== CAPA 4: Scoring anti-fraude =====
      const ipOrigen = (event.headers['x-forwarded-for'] || event.headers['client-ip'] || '').split(',')[0].trim()
      const fraudFlags = []
      let fraudScore = 0

      // 4a. Prefijos telefónicos similares (mismos primeros 7 dígitos → misma zona + operador)
      const prefFam = telFamilia.replace(/\D/g, '').substring(0, 7)
      const prefCui = telCuidador.replace(/\D/g, '').substring(0, 7)
      if (prefFam === prefCui) {
        fraudScore += 15
        fraudFlags.push('prefijo_telefonico_similar')
      }

      // 4b. Números muy cercanos (diferencia < 10)
      const numFam = parseInt(telFamilia.replace(/\D/g, '').slice(-4), 10)
      const numCui = parseInt(telCuidador.replace(/\D/g, '').slice(-4), 10)
      if (!isNaN(numFam) && !isNaN(numCui) && Math.abs(numFam - numCui) < 10) {
        fraudScore += 25
        fraudFlags.push('numeros_consecutivos')
      }

      // 4c. Apellidos compartidos
      const apellidoFam = (body.familia_nombre || '').trim().split(/\s+/).pop().toLowerCase()
      const apellidoCui = (body.cuidador_nombre || '').trim().split(/\s+/).pop().toLowerCase()
      if (apellidoFam && apellidoCui && apellidoFam === apellidoCui && apellidoFam.length > 2) {
        fraudScore += 30
        fraudFlags.push('apellido_compartido')
      }

      // 4d. Email temporal / descartable
      const emailDomain = (body.familia_email || '').split('@').pop().toLowerCase()
      const tempDomains = ['tempmail.com', 'guerrillamail.com', 'mailinator.com', 'throwaway.email',
        'yopmail.com', 'trashmail.com', 'temp-mail.org', 'dispostable.com', 'maildrop.cc',
        'sharklasers.com', 'guerrillamailblock.com', 'grr.la', 'discard.email', 'mailnesia.com']
      if (tempDomains.includes(emailDomain)) {
        fraudScore += 35
        fraudFlags.push('email_temporal')
      }

      // 4e. Múltiples recomendaciones desde la misma IP en las últimas 24h
      if (ipOrigen) {
        const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { count: recsDesdeIp } = await supabaseAdmin.from('invitaciones')
          .select('id', { count: 'exact', head: true })
          .eq('ip_origen', ipOrigen)
          .gte('created_at', hace24h)
        if (recsDesdeIp >= 3) {
          fraudScore += 20
          fraudFlags.push('multiples_recs_misma_ip')
        }
      }

      // 4f. Duración muy corta de relación (menos de 6 meses = más riesgo)
      if (body.duracion_relacion === 'menos_6m') {
        fraudScore += 10
        fraudFlags.push('relacion_muy_corta')
      }

      // 4g. El teléfono del cuidador ya está registrado como cuidador → podría ser auto-gestionado
      const { data: cuidadorExistente } = await supabaseAdmin.from('cuidadores')
        .select('id, nombre').eq('telefono', telCuidador).maybeSingle()
      if (cuidadorExistente) {
        // Si el cuidador ya existe y alguien lo recomienda, checkear si los nombres coinciden
        const nombreExistente = (cuidadorExistente.nombre || '').toLowerCase().trim()
        const nombreRecomendado = (body.cuidador_nombre || '').toLowerCase().trim()
        if (nombreExistente && nombreRecomendado && nombreExistente !== nombreRecomendado) {
          fraudScore += 15
          fraudFlags.push('nombre_cuidador_no_coincide')
        }
      }

      const requiereRevision = fraudScore >= 30
      console.log(`[antifraude] score=${fraudScore} flags=${JSON.stringify(fraudFlags)} revision=${requiereRevision} ip=${ipOrigen}`)

      // Generar código único
      const codigo = crypto.randomBytes(6).toString('hex')

      // Guardar en invitaciones con datos anti-fraude
      const { data: inv, error: invErr } = await supabaseAdmin.from('invitaciones').insert({
        familia_id: null,
        familia_nombre: body.familia_nombre,
        familia_email: body.familia_email,
        familia_telefono: telFamilia,
        telefono_cuidador: telCuidador,
        nombre_cuidador: body.cuidador_nombre,
        codigo,
        estado: requiereRevision ? 'revision_pendiente' : 'enviada',
        origen: 'landing_rapida',
        // Campos anti-fraude
        tipo_servicio: body.tipo_servicio,
        duracion_relacion: body.duracion_relacion,
        actualmente_trabaja: body.actualmente_trabaja,
        telefono_verificado: telefonoVerificado,
        fraud_score: fraudScore,
        fraud_flags: fraudFlags,
        ip_origen: ipOrigen || null,
        requiere_revision: requiereRevision
      }).select().single()
      if (invErr) return json(500, { ok: false, error: invErr.message })

      // Si viene de una solicitud (Camino A), actualizar estado
      const solicitudRef = body.solicitud_ref || null
      if (solicitudRef) {
        try {
          await supabaseAdmin.from('solicitudes_recomendacion')
            .update({ estado: 'completada', updated_at: new Date().toISOString() })
            .eq('id', solicitudRef)
          console.log('[recomendacion-rapida] Solicitud', solicitudRef, 'marcada como completada')
        } catch (solErr) {
          console.error('[recomendacion-rapida] Error actualizando solicitud:', solErr.message)
        }
      }

      // Enviar WhatsApp al cuidador (solo si no requiere revisión)
      if (!requiereRevision) {
        const linkRegistro = `${SITE_URL}/registro-cuidador.html?inv=${codigo}`
        const nombreFam = body.familia_nombre

        // Mensaje diferente si viene de solicitud del cuidador (Camino A) vs recomendación espontánea
        let textoWA
        if (solicitudRef) {
          textoWA = `¡Buena noticia! *${nombreFam}* completó tu recomendación en *Cuidy* 🎉\n\nYa podés registrarte en la plataforma. Tu perfil va a tener la insignia de *Recomendado* y prioridad en la validación.\n\nRegistrate acá:\n${linkRegistro}`
        } else {
          textoWA = `¡Hola! *${nombreFam.split(' ')[0]}* te recomienda en *Cuidy*, una plataforma donde familias buscan cuidadores de confianza.\n\nAl registrarte con esta invitación, tu perfil va a tener la insignia de *Recomendado* y prioridad en la validación.\n\nRegistrate acá:\n${linkRegistro}`
        }

        try {
          await enviarWhatsAppTexto(telCuidador, textoWA)
          console.log('[recomendacion-rapida] WhatsApp enviado a cuidador', telCuidador, 'código:', codigo)
        } catch (waErr) {
          console.error('[recomendacion-rapida] Error WhatsApp al cuidador:', waErr.message)
        }
      } else {
        // Retenida para revisión: avisar al cuidador solo si viene de solicitud
        if (solicitudRef) {
          try {
            const textoRevision = `¡Hola! *${body.familia_nombre}* completó tu recomendación en *Cuidy*. Nuestro equipo la está revisando para validar algunos datos. Te avisamos por acá cuando esté lista. ¡Gracias por tu paciencia!`
            await enviarWhatsAppTexto(telCuidador, textoRevision)
            console.log('[recomendacion-rapida] WA revisión enviado a cuidador', telCuidador)
          } catch (waErr) {
            console.error('[recomendacion-rapida] Error WA revisión:', waErr.message)
          }
        }
        console.log(`[recomendacion-rapida] Recomendación ${inv.id} retenida para revisión (score=${fraudScore})`)
      }

      // Enviar email a la familia invitándola a registrarse
      try {
        await enviarEmailInvitacionRegistroFamilia({
          to: body.familia_email,
          nombre: body.familia_nombre.split(' ')[0],
          nombreCuidador: body.cuidador_nombre
        })
        console.log('[recomendacion-rapida] Email enviado a familia', body.familia_email)
      } catch (mailErr) {
        console.error('[recomendacion-rapida] Error email familia:', mailErr.message)
      }

      return json(201, { ok: true, data: { id: inv.id, codigo } })
    }

    // ============================================================
    // CUIDADORES: SOLICITAR RECOMENDACIÓN (Camino A)
    // ============================================================

    // POST /recomendaciones/solicitar → el cuidador pide que una familia lo recomiende
    if (path === 'recomendaciones/solicitar' && event.httpMethod === 'POST') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const body = safeParse(event.body)
      const { cuidador_nombre, cuidador_telefono, familia_nombre, familia_telefono, tipo_servicio } = body

      if (!cuidador_nombre || !cuidador_telefono || !familia_nombre || !familia_telefono || !tipo_servicio) {
        return json(422, { ok: false, error: 'Todos los campos son obligatorios.' })
      }

      const telCuidador = normalizarTelefono(cuidador_telefono)
      const telFamilia = normalizarTelefono(familia_telefono)

      if (!telCuidador || !telFamilia) {
        return json(422, { ok: false, error: 'Verificá los números de WhatsApp.' })
      }

      // No puede pedirle recomendación a sí mismo
      if (telCuidador === telFamilia) {
        return json(422, { ok: false, error: 'Tu WhatsApp no puede ser igual al de la familia.' })
      }

      // Verificar que no haya una solicitud pendiente igual
      const { data: existente } = await supabaseAdmin.from('solicitudes_recomendacion')
        .select('id')
        .eq('cuidador_telefono', telCuidador)
        .eq('familia_telefono', telFamilia)
        .in('estado', ['pendiente', 'enviada'])
        .maybeSingle()
      if (existente) {
        return json(409, { ok: false, error: 'Ya enviamos una solicitud a esta familia. Te avisamos cuando responda.' })
      }

      // Guardar solicitud
      const { data: sol, error: solErr } = await supabaseAdmin.from('solicitudes_recomendacion').insert({
        cuidador_nombre,
        cuidador_telefono: telCuidador,
        familia_nombre,
        familia_telefono: telFamilia,
        tipo_servicio,
        estado: 'pendiente',
        ip_origen: (event.headers['x-forwarded-for'] || event.headers['client-ip'] || '').split(',')[0].trim() || null
      }).select().single()
      if (solErr) return json(500, { ok: false, error: solErr.message })

      // Enviar WhatsApp a la familia
      const linkRecomendar = `${SITE_URL}/recomendar-cuidador.html?ref=${sol.id}`
      const nombrePila = cuidador_nombre.split(' ')[0]
      const textoWA = `¡Hola! *${cuidador_nombre}* quiere sumarse a *Cuidy* y te mencionó como referencia de su trabajo.\n\nCuidy es una plataforma que conecta familias con cuidadores verificados (niñeras, cuidado de adultos mayores, personal doméstico). Para ingresar, cada cuidador necesita la recomendación de una familia que conozca su trabajo.\n\nSi considerás que ${nombrePila} puede ser de ayuda para otra familia y querés abrirle más oportunidades, solo te toma 3 minutos completar una breve recomendación. Únicamente te pedimos tu opinión sobre tu experiencia con ${nombrePila}.\n\nCompletá acá:\n${linkRecomendar}\n\nGracias por ayudar a construir una comunidad de confianza 💙`

      try {
        await enviarWhatsAppTexto(telFamilia, textoWA)
        await supabaseAdmin.from('solicitudes_recomendacion')
          .update({ estado: 'enviada' })
          .eq('id', sol.id)
        console.log('[solicitar-rec] WhatsApp enviado a familia', telFamilia, 'solicitud:', sol.id)
      } catch (waErr) {
        console.error('[solicitar-rec] Error WhatsApp a familia:', waErr.message)
        // Dejamos estado 'pendiente' para retry manual
      }

      return json(201, { ok: true, data: { id: sol.id } })
    }

    // POST /recomendaciones/followup → revisa solicitudes sin respuesta y avisa al cuidador
    // Se puede invocar desde un cron diario o manualmente desde admin
    if (path === 'recomendaciones/followup' && event.httpMethod === 'POST') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })

      const diasEspera = 5 // días sin respuesta antes de hacer follow-up
      const fechaLimite = new Date(Date.now() - diasEspera * 24 * 60 * 60 * 1000).toISOString()

      // Buscar solicitudes enviadas hace más de X días sin respuesta
      const { data: pendientes, error: pErr } = await supabaseAdmin.from('solicitudes_recomendacion')
        .select('*')
        .eq('estado', 'enviada')
        .lt('created_at', fechaLimite)
      if (pErr) return json(500, { ok: false, error: pErr.message })
      if (!pendientes || pendientes.length === 0) return json(200, { ok: true, notificados: 0 })

      let notificados = 0
      for (const sol of pendientes) {
        const linkListaEspera = `${SITE_URL}/sumate-cuidador.html?camino=b`
        const nombrePila = sol.cuidador_nombre.split(' ')[0]
        const textoWA = `¡Hola ${nombrePila}! Todavía no recibimos la recomendación de *${sol.familia_nombre}*.\n\nSi preferís no esperar, podés registrarte directamente dejando tus datos para que nuestro equipo evalúe tu perfil. El proceso es un poco más largo pero te permite avanzar sin depender de la recomendación.\n\nRegistrate por esta vía:\n${linkListaEspera}\n\nSi preferís seguir esperando la recomendación, no hace falta que hagas nada. Te avisamos cuando tengamos novedades.`

        try {
          await enviarWhatsAppTexto(sol.cuidador_telefono, textoWA)
          await supabaseAdmin.from('solicitudes_recomendacion')
            .update({ estado: 'expirada', updated_at: new Date().toISOString() })
            .eq('id', sol.id)
          notificados++
          console.log('[followup] Notificado cuidador', sol.cuidador_telefono, 'solicitud:', sol.id)
        } catch (waErr) {
          console.error('[followup] Error WA a cuidador', sol.cuidador_telefono, waErr.message)
        }
      }

      return json(200, { ok: true, notificados })
    }

    // ============================================================
    // CUIDADORES: LISTA DE ESPERA (Camino B)
    // ============================================================

    // POST /cuidadores/lista-espera → cuidador sin recomendación deja sus datos
    if (path === 'cuidadores/lista-espera' && event.httpMethod === 'POST') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const body = safeParse(event.body)
      const { nombre, telefono, telefono_verificado, email, tipo_servicio, experiencia, provincia, localidad, referencias } = body

      if (!nombre || !telefono || !email || !tipo_servicio || !experiencia || !provincia || !localidad) {
        return json(422, { ok: false, error: 'Completá todos los campos obligatorios.' })
      }
      if (!telefono_verificado) {
        return json(422, { ok: false, error: 'Verificá tu WhatsApp antes de enviar.' })
      }

      const telNorm = normalizarTelefono(telefono)
      if (!telNorm) return json(422, { ok: false, error: 'Verificá tu número de WhatsApp.' })

      // Verificar que no esté ya en lista de espera
      const { data: existente } = await supabaseAdmin.from('lista_espera_cuidadores')
        .select('id')
        .eq('telefono', telNorm)
        .in('estado', ['pendiente', 'en_revision'])
        .maybeSingle()
      if (existente) {
        return json(409, { ok: false, error: 'Ya tenemos tu solicitud. Te contactamos pronto.' })
      }

      // Verificar que no esté ya registrado como cuidador
      const { data: yaCuidador } = await supabaseAdmin.from('cuidadores')
        .select('id')
        .eq('telefono', telNorm)
        .maybeSingle()
      if (yaCuidador) {
        return json(409, { ok: false, error: 'Este WhatsApp ya está registrado como cuidador. Podés iniciar sesión directamente.' })
      }

      // Insertar
      const { data: entrada, error: entErr } = await supabaseAdmin.from('lista_espera_cuidadores').insert({
        nombre,
        telefono: telNorm,
        telefono_verificado: true,
        email: email.toLowerCase().trim(),
        tipo_servicio,
        experiencia,
        provincia,
        localidad: localidad.trim(),
        referencias: referencias || null,
        estado: 'pendiente',
        ip_origen: (event.headers['x-forwarded-for'] || event.headers['client-ip'] || '').split(',')[0].trim() || null
      }).select().single()
      if (entErr) return json(500, { ok: false, error: entErr.message })

      console.log('[lista-espera] Nueva solicitud:', entrada.id, telNorm)

      return json(201, { ok: true, data: { id: entrada.id } })
    }

    // ============================================================
    // REFERIDOS Y CAMPAÑAS
    // ============================================================

    // POST /referidos/generar → genera un código de referido para un usuario
    if (path === 'referidos/generar' && event.httpMethod === 'POST') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const body = safeParse(event.body)
      if (!body.nombre || !body.tipo || !['familia', 'cuidador'].includes(body.tipo)) {
        return json(422, { ok: false, error: 'nombre y tipo (familia|cuidador) requeridos' })
      }

      // Generar código legible
      const base = body.nombre.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]/g, '').substring(0, 10)
      const sufijo = crypto.randomBytes(2).toString('hex')
      let codigo = `${base}-${sufijo}`

      // Verificar unicidad
      const { data: existente } = await supabaseAdmin.from('referidos')
        .select('id').eq('codigo', codigo).maybeSingle()
      if (existente) {
        codigo = `${base}-${crypto.randomBytes(4).toString('hex')}`
      }

      const insert = {
        referrer_id: body.user_id || null,
        referrer_tipo: body.tipo,
        referrer_nombre: body.nombre,
        codigo,
        utm_source: body.utm_source || 'referral',
        utm_medium: body.utm_medium || 'referral',
        utm_campaign: body.utm_campaign || `${body.tipo}_invita`,
        canal_compartido: body.canal || null,
        landing_page: body.landing || null
      }

      const { data, error } = await supabaseAdmin.from('referidos').insert(insert).select().single()
      if (error) return json(500, { ok: false, error: error.message })

      console.log('[referidos] código generado:', codigo, 'por', body.tipo, body.nombre)
      return json(201, { ok: true, data: { id: data.id, codigo: data.codigo } })
    }

    // GET /referidos/validar?codigo=xxx → valida y marca como abierto
    if (path === 'referidos/validar' && event.httpMethod === 'GET') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const codigo = params.codigo
      if (!codigo) return json(422, { ok: false, error: 'codigo requerido' })

      const { data, error } = await supabaseAdmin.from('referidos')
        .select('*').eq('codigo', codigo).maybeSingle()
      if (error || !data) return json(404, { ok: false, error: 'Código de referido no encontrado' })

      // Marcar como abierto si es la primera vez
      if (data.estado === 'pendiente') {
        await supabaseAdmin.from('referidos')
          .update({ estado: 'link_abierto', opened_at: new Date().toISOString() })
          .eq('id', data.id)
      }

      return json(200, {
        ok: true,
        data: {
          id: data.id,
          codigo: data.codigo,
          referrer_nombre: data.referrer_nombre,
          referrer_tipo: data.referrer_tipo,
          utm_source: data.utm_source,
          utm_campaign: data.utm_campaign
        }
      })
    }

    // PATCH /referidos/completar → marca referido como registrado
    if (path === 'referidos/completar' && event.httpMethod === 'PATCH') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const body = safeParse(event.body)
      if (!body.codigo || !body.referee_id || !body.referee_tipo) {
        return json(422, { ok: false, error: 'codigo, referee_id y referee_tipo requeridos' })
      }

      const { data, error } = await supabaseAdmin.from('referidos')
        .update({
          referee_id: body.referee_id,
          referee_tipo: body.referee_tipo,
          estado: 'registrado',
          registered_at: new Date().toISOString()
        })
        .eq('codigo', body.codigo)
        .select()
        .single()

      if (error) return json(500, { ok: false, error: error.message })

      console.log('[referidos] completado:', body.codigo, '→', body.referee_tipo, body.referee_id)

      // Incrementar métricas de campaña
      const hoy = new Date().toISOString().split('T')[0]
      const tipoCol = body.referee_tipo === 'familia' ? 'registros_familia' : 'registros_cuidador'
      await supabaseAdmin.rpc('incrementar_metrica_campana', {
        p_fecha: hoy,
        p_source: data.utm_source,
        p_medium: data.utm_medium,
        p_campaign: data.utm_campaign,
        p_landing: data.landing_page,
        p_columna: tipoCol
      }).catch(() => { /* rpc puede no existir aún */ })

      return json(200, { ok: true, data })
    }

    // GET /referidos/mis-referidos?user_id=xxx&tipo=familia → lista referidos del usuario
    if (path === 'referidos/mis-referidos' && event.httpMethod === 'GET') {
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })
      const userId = params.user_id
      const tipo = params.tipo
      if (!userId || !tipo) return json(422, { ok: false, error: 'user_id y tipo requeridos' })

      const { data, error } = await supabaseAdmin.from('referidos')
        .select('id,codigo,referee_tipo,estado,created_at,registered_at,referrer_nombre')
        .eq('referrer_id', userId)
        .eq('referrer_tipo', tipo)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) return json(500, { ok: false, error: error.message })
      return json(200, { ok: true, data })
    }

    // GET /campanas/metricas → métricas agregadas (admin)
    if (path === 'campanas/metricas' && event.httpMethod === 'GET') {
      const admin = getAdminSession(event)
      if (!admin) return json(401, { ok: false, error: 'No autorizado' })
      if (!supabaseAdmin) return json(500, { ok: false, error: 'Supabase admin no configurado' })

      const desde = params.desde || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
      const hasta = params.hasta || new Date().toISOString().split('T')[0]

      const { data, error } = await supabaseAdmin.from('campana_metricas')
        .select('*')
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false })

      if (error) return json(500, { ok: false, error: error.message })

      // También traer resumen de referidos del período
      const { data: referidos } = await supabaseAdmin.from('referidos')
        .select('estado,utm_source,utm_campaign,referrer_tipo,referee_tipo')
        .gte('created_at', desde + 'T00:00:00Z')
        .lte('created_at', hasta + 'T23:59:59Z')

      const resumen = {
        total_referidos: referidos?.length || 0,
        abiertos: referidos?.filter(r => r.estado !== 'pendiente').length || 0,
        registrados: referidos?.filter(r => ['registrado', 'activo'].includes(r.estado)).length || 0,
        por_fuente: {},
        por_campana: {}
      }

      ;(referidos || []).forEach(r => {
        resumen.por_fuente[r.utm_source] = (resumen.por_fuente[r.utm_source] || 0) + 1
        resumen.por_campana[r.utm_campaign] = (resumen.por_campana[r.utm_campaign] || 0) + 1
      })

      return json(200, { ok: true, data: { metricas: data, resumen } })
    }

    return json(404, { ok: false, error: 'Ruta no encontrada' })
  } catch (err) {
    console.error('[api] error no controlado:', err)
    return json(500, { ok: false, error: err.message })
  }
}

function safeParse(body) {
  try { return JSON.parse(body || '{}') } catch { return {} }
}

// ---- Helpers de agenda (entrevistas) -------------------------
function pad2(n) { return String(n).padStart(2, '0') }

function defaultSchedule(user) {
  // Franjas por defecto: Lun a Vie, 09:00-18:00
  const horarios = {}
  for (const d of [1, 2, 3, 4, 5]) horarios[d] = { desde: '09:00', hasta: '18:00' }
  return {
    admin_user: user,
    dias_habiles: [1, 2, 3, 4, 5],      // legado
    hora_desde: '09:00',                 // legado
    hora_hasta: '18:00',                 // legado
    horarios,
    duracion_min: 30,
    anticipacion_min_horas: 24,
    horizonte_dias: 30
  }
}

// Devuelve la franja del día (desde/hasta) considerando el campo nuevo horarios
// y cayendo al legado (dias_habiles + hora_desde + hora_hasta) si no hay nada.
function franjaParaDia(cfg, weekday) {
  const horarios = cfg.horarios || {}
  const clave = String(weekday)
  if (horarios[clave] && horarios[clave].desde && horarios[clave].hasta) {
    return { desde: horarios[clave].desde, hasta: horarios[clave].hasta }
  }
  // Legado: si no hay entrada por día, usamos la franja global si el día está habilitado
  if (Object.keys(horarios).length === 0 && (cfg.dias_habiles || []).includes(weekday)) {
    return { desde: cfg.hora_desde, hasta: cfg.hora_hasta }
  }
  return null
}

function buildSlots(fecha /* YYYY-MM-DD */, cfg) {
  const [y, m, d] = fecha.split('-').map(Number)
  const dateObj = new Date(y, m - 1, d)
  const weekday = dateObj.getDay() // 0=dom...6=sab

  const franja = franjaParaDia(cfg, weekday)
  if (!franja) return []

  const [hdH, hdM] = String(franja.desde).split(':').map(Number)
  const [hhH, hhM] = String(franja.hasta).split(':').map(Number)
  const start = hdH * 60 + hdM
  const end = hhH * 60 + hhM
  const step = Number(cfg.duracion_min) || 30
  if (end <= start) return []

  const slots = []
  for (let t = start; t + step <= end; t += step) {
    slots.push(`${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`)
  }
  return slots
}

// ---- Notificaciones admin ------------------------------------
async function crearNotificacionAdmin(cuidadorId, nombre, apellido) {
  if (!supabaseAdmin) return
  try {
    await supabaseAdmin.from('admin_notificaciones').insert({
      tipo: 'nueva_candidatura',
      titulo: 'Nueva candidatura recibida',
      mensaje: `${nombre} ${apellido} envió su registro como cuidador/a.`,
      metadata: { cuidador_id: cuidadorId },
      leida: false
    })
  } catch (err) {
    console.error('[notificacion] error al crear:', err.message)
  }
}

// ---- Email de confirmación al candidato ----------------------
async function enviarEmailConfirmacion({ to, nombre, apellido, id }) {
  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) {
    console.log('[mail] RESEND_API_KEY no configurada — email no enviado a', to)
    return
  }

  const siteUrl = SITE_URL
  const logoUrl = 'https://cuidy-ar.netlify.app/assets/logo-white.png'

  const html = `
    <div style="font-family: 'Lato', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: #0d7377; padding: 24px 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <img src="${logoUrl}" alt="Quiero que me Cuides" style="max-height: 60px; margin-bottom: 8px;" />
      </div>
      <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <h2 style="color: #0d7377; margin-top: 0;">¡Hola ${nombre}!</h2>
        <p>Recibimos tu registro como cuidador/a. Nuestro equipo va a revisar tu documentación e información en las próximas <strong>24 a 72 horas hábiles</strong>.</p>

        <div style="background: #f0fdf9; border: 1px solid #d1fae5; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h3 style="margin: 0 0 8px; color: #0d7377; font-size: 15px;">Próximos pasos</h3>
          <ol style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
            <li>Revisamos tu identidad y documentación</li>
            <li>Te contactamos para coordinar una entrevista virtual</li>
            <li>Si la entrevista es satisfactoria, aprobamos tu perfil</li>
            <li>Tu perfil se publica y comenzás a recibir contactos de familias</li>
          </ol>
        </div>

        <p>Si tenés alguna duda o necesitás modificar tu información, no dudes en escribirnos.</p>

        <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-top: 24px; font-size: 14px;">
          <strong>Datos de contacto de QqmC:</strong><br>
          Email: <a href="mailto:contacto@qqmc.com.ar" style="color: #0d7377;">contacto@qqmc.com.ar</a><br>
          WhatsApp: <a href="https://wa.me/5491100000000" style="color: #0d7377;">+54 9 11 0000-0000</a>
        </div>

        <p style="margin-top: 24px; font-size: 13px; color: #9ca3af;">
          Este email fue enviado automáticamente. Por favor no respondas a esta dirección.
        </p>
      </div>
      <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 16px;">
        © ${new Date().getFullYear()} Quiero que me Cuides · "Las pequeñas cosas hacen la diferencia"
      </p>
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'QqmC <noreply@qqmc.com.ar>',
        to: [to],
        subject: `${nombre}, recibimos tu registro en Quiero que me Cuides`,
        html
      })
    })
    const data = await res.json()
    if (!res.ok) console.error('[mail] error Resend:', data)
    else console.log('[mail] email enviado a', to, data.id)
  } catch (err) {
    console.error('[mail] error al enviar:', err.message)
  }
}

// ---- Email para completar perfil (identidad aprobada) ----------
async function enviarEmailCompletarPerfil({ to, nombre, apellido, id }) {
  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) {
    console.log('[mail] RESEND_API_KEY no configurada — email completar perfil no enviado a', to)
    return
  }

  const siteUrl = SITE_URL
  const logoUrl = 'https://cuidy-ar.netlify.app/assets/logo-white.png'
  const completarUrl = `${siteUrl}/completar-perfil.html?id=${id}&email=${encodeURIComponent(to)}`

  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1F2933;">
      <div style="background: #006D77; padding: 24px 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <img src="${logoUrl}" alt="Cuidy" style="height: 100px; width: auto;" />
      </div>
      <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <h2 style="color: #006D77; margin-top: 0;">¡Hola ${nombre}!</h2>
        <p style="font-size: 16px; line-height: 1.6;">Verificamos tu identidad y está todo bien. Ahora necesitamos que completes tu <strong>perfil profesional</strong> para que las familias puedan conocerte.</p>

        <div style="background: #f0fdf9; border: 1px solid #d1fae5; border-radius: 12px; padding: 24px; margin: 24px 0;">
          <h3 style="margin: 0 0 12px; color: #006D77; font-size: 15px;">¿Qué te vamos a pedir?</h3>
          <ul style="margin: 0; padding-left: 18px; font-size: 14px; line-height: 2;">
            <li>Una descripción sobre vos y tu experiencia</li>
            <li>Tu disponibilidad horaria</li>
            <li>Formación y certificaciones</li>
            <li>Referencias personales</li>
            <li>Una foto de perfil profesional</li>
          </ul>
        </div>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${completarUrl}" style="display: inline-block; background: #FF6B6B; color: #fff; text-decoration: none; padding: 16px 40px; border-radius: 30px; font-size: 16px; font-weight: 700; font-family: 'Montserrat', Arial, sans-serif;">
            Completar mi perfil
          </a>
        </div>

        <p style="font-size: 14px; color: #6b7280;">Una vez que completes tu perfil, nuestro equipo lo revisa y coordina una entrevista virtual. Después de eso, tu perfil se publica y empezás a recibir contactos de familias.</p>

        <div style="background: #F8F7F3; border-radius: 8px; padding: 16px; margin-top: 24px; font-size: 14px;">
          <strong>¿Tenés alguna duda?</strong><br>
          Escribinos a <a href="mailto:contacto@cuidy.com.ar" style="color: #006D77;">contacto@cuidy.com.ar</a>
        </div>
      </div>
      <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 16px;">
        © ${new Date().getFullYear()} Cuidy · "Somos el punto de encuentro entre vos y quien te cuida"
      </p>
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Cuidy <noreply@cuidy.com.ar>',
        to: [to],
        subject: `${nombre}, ¡tu identidad fue verificada! Completá tu perfil en Cuidy`,
        html
      })
    })
    const data = await res.json()
    if (!res.ok) console.error('[mail] error Resend completar-perfil:', data)
    else console.log('[mail] email completar-perfil enviado a', to, data.id)
  } catch (err) {
    console.error('[mail] error al enviar completar-perfil:', err.message)
  }
}

// ---- Email de entrevista al candidato -------------------------
// ---- Email de activación para nuevo admin --------------------
async function enviarEmailActivacionAdmin({ to, nombre, usuario, token }) {
  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) {
    console.log('[mail] RESEND_API_KEY no configurada — email activación admin no enviado a', to)
    console.log('[mail] Link de activación:', `${SITE_URL}/admin/setup-password.html?token=${token}`)
    return
  }

  const siteUrl = SITE_URL
  const logoUrl = 'https://cuidy-ar.netlify.app/assets/logo-white.png'
  const setupUrl = `${siteUrl}/admin/setup-password.html?token=${token}`

  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1F2933;">
      <div style="background: #006D77; padding: 24px 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <img src="${logoUrl}" alt="Cuidy" style="height: 100px; width: auto;" />
      </div>
      <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <h2 style="color: #006D77; margin-top: 0;">¡Hola ${nombre}!</h2>
        <p style="font-size: 16px; line-height: 1.6;">Te dieron acceso al <strong>panel interno de Cuidy</strong>. Para empezar, necesitás configurar tu contraseña.</p>

        <div style="background: #f0fdf9; border: 1px solid #d1fae5; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0; font-size: 14px;">
            <strong>Tu usuario:</strong> ${usuario}<br>
            <strong>Válido por:</strong> 48 horas
          </p>
        </div>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${setupUrl}" style="display: inline-block; background: #FF6B6B; color: #fff; text-decoration: none; padding: 16px 40px; border-radius: 30px; font-size: 16px; font-weight: 700; font-family: 'Montserrat', Arial, sans-serif;">
            Configurar mi contraseña
          </a>
        </div>

        <p style="font-size: 14px; color: #6b7280;">Si no esperabas este email, podés ignorarlo. El link expira en 48 horas.</p>

        <div style="background: #F8F7F3; border-radius: 8px; padding: 16px; margin-top: 24px; font-size: 14px;">
          <strong>¿Tenés alguna duda?</strong><br>
          Escribinos a <a href="mailto:contacto@cuidy.com.ar" style="color: #006D77;">contacto@cuidy.com.ar</a>
        </div>
      </div>
      <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 16px;">
        © ${new Date().getFullYear()} Cuidy · Panel interno
      </p>
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Cuidy <noreply@cuidy.com.ar>',
        to: [to],
        subject: `${nombre}, te invitaron al panel de Cuidy — configurá tu contraseña`,
        html
      })
    })
    const data = await res.json()
    if (!res.ok) console.error('[mail] error Resend activación admin:', data)
    else console.log('[mail] email activación admin enviado a', to, data.id)
  } catch (err) {
    console.error('[mail] error al enviar activación admin:', err.message)
  }
}

// ---- Email de bienvenida a la familia post-pago -------------------------
async function enviarEmailBienvenidaFamilia({ to, nombre, planNombre }) {
  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) { console.log('[mail] RESEND_API_KEY no config — bienvenida familia no enviado a', to); return }
  const logoUrl = 'https://cuidy-ar.netlify.app/assets/logo-white.png'
  const html = `
    <div style="font-family:'Inter',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1F2933">
      <div style="background:#006D77;padding:24px 32px;border-radius:12px 12px 0 0;text-align:center">
        <img src="${logoUrl}" alt="Cuidy" style="height:100px;width:auto" />
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <h2 style="color:#006D77;margin-top:0">¡Bienvenida a Cuidy, ${nombre}!</h2>
        <p style="font-size:16px;line-height:1.6">Tu plan <strong>${planNombre}</strong> ya está activo. Ahora podés contactar a los cuidadores que te interesen y recibir sus respuestas.</p>
        <div style="background:#f0fdf9;border:1px solid #d1fae5;border-radius:12px;padding:20px;margin:24px 0">
          <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#006D77">¿Qué podés hacer ahora?</p>
          <p style="margin:0;font-size:14px;line-height:1.6">
            ✓ Buscar cuidadores y ver sus perfiles completos<br>
            ✓ Enviar mensajes a los que te interesen<br>
            ✓ Recibir notificaciones cuando respondan<br>
            ✓ Ver tus contactos desde "Mis contactos"
          </p>
        </div>
        <p style="font-size:14px;line-height:1.6">Para acceder a tu cuenta, ingresá con tu cuenta de Google desde la plataforma.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${SITE_URL}" style="display:inline-block;background:#FF6B6B;color:#fff;text-decoration:none;padding:16px 40px;border-radius:30px;font-size:16px;font-weight:700;font-family:'Montserrat',Arial,sans-serif">Ir a Cuidy</a>
        </div>
        <p style="font-size:14px;color:#6b7280">Si tenés alguna duda, escribinos a <a href="mailto:contacto@cuidy.com.ar" style="color:#006D77">contacto@cuidy.com.ar</a></p>
      </div>
      <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px">© ${new Date().getFullYear()} Cuidy</p>
    </div>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.RESEND_FROM || 'Cuidy <noreply@cuidy.com.ar>', to: [to], subject: `¡Bienvenida a Cuidy, ${nombre}! Tu plan está activo`, html })
    })
    const data = await res.json()
    if (!res.ok) console.error('[mail] error Resend bienvenida familia:', data)
    else console.log('[mail] email bienvenida familia enviado a', to, data.id)
  } catch (err) { console.error('[mail] error bienvenida familia:', err.message) }
}

// ---- Email respuesta solicitud (cuidador → familia) -------------------------
async function enviarEmailRespuestaSolicitud({ to, nombreFamilia, nombreCuidador, estado }) {
  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) { console.log('[mail] RESEND_API_KEY no config — respuesta solicitud no enviado a', to); return }
  const logoUrl = 'https://cuidy-ar.netlify.app/assets/logo-white.png'
  const aceptada = estado === 'aceptada'
  const html = `
    <div style="font-family:'Inter',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1F2933">
      <div style="background:#006D77;padding:24px 32px;border-radius:12px 12px 0 0;text-align:center">
        <img src="${logoUrl}" alt="Cuidy" style="height:100px;width:auto" />
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <h2 style="color:#006D77;margin-top:0">Hola ${nombreFamilia},</h2>
        ${aceptada
          ? `<p style="font-size:16px;line-height:1.6"><strong>${nombreCuidador}</strong> aceptó tu solicitud de contacto. 🎉</p>
             <p style="font-size:16px;line-height:1.6">Ya podés ver sus datos de contacto en la plataforma. Entrá a <strong>"Mis contactos"</strong> para comunicarte.</p>`
          : `<p style="font-size:16px;line-height:1.6"><strong>${nombreCuidador}</strong> no pudo aceptar tu solicitud en este momento.</p>
             <p style="font-size:16px;line-height:1.6">No te preocupes, hay muchos cuidadores verificados en Cuidy. Seguí buscando al indicado para vos.</p>`}
        <div style="text-align:center;margin:28px 0">
          <a href="${SITE_URL}" style="display:inline-block;background:#FF6B6B;color:#fff;text-decoration:none;padding:16px 40px;border-radius:30px;font-size:16px;font-weight:700;font-family:'Montserrat',Arial,sans-serif">${aceptada ? 'Ver datos de contacto' : 'Seguir buscando'}</a>
        </div>
        <p style="font-size:14px;color:#6b7280">Si tenés alguna duda, escribinos a <a href="mailto:contacto@cuidy.com.ar" style="color:#006D77">contacto@cuidy.com.ar</a></p>
      </div>
      <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px">© ${new Date().getFullYear()} Cuidy</p>
    </div>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Cuidy <noreply@cuidy.com.ar>', to: [to],
        subject: aceptada ? `${nombreCuidador} aceptó tu solicitud en Cuidy` : `Actualización sobre tu solicitud en Cuidy`,
        html
      })
    })
    const data = await res.json()
    if (!res.ok) console.error('[mail] error Resend respuesta solicitud:', data)
    else console.log('[mail] email respuesta solicitud enviado a', to, data.id)
  } catch (err) { console.error('[mail] error respuesta solicitud:', err.message) }
}

// ---- Email de entrevista al candidato -------------------------
async function enviarEmailEntrevista({ to, nombre, apellido, fecha, link }) {
  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) {
    console.log('[mail] RESEND_API_KEY no configurada — email entrevista no enviado a', to)
    return
  }

  const siteUrl = SITE_URL
  const logoUrl = 'https://cuidy-ar.netlify.app/assets/logo-white.png'

  const f = new Date(fecha)
  const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const diaSemana = diasSemana[f.getDay()]
  const dia = f.getDate()
  const mes = meses[f.getMonth()]
  const anio = f.getFullYear()
  const hora = `${pad2(f.getHours())}:${pad2(f.getMinutes())}`
  const fechaLegible = `${diaSemana} ${dia} de ${mes} de ${anio} a las ${hora} hs`

  // Generar archivo .ics para invitación al calendario
  const icsStart = fecha.replace(/[-:]/g, '').replace('T', 'T') + '00'
  const endDate = new Date(f.getTime() + 30 * 60 * 1000) // 30 min de duración
  const icsEnd = endDate.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//QqmC//Entrevista//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `DTSTART:${icsStart}`,
    `DTEND:${icsEnd}`,
    `SUMMARY:Entrevista QqmC - ${nombre} ${apellido}`,
    `DESCRIPTION:Entrevista virtual con el equipo de Quiero que me Cuides.\\nLink: ${link}`,
    `LOCATION:${link}`,
    `URL:${link}`,
    'STATUS:CONFIRMED',
    `ORGANIZER;CN=QqmC:mailto:${(process.env.RESEND_FROM || '').match(/<(.+)>/)?.[1] || 'noreply@qqmc.com.ar'}`,
    `ATTENDEE;CN=${nombre} ${apellido};RSVP=TRUE:mailto:${to}`,
    `UID:qqmc-entrevista-${Date.now()}@quieroquemecuides.com`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')

  const html = `
    <div style="font-family: 'Lato', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: #0d7377; padding: 24px 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <img src="${logoUrl}" alt="Quiero que me Cuides" style="max-height: 60px; margin-bottom: 8px;" />
      </div>
      <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <h2 style="color: #0d7377; margin-top: 0;">¡Hola ${nombre}!</h2>
        <p>Te confirmamos que tu entrevista virtual con el equipo de <strong>Quiero que me Cuides</strong> quedó agendada.</p>

        <div style="background: #f0fdf9; border: 1px solid #d1fae5; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
          <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Fecha y hora</p>
          <p style="margin: 0; font-size: 20px; font-weight: 700; color: #0d7377;">${fechaLegible}</p>
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${link}" style="display: inline-block; background: #0d7377; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 700;">
            Unirme a la videollamada
          </a>
          <p style="margin: 8px 0 0; font-size: 12px; color: #9ca3af;">${link}</p>
        </div>

        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h3 style="margin: 0 0 8px; color: #92400e; font-size: 14px;">Para tener en cuenta</h3>
          <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #78350f; line-height: 1.8;">
            <li>Conectate unos minutos antes para probar audio y video</li>
            <li>Buscá un lugar tranquilo y con buena conexión</li>
            <li>La entrevista dura aproximadamente 20-30 minutos</li>
            <li>Tené a mano tu DNI por si te lo pedimos</li>
          </ul>
        </div>

        <p>Si no podés asistir, por favor avisanos con anticipación respondiendo a este email o por WhatsApp.</p>

        <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-top: 24px; font-size: 14px;">
          <strong>Datos de contacto de QqmC:</strong><br>
          Email: <a href="mailto:contacto@qqmc.com.ar" style="color: #0d7377;">contacto@qqmc.com.ar</a><br>
          WhatsApp: <a href="https://wa.me/5491100000000" style="color: #0d7377;">+54 9 11 0000-0000</a>
        </div>

        <p style="margin-top: 24px; font-size: 13px; color: #9ca3af;">
          Este email fue enviado automáticamente. Encontrás adjunto un archivo .ics para agregar la entrevista a tu calendario.
        </p>
      </div>
      <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 16px;">
        © ${new Date().getFullYear()} Quiero que me Cuides · "Las pequeñas cosas hacen la diferencia"
      </p>
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'QqmC <noreply@qqmc.com.ar>',
        to: [to],
        subject: `Entrevista confirmada: ${fechaLegible} - Quiero que me Cuides`,
        html,
        attachments: [{
          filename: 'entrevista-qqmc.ics',
          content: Buffer.from(icsContent).toString('base64'),
          content_type: 'text/calendar; method=REQUEST'
        }]
      })
    })
    const data = await res.json()
    if (!res.ok) console.error('[mail] error Resend entrevista:', data)
    else console.log('[mail] email entrevista enviado a', to, data.id)
  } catch (err) {
    console.error('[mail] error al enviar entrevista:', err.message)
  }
}

// ---- Email invitación a registro para familia que recomendó desde landing ----
async function enviarEmailInvitacionRegistroFamilia({ to, nombre, nombreCuidador }) {
  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) { console.log('[mail] RESEND_API_KEY no config — invitación registro familia no enviado a', to); return }

  const siteUrl = SITE_URL
  const logoUrl = 'https://cuidy-ar.netlify.app/assets/logo-white.png'

  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1F2933;">
      <div style="background: #006D77; padding: 24px 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <img src="${logoUrl}" alt="Cuidy" width="120" height="40" style="display: inline-block; max-height: 50px; width: auto;" />
      </div>
      <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <h2 style="color: #006D77; margin-top: 0;">¡Gracias por tu recomendación, ${nombre}!</h2>
        <p>Ya le enviamos una invitación a <strong>${nombreCuidador}</strong> para que se registre en Cuidy con tu respaldo. Cuando se registre, va a tener la insignia de <strong>Recomendado</strong> y prioridad en la validación.</p>

        <div style="background: #F8F7F3; border: 1px solid rgba(0,109,119,.1); border-radius: 12px; padding: 20px; margin: 24px 0;">
          <h3 style="margin: 0 0 8px; color: #006D77; font-size: 15px;">Creá tu cuenta en Cuidy</h3>
          <p style="margin: 0; font-size: 14px; line-height: 1.7;">Si creás tu cuenta, vas a poder ver el estado de tus recomendaciones, recomendar a más personas y buscar cuidadores verificados cerca tuyo.</p>
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${siteUrl}/registro-familia.html?utm_source=email&utm_medium=transaccional&utm_campaign=post_recomendacion" style="display: inline-block; background: #FF6B6B; color: #fff; text-decoration: none; padding: 14px 36px; border-radius: 28px; font-size: 16px; font-weight: 700; font-family: 'Montserrat', Arial, sans-serif;">
            Crear mi cuenta gratis
          </a>
        </div>

        <p style="font-size: 14px; color: #6b7280;">El registro es gratuito y toma menos de 2 minutos.</p>

        <p style="margin-top: 24px; font-size: 13px; color: #9ca3af;">
          Este email fue enviado porque recomendaste a un cuidador/a en Cuidy. Si no fuiste vos, podés ignorar este mensaje.
        </p>
      </div>
      <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 16px;">
        © ${new Date().getFullYear()} Cuidy · Cuidadores de confianza para cada familia
      </p>
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Cuidy <noreply@qqmc.com.ar>',
        to: [to],
        subject: `${nombre}, tu recomendación fue enviada — Cuidy`,
        html
      })
    })
    const data = await res.json()
    if (!res.ok) console.error('[mail] error Resend invitación registro familia:', data)
    else console.log('[mail] email invitación registro familia enviado a', to, data.id)
  } catch (err) {
    console.error('[mail] error al enviar invitación registro familia:', err.message)
  }
}
