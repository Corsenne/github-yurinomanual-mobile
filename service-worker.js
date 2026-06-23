const CACHE_NAME = "manual-pwa-v23";
const CORE_ASSETS = [
  "./",
  "index.html",
  "styles.css?v=20260623-dm021-v1",
  "app.js?v=20260623-dm021-v1",
  "pdf-viewer.html",
  "pdf-viewer.js?v=20260623-dm021-v1",
  "vendor/pdfjs/pdf.min.mjs",
  "vendor/pdfjs/pdf.worker.min.mjs",
  "data/manuals.js?v=20260623-dm021-v1",
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
  if (event.data?.type !== "REFRESH_LATEST") {
    return;
  }
  event.waitUntil(refreshLatest(event.source));
});

function scopedUrl(path) {
  return new URL(path, self.registration.scope).href;
}

function htmlAssetUrls(html) {
  const urls = [];
  for (const match of html.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)) {
    const url = new URL(match[1], self.registration.scope);
    if (url.origin === self.location.origin && url.href.startsWith(self.registration.scope)) {
      urls.push(url.href);
    }
  }
  return urls;
}

function parseManualArchive(source) {
  const prefix = "window.MANUAL_ARCHIVE=";
  const start = source.indexOf(prefix);
  if (start < 0) {
    throw new Error("Manual archive was not found");
  }
  return JSON.parse(source.slice(start + prefix.length).trim().replace(/;$/, ""));
}

async function fetchLatest(url) {
  const response = await fetch(new Request(url, { cache: "no-store" }));
  if (!response.ok) {
    throw new Error(`Failed to download ${url}`);
  }
  return response;
}

async function refreshLatest(client) {
  const cache = await caches.open(CACHE_NAME);
  let done = 0;
  let total = 0;
  try {
    const indexUrl = scopedUrl("index.html");
    const viewerUrl = scopedUrl("pdf-viewer.html");
    const prefetched = new Map();

    const indexResponse = await fetchLatest(indexUrl);
    const indexText = await indexResponse.clone().text();
    prefetched.set(indexUrl, indexResponse);

    const viewerResponse = await fetchLatest(viewerUrl);
    const viewerText = await viewerResponse.clone().text();
    prefetched.set(viewerUrl, viewerResponse);

    const discoveredUrls = [...htmlAssetUrls(indexText), ...htmlAssetUrls(viewerText)];
    const dataUrl = discoveredUrls.find((url) => new URL(url).pathname.endsWith("/data/manuals.js"))
      || scopedUrl("data/manuals.js");
    const dataResponse = await fetchLatest(dataUrl);
    const archive = parseManualArchive(await dataResponse.clone().text());
    prefetched.set(dataUrl, dataResponse);

    const items = [
      ...(archive.pocketManual?.items || []),
      ...(archive.disasterManual?.items || []),
    ];
    const pdfUrls = items.map((item) => item.pdfPath).filter(Boolean).map(scopedUrl);
    const urls = [...new Set([
      indexUrl,
      viewerUrl,
      ...discoveredUrls,
      scopedUrl("vendor/pdfjs/pdf.min.mjs"),
      scopedUrl("vendor/pdfjs/pdf.worker.min.mjs"),
      ...pdfUrls,
    ])];
    total = urls.length;

    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < urls.length) {
        const url = urls[nextIndex];
        nextIndex += 1;
        const response = prefetched.get(url) || await fetchLatest(url);
        await cache.put(new Request(url), response.clone());
        if (url === indexUrl) {
          await cache.put(new Request(self.registration.scope), response.clone());
        }
        done += 1;
        client?.postMessage({ type: "REFRESH_PROGRESS", done, total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, urls.length) }, worker));

    const desiredUrls = new Set([...urls, self.registration.scope]);
    const cachedRequests = await cache.keys();
    await Promise.all(cachedRequests
      .filter((request) => !desiredUrls.has(request.url))
      .map((request) => cache.delete(request)));

    client?.postMessage({ type: "REFRESH_DONE", done, total });
  } catch (error) {
    client?.postMessage({ type: "REFRESH_ERROR", done, total, message: String(error) });
  }
}
