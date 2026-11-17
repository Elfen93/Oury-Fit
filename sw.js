// Service worker: la app funciona sin conexión (los datos se sincronizan al volver).
// Sube CACHE cuando cambies archivos para forzar la actualización.
const CACHE = "ouryfit-v5.2.0";
const ARCHIVOS = [
  "./", "index.html", "manifest.webmanifest", "icon.svg", "css/app.css",
  "vendor/preact.js", "vendor/hooks.js", "vendor/htm.js",
  "js/app.js", "js/lib.js", "js/neon.js", "js/data.js", "js/calc.js", "js/store.js", "js/ui.js", "js/icons.js", "js/entrenador.js",
  "js/views/login.js", "js/views/setup.js", "js/views/hoy.js", "js/views/gym.js",
  "js/views/comer.js", "js/views/progreso.js", "js/views/ajustes.js", "js/views/rutinas.js", "js/views/coach.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Red primero para los archivos propios (siempre la última versión si hay conexión),
// caché como respaldo. Neon (sesión y datos) nunca pasa por la caché.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.includes("/neon-auth")) return; // la sesión nunca se cachea
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
