/* =============================================================
   QQMC · Service Worker
   - Cache de assets estáticos para carga rápida
   - Soporte offline básico (shell de la app)
   - Sincronización de entradas del Diario cuando vuelve la conexión
   ============================================================= */

// Versión del cache — cambiar este valor fuerza actualización completa
const CACHE_VERSION = 3;
const CACHE_NAME = `cuidy-v${CACHE_VERSION}`;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/chat.js',
  '/auth.js',
  '/manifest.json',
  '/assets/logo.svg',
  '/assets/icon-192.png'
];

// Instalar: cachear assets estáticos y forzar activación inmediata
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activar: limpiar TODOS los caches anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network first para todo, cache como fallback offline
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: siempre a la red
  if (url.pathname.startsWith('/.netlify/functions/')) {
    event.respondWith(
      fetch(event.request.clone()).catch(() => {
        if (event.request.method === 'POST' && url.pathname.includes('/diario')) {
          return saveForSync(event.request.clone()).then(() => {
            return new Response(JSON.stringify({
              ok: true,
              offline: true,
              message: 'Guardado. Se enviará cuando vuelva la conexión.'
            }), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        }
        return new Response(JSON.stringify({ ok: false, error: 'Sin conexión' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Assets: NETWORK FIRST, cache solo como fallback offline
  if (event.request.method === 'GET') {
    event.respondWith(
      fetch(event.request).then((response) => {
        // Guardar en cache para uso offline
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Sin red: usar cache
        return caches.match(event.request).then((cached) => {
          return cached || new Response('Offline', { status: 503 });
        });
      })
    );
    return;
  }

  event.respondWith(fetch(event.request));
});

// ---- Sync offline: guardar entradas del diario para enviar después ----
async function saveForSync(request) {
  const body = await request.json();
  const db = await openSyncDB();
  const tx = db.transaction('pendientes', 'readwrite');
  tx.objectStore('pendientes').add({
    url: request.url,
    body,
    timestamp: Date.now()
  });
  return tx.complete;
}

function openSyncDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('qqmc-sync', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('pendientes', { keyPath: 'timestamp' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Cuando vuelve la conexión, enviar todo lo pendiente
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-diario') {
    event.waitUntil(syncPendientes());
  }
});

async function syncPendientes() {
  try {
    const db = await openSyncDB();
    const tx = db.transaction('pendientes', 'readonly');
    const store = tx.objectStore('pendientes');
    const req = store.getAll();

    return new Promise((resolve) => {
      req.onsuccess = async () => {
        const items = req.result || [];
        for (const item of items) {
          try {
            await fetch(item.url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item.body)
            });
            // Si se envió OK, borrar de pendientes
            const delTx = db.transaction('pendientes', 'readwrite');
            delTx.objectStore('pendientes').delete(item.timestamp);
          } catch {
            // Si falla, se intentará en el próximo sync
          }
        }
        resolve();
      };
    });
  } catch {
    // DB no disponible
  }
}

// ---- Push Notifications ----
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Cuidy', body: event.data.text() };
  }

  const options = {
    body: payload.body || '',
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: payload.url || '/' },
    actions: [{ action: 'open', title: 'Ver' }]
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Cuidy', options)
  );
});

// Al hacer click en la notificación, abrir la URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Si ya hay una ventana abierta, enfocarla y navegar
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Si no, abrir una nueva
      return clients.openWindow(url);
    })
  );
});

// Listener para mensajes desde la app (forzar sync manual)
self.addEventListener('message', (event) => {
  if (event.data === 'sync-now') {
    syncPendientes();
  }
});
