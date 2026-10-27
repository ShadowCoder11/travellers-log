// Keeps Traveller's Log working offline.
// Files come from the cache straight away and are refreshed in the background.
// The app checks for new versions itself (checkForUpdate in index.html).
const SHELL = 'tlog-shell-v3';
const FONTS = 'tlog-fonts-v1';
const LIBS = 'tlog-libs-v1';
const SCOPE = self.registration.scope;
const INDEX = new URL('./', SCOPE).href;
const FILES = ['./', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(FILES.map(f => new Request(new URL(f, SCOPE).href, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('tlog-') && ![SHELL, FONTS, LIBS].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (!url.href.startsWith(SCOPE)) return;
    // The app's own update check always goes straight to the server
    if (url.searchParams.has('update-check')) return;
    if (req.mode === 'navigate') {
      // Every page load gets the app's one page. The background refresh asks the server
      // directly instead of the browser's own 10-minute copy.
      e.respondWith(cached(e, SHELL, new Request(INDEX, { cache: 'no-cache' }), INDEX, true));
    } else {
      e.respondWith(cached(e, SHELL, req, req, true));
    }
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cached(e, FONTS, req, req, false));
  } else if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    // The crew code library: versioned files that never change, kept for offline use
    e.respondWith(cached(e, LIBS, req, req, false));
  }
});

async function cached(e, name, req, key, ignoreSearch) {
  const cache = await caches.open(name);
  const hit = await cache.match(key, { ignoreSearch });
  const fresh = fetch(req).then(res => {
    if (res.ok) cache.put(key, res.clone()).catch(() => {});
    return res;
  });
  if (hit) {
    e.waitUntil(fresh.catch(() => {}));
    return hit;
  }
  return fresh;
}
