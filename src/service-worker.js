/* eslint-disable no-restricted-globals */
// ============================================================
// src/service-worker.js
//
// CRA 5 uses this file as the Workbox InjectManifest template.
// Build injects the precache manifest into `self.__WB_MANIFEST`.
//
// CHANGES vs default CRA service worker:
//   • Added CacheFirst route for Firebase Storage images
//     (firebasestorage.googleapis.com) — these are cross-origin
//     so the default SW ignores them. Desktop Chrome enforces
//     CORS strictly; this route opts-in explicitly.
//   • Added CacheFirst route for other common CDN image hosts.
//   • All image caches are limited to 150 entries / 30 days.
// ============================================================

import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst, NetworkFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

clientsClaim();

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

// ── Firebase Storage images (cross-origin) ───────────────────────────────────
// Desktop Chrome enforces CORS opaque responses strictly and will NOT cache
// images from a different origin unless the SW explicitly opts in.
// Firebase Storage sets `Access-Control-Allow-Origin: *`, so we can use
// CacheFirst with `CacheableResponsePlugin({ statuses: [0, 200] })`.
// status 0 = opaque response (fallback for non-CORS edge cases)
registerRoute(
  ({ url }) =>
    url.origin === 'https://firebasestorage.googleapis.com' &&
    /\.(png|jpg|jpeg|svg|gif|webp|avif|ico)(\?|$)/i.test(url.pathname + url.search),
  new CacheFirst({
    cacheName: 'firebase-storage-images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 150,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// Also catch Firebase Storage URLs that don't have an extension
// (Firebase Storage uses /v0/b/.../o/filename?alt=media style URLs)
registerRoute(
  ({ url }) =>
    url.origin === 'https://firebasestorage.googleapis.com' &&
    url.pathname.startsWith('/v0/b/') &&
    url.searchParams.get('alt') === 'media',
  new CacheFirst({
    cacheName: 'firebase-storage-images',
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

// ── Google Fonts & other CDN images ──────────────────────────────────────────
registerRoute(
  ({ url }) =>
    url.origin.includes('fonts.gstatic.com') ||
    url.origin.includes('fonts.googleapis.com'),
  new CacheFirst({
    cacheName: 'google-fonts',
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
    cacheName: 'local-images',
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

// ── JS / CSS chunks (StaleWhileRevalidate) ────────────────────────────────────
registerRoute(
  ({ request }) =>
    request.destination === 'script' || request.destination === 'style',
  new StaleWhileRevalidate({ cacheName: 'static-resources' })
);

// ── Skip-waiting: apply updates immediately when the page sends SKIP_WAITING ──
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});