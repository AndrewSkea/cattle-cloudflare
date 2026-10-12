// HoovesWho service worker: makes the app installable, lets its pages open without signal, and shows reminders.
// API calls (/api/*) always go to the network; farm data is never cached here.
const VERSION = 'v2'; // bump to drop old caches
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const OFFLINE = '/offline'; // served from offline.html (the Worker drops .html)

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.addAll([OFFLINE, '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== STATIC && key !== PAGES) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Hashed build files and icons never change: cache first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.open(STATIC).then(async (cache) => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Pages: network first, falling back to the last copy seen, then the offline page.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(PAGES);
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') cache.put(url.pathname, res.clone());
        return res;
      } catch {
        return (await cache.match(url.pathname)) || (await cache.match(OFFLINE));
      }
    })());
  }
});

// Reminder notifications (Web Push). The payload is encrypted by the server and carries everything to show,
// so nothing is fetched here (the Cloudflare Access cookie may have expired overnight).
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'HoovesWho', {
    body: data.body || 'You have farm reminders today.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'hooveswho',
    renotify: true,
    data: { url: data.url || '/dashboard' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/dashboard', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin && 'focus' in w) { await w.focus(); return w.navigate(url); }
    }
    return self.clients.openWindow(url);
  })());
});
