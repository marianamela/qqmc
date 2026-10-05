// ============================================================
//  Scheduled Function: Expirar matches vencidos
//  Corre cada hora. Vence matches que pasaron sus 48hs.
// ============================================================

const { schedule } = require('@netlify/functions');

exports.handler = schedule('@hourly', async (event) => {
  const API_URL = process.env.URL || 'https://cuidy-ar.netlify.app';

  try {
    const res = await fetch(
      `${API_URL}/.netlify/functions/api/matches/expirar`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const data = await res.json();
    console.log('Matches expirados:', JSON.stringify(data));

    return { statusCode: 200 };
  } catch (err) {
    console.error('Error expirando matches:', err);
    return { statusCode: 500 };
  }
});
