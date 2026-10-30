/* Jarvis: guarda la interfaz para que abra rápido (la IA y la voz necesitan internet igual) */
const CACHE = 'jarvis-v1';
const BASE = ['./', 'index.html', 'jarvis.css', 'jarvis.js', 'icon.svg', 'icon-192.png', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/') || u.pathname.includes('/agente/')) return;
  // primero la red (para tener siempre la última versión), si no hay, lo guardado
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
