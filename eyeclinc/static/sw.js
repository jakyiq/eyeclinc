/**
 * sw.js — Service Worker for Clinic Management PWA
 * Caches the app shell so it loads instantly and works offline.
 * Strategy: Cache-first for static assets, Network-first for API calls.
 */

const CACHE_NAME   = 'clinic-app-v1';
const SHELL_ASSETS = [
  '/',
  '/static/index.html',
  '/static/auth.js',
  '/static/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  // Chart.js from CDN — cached on first load
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
];

// ── Install: pre-cache the app shell ──────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Cache what we can — ignore failures (CDN may be unavailable)
        return Promise.allSettled(
          SHELL_ASSETS.map(url =>
            cache.add(url).catch(e => console.log('SW cache skip:', url, e))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ─────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: smart routing ───────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. API calls — always go to network, never cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({ error: 'أنت غير متصل بالإنترنت. يرجى التحقق من اتصالك.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // 2. Navigation requests (page loads) — network first, fallback to cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          // Cache fresh copy
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return resp;
        })
        .catch(() => caches.match('/') || caches.match('/static/index.html'))
    );
    return;
  }

  // 3. Static assets — cache first, then network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        // Only cache successful responses for same-origin or CDN assets
        if (resp.ok && (url.origin === self.location.origin || url.hostname.includes('cdnjs'))) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return resp;
      });
    })
  );
});

// ── Push notifications (future use) ───────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch(e) { data = { title: 'إشعار', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'نظام العيادة', {
      body:    data.body || '',
      icon:    '/static/icons/icon-192.png',
      badge:   '/static/icons/icon-192.png',
      dir:     'rtl',
      lang:    'ar',
      tag:     data.tag || 'clinic-notification',
      data:    data.url ? { url: data.url } : {},
      actions: data.actions || [],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
