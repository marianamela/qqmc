const h = require('./netlify/functions/api').handler;
(async () => {
  const r1 = await h({ httpMethod:'GET', path:'/.netlify/functions/api/cuidadores', queryStringParameters: {} });
  console.log('GET cuidadores (sin SB):', r1.statusCode, JSON.parse(r1.body));

  const r2 = await h({ httpMethod:'GET', path:'/.netlify/functions/api/admin/me', headers: {} });
  console.log('admin/me:', r2.statusCode, JSON.parse(r2.body));

  process.env.ADMIN_USER = 'mariana';
  process.env.ADMIN_PASSWORD = 'test123';
  process.env.SESSION_SECRET = 'dev-secret-for-testing-only-xxx';
  delete require.cache[require.resolve('./netlify/functions/api')];
  const h2 = require('./netlify/functions/api').handler;

  const r3 = await h2({ httpMethod:'POST', path:'/.netlify/functions/api/admin/login', body: JSON.stringify({ user:'x', password:'y' }) });
  console.log('admin/login wrong:', r3.statusCode, JSON.parse(r3.body));

  const r4 = await h2({ httpMethod:'POST', path:'/.netlify/functions/api/admin/login', body: JSON.stringify({ user:'mariana', password:'test123' }) });
  console.log('admin/login ok:', r4.statusCode, 'has set-cookie:', Boolean(r4.headers['Set-Cookie']));

  const cookie = r4.headers['Set-Cookie'].split(';')[0];
  const r5 = await h2({ httpMethod:'GET', path:'/.netlify/functions/api/admin/me', headers: { cookie } });
  console.log('admin/me after login:', r5.statusCode, JSON.parse(r5.body));

  const r6 = await h2({ httpMethod:'GET', path:'/.netlify/functions/api/admin/candidaturas', headers: {} });
  console.log('candidaturas sin auth:', r6.statusCode, JSON.parse(r6.body));

  const r7 = await h2({ httpMethod:'GET', path:'/.netlify/functions/api/admin/candidaturas', headers: { cookie } });
  console.log('candidaturas con auth (sin SB admin):', r7.statusCode, JSON.parse(r7.body));
})();
