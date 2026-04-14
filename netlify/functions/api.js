const { createClient } = require('@supabase/supabase-js')

// Cliente Supabase (se usará cuando migremos los datos a la base)
const supabase = process.env.SUPABASE_URL
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null

// Datos mock temporales (CABA y GBA). Reemplazar por Supabase más adelante.
const CUIDADORES_MOCK = [
  {
    id: 1,
    nombre: 'María González',
    edad: 34,
    especialidad: 'ninera',
    valoracion: 4.8,
    resenas: 42,
    zona: 'Palermo, CABA',
    lat: -34.5889, lng: -58.4298,
    experiencia_anios: 10,
    bio: 'Maestra jardinera con 10 años de experiencia cuidando niños de 0 a 6 años.',
    disponibilidad: 'Lunes a viernes 8:00 a 18:00',
    foto: 'https://i.pravatar.cc/200?img=1',
    verificado: true,
    contacto: { telefono: '+54 11 5555-1001', email: 'maria.g@example.com' }
  },
  {
    id: 2,
    nombre: 'Laura Pérez',
    edad: 52,
    especialidad: 'adulto_mayor',
    valoracion: 4.9,
    resenas: 87,
    zona: 'Belgrano, CABA',
    lat: -34.5627, lng: -58.4583,
    experiencia_anios: 20,
    bio: 'Enfermera geriátrica. Acompañamiento y cuidados básicos de adultos mayores.',
    disponibilidad: 'Turnos de 8 o 12 hs, todos los días',
    foto: 'https://i.pravatar.cc/200?img=5',
    verificado: true,
    contacto: { telefono: '+54 11 5555-1002', email: 'laura.p@example.com' }
  },
  {
    id: 3,
    nombre: 'Sofía Ramírez',
    edad: 28,
    especialidad: 'ninera',
    valoracion: 4.6,
    resenas: 18,
    zona: 'Caballito, CABA',
    lat: -34.6190, lng: -58.4406,
    experiencia_anios: 5,
    bio: 'Estudiante de Psicopedagogía, experiencia en cuidado de niños en edad escolar.',
    disponibilidad: 'Tardes y fines de semana',
    foto: 'https://i.pravatar.cc/200?img=9',
    verificado: true,
    contacto: { telefono: '+54 11 5555-1003', email: 'sofia.r@example.com' }
  },
  {
    id: 4,
    nombre: 'Carolina Díaz',
    edad: 45,
    especialidad: 'domestica',
    valoracion: 4.7,
    resenas: 56,
    zona: 'Villa Urquiza, CABA',
    lat: -34.5734, lng: -58.4874,
    experiencia_anios: 15,
    bio: 'Empleada doméstica registrada. Tareas generales y limpieza profunda.',
    disponibilidad: 'Lunes, miércoles y viernes por la mañana',
    foto: 'https://i.pravatar.cc/200?img=10',
    verificado: true,
    contacto: { telefono: '+54 11 5555-1004', email: 'carolina.d@example.com' }
  },
  {
    id: 5,
    nombre: 'Ana Torres',
    edad: 39,
    especialidad: 'domestica',
    valoracion: 4.5,
    resenas: 31,
    zona: 'Vicente López, GBA',
    lat: -34.5264, lng: -58.4810,
    experiencia_anios: 12,
    bio: 'Tareas del hogar, planchado y cocina. Referencias comprobables.',
    disponibilidad: 'Full time de lunes a viernes',
    foto: 'https://i.pravatar.cc/200?img=12',
    verificado: false,
    contacto: { telefono: '+54 11 5555-1005', email: 'ana.t@example.com' }
  },
  {
    id: 6,
    nombre: 'Patricia López',
    edad: 58,
    especialidad: 'adulto_mayor',
    valoracion: 5.0,
    resenas: 104,
    zona: 'Núñez, CABA',
    lat: -34.5447, lng: -58.4618,
    experiencia_anios: 25,
    bio: 'Auxiliar gerontológica matriculada. Manejo de pacientes con Alzheimer.',
    disponibilidad: 'Turnos rotativos 24 hs',
    foto: 'https://i.pravatar.cc/200?img=20',
    verificado: true,
    contacto: { telefono: '+54 11 5555-1006', email: 'patricia.l@example.com' }
  },
  {
    id: 7,
    nombre: 'Julieta Fernández',
    edad: 25,
    especialidad: 'ninera',
    valoracion: 4.4,
    resenas: 12,
    zona: 'Almagro, CABA',
    lat: -34.6095, lng: -58.4205,
    experiencia_anios: 3,
    bio: 'Profesora de nivel inicial. Estimulación temprana y apoyo escolar.',
    disponibilidad: 'Mañanas y tardes',
    foto: 'https://i.pravatar.cc/200?img=25',
    verificado: true,
    contacto: { telefono: '+54 11 5555-1007', email: 'julieta.f@example.com' }
  },
  {
    id: 8,
    nombre: 'Roxana Álvarez',
    edad: 47,
    especialidad: 'domestica',
    valoracion: 4.8,
    resenas: 64,
    zona: 'San Isidro, GBA',
    lat: -34.4708, lng: -58.5127,
    experiencia_anios: 18,
    bio: 'Experiencia en casas grandes. Limpieza, cocina y planchado.',
    disponibilidad: 'Martes y jueves',
    foto: 'https://i.pravatar.cc/200?img=32',
    verificado: true,
    contacto: { telefono: '+54 11 5555-1008', email: 'roxana.a@example.com' }
  },
  {
    id: 9,
    nombre: 'Mónica Ruiz',
    edad: 50,
    especialidad: 'adulto_mayor',
    valoracion: 4.7,
    resenas: 48,
    zona: 'Flores, CABA',
    lat: -34.6377, lng: -58.4638,
    experiencia_anios: 22,
    bio: 'Acompañante terapéutica. Experiencia con pacientes oncológicos.',
    disponibilidad: 'Lunes a sábados de 14 a 22',
    foto: 'https://i.pravatar.cc/200?img=16',
    verificado: true,
    contacto: { telefono: '+54 11 5555-1009', email: 'monica.r@example.com' }
  },
  {
    id: 10,
    nombre: 'Valeria Castro',
    edad: 31,
    especialidad: 'ninera',
    valoracion: 4.9,
    resenas: 29,
    zona: 'Tigre, GBA',
    lat: -34.4265, lng: -58.5796,
    experiencia_anios: 7,
    bio: 'Niñera con RCP certificado. Cuidado de bebés y niños pequeños.',
    disponibilidad: 'Lunes a viernes, jornada completa',
    foto: 'https://i.pravatar.cc/200?img=47',
    verificado: true,
    contacto: { telefono: '+54 11 5555-1010', email: 'valeria.c@example.com' }
  }
]

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
}

const json = (statusCode, body) => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify(body)
})

// Quita los datos de contacto para usuarios sin suscripción
const sanitizar = (c) => {
  const { contacto, ...publico } = c
  return publico
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {})

  // Ruta relativa al endpoint /api → ej. "cuidadores" o "cuidadores/3"
  const path = (event.path || '').replace(/^.*\/api\/?/, '')
  const params = event.queryStringParameters || {}

  try {
    // GET /cuidadores?tipo=ninera&zona=palermo
    if (event.httpMethod === 'GET' && (path === 'cuidadores' || path === '')) {
      let res = CUIDADORES_MOCK

      if (params.tipo && params.tipo !== 'todos') {
        res = res.filter(c => c.especialidad === params.tipo)
      }
      if (params.zona) {
        const q = params.zona.toLowerCase().trim()
        res = res.filter(c => c.zona.toLowerCase().includes(q))
      }

      return json(200, { ok: true, data: res.map(sanitizar) })
    }

    // GET /cuidadores/:id  → datos de contacto sólo si sub=1 (placeholder de suscripción)
    const matchId = path.match(/^cuidadores\/(\d+)$/)
    if (event.httpMethod === 'GET' && matchId) {
      const id = Number(matchId[1])
      const c = CUIDADORES_MOCK.find(x => x.id === id)
      if (!c) return json(404, { ok: false, error: 'Cuidador no encontrado' })

      const tieneSuscripcion = params.sub === '1'
      return json(200, {
        ok: true,
        data: tieneSuscripcion ? c : sanitizar(c),
        requiere_suscripcion: !tieneSuscripcion
      })
    }

    return json(404, { ok: false, error: 'Ruta no encontrada' })
  } catch (err) {
    return json(500, { ok: false, error: err.message })
  }
}
