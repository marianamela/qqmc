const h = require('./netlify/functions/api').handler;
(async () => {
  const base = {
    identidad: { nombre:'M', apellido:'G', dni:'28345678', fecha_nacimiento:'1990-01-01', nacionalidad:'Argentina' },
    contacto: { email:'m@t.com', telefono:'+5491112345678' },
    password: 'supersegura123',
    domicilio: { provincia:'caba', localidad:'Palermo', direccion:'Güemes 1234' }, // sin lat/lng
    especialidades: ['ninera'], experiencia_anios: 3,
    bio: 'Texto suficientemente largo para cumplir el mínimo de ochenta caracteres requeridos por el sistema.',
    disponibilidad: { lun:['manana'] }, zonas_trabajo: 'Palermo',
    documentos: {
      dni_frente: { name:'a' }, dni_dorso: { name:'b' },
      selfie_dni: { name:'c' }, antecedentes: { name:'d' }
    },
    antecedentes_fecha: new Date(Date.now()-60*864e5).toISOString().slice(0,10),
    referencias: [{nombre:'A', telefono:'1'}],
    consentimientos: { privacidad:true, verificacion:true, conducta:true, datos_veraces:true }
  };

  // 1. Sin lat/lng → 422
  const r1 = await h({ httpMethod:'POST', path:'/.netlify/functions/api/cuidadores', body:JSON.stringify(base) });
  console.log('→ sin coords:', r1.statusCode, JSON.parse(r1.body).detalles?.filter(d => d.includes('lat') || d.includes('lng')));

  // 2. Con lat/lng inválidos (string)
  const r2 = await h({ httpMethod:'POST', path:'/.netlify/functions/api/cuidadores',
    body:JSON.stringify({...base, domicilio:{...base.domicilio, lat:"abc", lng:"xyz"}}) });
  console.log('→ lat string:', r2.statusCode, JSON.parse(r2.body).detalles?.filter(d => d.includes('lat') || d.includes('lng')));

  // 3. Con lat/lng válidos (números) — solo verificamos que pase la validación (no llegue a DB)
  process.env.SUPABASE_URL = '';
  delete require.cache[require.resolve('./netlify/functions/api')];
  const h2 = require('./netlify/functions/api').handler;
  const r3 = await h2({ httpMethod:'POST', path:'/.netlify/functions/api/cuidadores',
    body:JSON.stringify({...base, domicilio:{...base.domicilio, lat:-34.5889, lng:-58.4298}}) });
  // Sin SB admin configurado, pasa la validación pero 500 al guardar
  console.log('→ con coords (sin DB):', r3.statusCode, JSON.parse(r3.body).error);
})();
