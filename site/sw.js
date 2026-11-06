// Service worker minim: face site-ul instalabil ca aplicație pe telefon.
// Nu păstrează nimic în cache, așa că totul vine mereu proaspăt de pe server.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(function () {
    return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CoachMeal</title>' +
      '<body style="font-family:system-ui,sans-serif;background:#f6f5f2;color:#141414;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center">' +
      '<div><p style="font-weight:700;font-size:1.2rem;margin:0 0 8px">Nu ai internet</p><p style="margin:0 0 16px;color:#5e5b55">CoachMeal are nevoie de internet ca să-ți arate planul.</p>' +
      '<button onclick="location.reload()" style="font:inherit;background:#141414;color:#fff;border:0;border-radius:10px;padding:10px 18px">Încearcă din nou</button></div>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }));
});
