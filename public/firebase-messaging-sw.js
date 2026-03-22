// ============================================================
// public/firebase-messaging-sw.js
// Handles FCM push notifications when tab is CLOSED or INACTIVE
// ============================================================

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// ⚠️  These values are public-safe (they're already in your built JS bundle).
//     Do NOT put secret keys here.
firebase.initializeApp({
  apiKey:            "AIzaSyBhrprKvYPdg0uGhWfyjA01bgB9vMqbGk4",
  authDomain:        "zapkart-98905.firebaseapp.com",
  projectId:         "zapkart-98905",
  storageBucket:     "zapkart-98905.firebasestorage.app",
  messagingSenderId: "194080137119",
  appId:             "1:194080137119:web:471ddeb85bf45c79c0a7aa",
});

const messaging = firebase.messaging();

// ── Background message handler ──────────────────────────────
// Fires when a FCM push arrives and the tab is NOT in the foreground
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);

  const { title, body, image } = payload.notification || {};
  const data = payload.data || {};

  self.registration.showNotification(title || '🛍️ New Order – ZAP Delivery', {
    body:    body    || 'A customer just placed an order!',
    icon:    image   || '/logo192.png',
    badge:             '/badge-72.png',   // small monochrome icon shown in status bar (Android)
    tag:     data.orderId || 'new-order', // replaces previous notification with same tag
    renotify: true,                       // vibrate/sound even when replacing same tag
    vibrate: [200, 100, 200],             // vibration pattern (mobile)
    sound:   '/sounds/order-alert.mp3',   // ⚠️ limited browser support; OS default plays as fallback
    data: {
      url:     data.adminUrl || '/admin/orders',
      orderId: data.orderId  || '',
    },
    actions: [
      { action: 'view',    title: '👀 View Order' },
      { action: 'dismiss', title: '✕ Dismiss'    },
    ],
  });
});

// ── Notification click handler ──────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/admin/orders';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing admin tab if open
      for (const client of windowClients) {
        if (client.url.includes('/admin') && 'focus' in client) {
          client.postMessage({ type: 'NEW_ORDER', orderId: event.notification.data?.orderId });
          return client.focus();
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});