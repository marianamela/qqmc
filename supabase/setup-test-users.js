#!/usr/bin/env node
/* ============================================================
   Cuidy · Setup de usuarios de prueba en Supabase Auth

   Ejecutar DESPUÉS de seed-testeo.sql.
   Crea las cuentas de familia en Supabase Auth para que puedan
   hacer login desde el formulario.

   Uso:
     node supabase/setup-test-users.js

   Requiere: la URL y anon key del proyecto DEV de Supabase
   (ya hardcodeados — son valores públicos, la seguridad está en RLS)
   ============================================================ */

const SUPABASE_URL = 'https://uvndeeabgjkjwxbfdsmi.supabase.co';
const ANON_KEY = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bmRlZWFiZ2prand4YmZkc21pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDE3OTUsImV4cCI6MjA5MTcxNzc5NX0',
  'fLgkUroPQmgiaa0Qf4wngUa-C4r34bpLrUag7NCLuo0'
].join('.');

const API_BASE = 'https://dev--cuidy-ar.netlify.app/.netlify/functions/api';

const FAMILIAS = [
  { nombre: 'Ana',       apellido: 'Martínez', email: 'ana.test@cuidy.com.ar',   telefono: '+54 11 4000-0001', zona: 'Palermo' },
  { nombre: 'Laura',     apellido: 'Gómez',    email: 'laura.test@cuidy.com.ar', telefono: '+54 11 4000-0002', zona: 'Belgrano' },
  { nombre: 'Carolina',  apellido: 'Ruiz',     email: 'caro.test@cuidy.com.ar',  telefono: '+54 11 4000-0003', zona: 'Recoleta' },
  { nombre: 'Valentina', apellido: 'López',    email: 'vale.test@cuidy.com.ar',  telefono: '+54 11 4000-0004', zona: 'Caballito' },
];

const PASSWORD = 'Test2026!';

async function signUp(email, password, metadata) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
    },
    body: JSON.stringify({ email, password, data: metadata }),
  });
  return res.json();
}

async function main() {
  console.log('🔧 Creando usuarios de prueba en Supabase Auth...\n');

  for (const fam of FAMILIAS) {
    process.stdout.write(`  → ${fam.nombre} ${fam.apellido} (${fam.email})... `);
    try {
      const result = await signUp(fam.email, PASSWORD, {
        nombre: fam.nombre,
        apellido: fam.apellido,
      });

      if (result.error || result.msg) {
        const msg = result.error?.message || result.msg || JSON.stringify(result);
        if (msg.includes('already been registered') || msg.includes('already registered')) {
          console.log('ya existe ✓');
        } else {
          console.log(`ERROR: ${msg}`);
        }
      } else {
        console.log('creada ✓');
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
    }
  }

  console.log('\n✅ Setup completo.');
  console.log('\n📋 ACCESOS DE PRUEBA:');
  console.log('─'.repeat(60));
  console.log('');
  console.log('FAMILIAS (login desde login.html, tab "Soy familia"):');
  for (const fam of FAMILIAS) {
    console.log(`  ${fam.nombre} ${fam.apellido}: ${fam.email} / ${PASSWORD}`);
  }
  console.log('');
  console.log('CUIDADORAS (login desde login.html, tab "Soy cuidador/a"):');
  console.log(`  María Test:  maria.cuid@cuidy.com.ar / ${PASSWORD}`);
  console.log(`  Susana Test: susana.cuid@cuidy.com.ar / ${PASSWORD}`);
  console.log(`  Rosa Test:   rosa.cuid@cuidy.com.ar / ${PASSWORD}`);
  console.log(`  Julia Test:  julia.cuid@cuidy.com.ar / ${PASSWORD}`);
  console.log(`  Lucía Test:  lucia.cuid@cuidy.com.ar / ${PASSWORD}`);
  console.log('');
  console.log('ADMIN:');
  console.log('  mariana / qqmc2026');
  console.log('');
}

main().catch(console.error);
