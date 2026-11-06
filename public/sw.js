// Service Worker：一度開いたファイルを端末に残し、電波がなくても（機内モードでも）遊べるようにする。
// 電波があるときは新しいファイルを優先し、ないときだけ残しておいたファイルを使う（アプリの更新がすぐ届くように）。
const CACHE = 'yakyu-game-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        // ページを開くときは、残しておいたトップページを返す
        if (req.mode === 'navigate') return (await caches.match('./index.html')) || (await caches.match('./'));
        return Response.error();
      }),
  );
});
