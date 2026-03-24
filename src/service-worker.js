/* eslint-disable no-restricted-globals */
// ============================================================
// src/service-worker.js
//
// CRA 5 uses this file as the Workbox InjectManifest template.
// Build injects the precache manifest into `self.__WB_MANIFEST`.
//
// CACHE STRATEGY:
//   • Cache names are versioned (e.g. "firebase-storage-images-v1").
//   • On activate, ONLY caches with unrecognised names are deleted
//     (i.e. old versions from a previous deploy).
//   • This prevents the "delete everything mid-session" crash that
//     the previous blanket-delete approach caused.
//   • To force a full cache bust on next deploy, bump CACHE_VERSION.
// ============================================================

import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

clientsClaim();

// ── Cache versioning ──────────────────────────────────────────────────────────
// Bump this when you need a hard cache bust on next deploy.
// All dynamic cache names below include this suffix.
const CACHE_VERSION = 'v1';

const CACHE_NAMES = {
  firebaseImages: `firebase-storage-images-${CACHE_VERSION}`,
  googleFonts:    `google-fonts-${CACHE_VERSION}`,
  localImages:    `local-images-${CACHE_VERSION}`,
  staticResources:`static-resources-${CACHE_VERSION}`,
};

// ── Safe activate: only remove UNRECOGNISED (old) caches ─────────────────────
// This runs after a SW update. It will delete caches from a previous
// CACHE_VERSION (e.g. "firebase-storage-images-v0") but will NEVER
// touch caches that the current SW still uses, so mid-session pages
// are not broken.
self.addEventListener('activate', (event) => {
  const knownCaches = new Set(Object.values(CACHE_NAMES));

  event.waitUntil(
    caches.keys().then((allCacheNames) => {
      const toDelete = allCacheNames.filter((name) => {
        // Keep anything Workbox owns for precaching
        if (name.startsWith('workbox-precache')) return false;
        // Keep every cache this SW version declared
        if (knownCaches.has(name)) return false;
        // Everything else is a leftover from an old version — safe to delete
        return true;
      });

      if (toDelete.length) {
        console.log('[SW] Removing old caches:', toDelete);
      }

      return Promise.all(toDelete.map((name) => caches.delete(name)));
    })
  );
});

// ── Precache all build assets injected by CRA/Workbox ────────────────────────
precacheAndRoute(self.__WB_MANIFEST);

// ── App Shell fallback (SPA navigation) ──────────────────────────────────────
const fileExtensionRegexp = new RegExp('/[^/?]+\\.[^/]+$');
registerRoute(({ request, url }) => {
  if (request.mode !== 'navigate') return false;
  if (url.pathname.startsWith('/_')) return false;
  if (url.pathname.match(fileExtensionRegexp)) return false;
  return true;
}, createHandlerBoundToURL(process.env.PUBLIC_URL + '/index.html'));

// ── Firebase Storage images — by extension ───────────────────────────────────
registerRoute(
  ({ url }) =>
    url.origin === 'https://firebasestorage.googleapis.com' &&
    /\.(png|jpg|jpeg|svg|gif|webp|avif|ico)(\?|$)/i.test(url.pathname + url.search),
  new CacheFirst({
    cacheName: CACHE_NAMES.firebaseImages,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 150,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// ── Firebase Storage images — ?alt=media style URLs ──────────────────────────
registerRoute(
  ({ url }) =>
    url.origin === 'https://firebasestorage.googleapis.com' &&
    url.pathname.startsWith('/v0/b/') &&
    url.searchParams.get('alt') === 'media',
  new CacheFirst({
    cacheName: CACHE_NAMES.firebaseImages,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 150,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// ── Google Fonts ──────────────────────────────────────────────────────────────
registerRoute(
  ({ url }) =>
    url.origin.includes('fonts.gstatic.com') ||
    url.origin.includes('fonts.googleapis.com'),
  new CacheFirst({
    cacheName: CACHE_NAMES.googleFonts,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  })
);

// ── Same-origin image assets ──────────────────────────────────────────────────
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: CACHE_NAMES.localImages,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// ── JS / CSS chunks ───────────────────────────────────────────────────────────
registerRoute(
  ({ request }) =>
    request.destination === 'script' || request.destination === 'style',
  new StaleWhileRevalidate({ cacheName: CACHE_NAMES.staticResources })
);

// ── Skip-waiting: apply updates immediately when page sends SKIP_WAITING ──────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});