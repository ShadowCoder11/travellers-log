// Keeps Traveller's Log working offline.
// Files come from the cache straight away and are refreshed in the background,
// so a new version of the app shows up the next time it's opened.
const SHELL = 'tlog-shell-v2';
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
    // Every page load gets the app's one page
    const key = req.mode === 'navigate' ? INDEX : req;
    e.respondWith(cached(e, SHELL, req, key, true));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cached(e, FONTS, req, req, false));
  } else if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    // The crew code library: versioned files that never change, kept for offline use
    e.respondWith(cached(e, LIBS, req, req, false));
  }
});

// Two copies of a file are the same version when the server tags them the same
const tag = r => r.headers.get('etag') || r.headers.get('last-modified') || '';

async function cached(e, name, req, key, ignoreSearch) {
  const cache = await caches.open(name);
  const hit = await cache.match(key, { ignoreSearch });
  const fresh = fetch(req).then(res => {
    if (res.ok) {
      // The page just shown was an older version: let the app offer a reload
      if (hit && key === INDEX && tag(res) && tag(hit) && tag(res) !== tag(hit)) tellUpdate();
      cache.put(key, res.clone()).catch(() => {});
    }
    return res;
  });
  if (hit) {
    e.waitUntil(fresh.catch(() => {}));
    return hit;
  }
  return fresh;
}

function tellUpdate() {
  self.clients.matchAll({ type: 'window' }).then(list => list.forEach(c => c.postMessage('update-ready'))).catch(() => {});
}
