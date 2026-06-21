const CACHE_NAME = "manual-pwa-v16";
const CORE_ASSETS = [
  "./",
  "index.html",
  "styles.css?v=20260621-page-nav-v1",
  "app.js?v=20260621-page-nav-v1",
  "pdf-viewer.html",
  "pdf-viewer.js?v=20260621-page-nav-v1",
  "vendor/pdfjs/pdf.min.mjs",
  "vendor/pdfjs/pdf.worker.min.mjs",
  "vendor/pdfjs/wasm/jbig2.wasm",
  "vendor/pdfjs/wasm/openjpeg.wasm",
  "vendor/pdfjs/wasm/openjpeg_nowasm_fallback.js",
  "vendor/pdfjs/wasm/qcms_bg.wasm",
  "data/manuals.js?v=20260621-light-v1",
  "manifest.webmanifest",
  "assets/yurino-logo-clean.webp",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_ALL" || !Array.isArray(event.data.urls)) {
    return;
  }

  const urls = event.data.urls;
  event.waitUntil(cacheUrls(urls, event.source));
});

async function cacheUrls(urls, client) {
  const cache = await caches.open(CACHE_NAME);
  let done = 0;
  try {
    for (const url of urls) {
      const request = new Request(url, { cache: "reload" });
      const cached = await cache.match(request);
      if (!cached) {
        const response = await fetch(request);
        if (!response.ok) {
          throw new Error(`Failed to cache ${url}`);
        }
        await cache.put(request, response);
      }
      done += 1;
      client?.postMessage({ type: "CACHE_PROGRESS", done, total: urls.length });
    }
    client?.postMessage({ type: "CACHE_DONE", done, total: urls.length });
  } catch (error) {
    client?.postMessage({ type: "CACHE_ERROR", done, total: urls.length, message: String(error) });
  }
}
