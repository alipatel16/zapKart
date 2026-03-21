// public/firebase-messaging-sw.js
// This file MUST live in /public so it's served from the root origin.

importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// ─── IMPORTANT: replace these values with your actual Firebase config ───────
// These cannot use process.env — service workers don't have access to env vars.
// Copy the values from your .env file.
firebase.initializeApp({
  apiKey:            "AIzaSyBhrprKvYPdg0uGhWfyjA01bgB9vMqbGk4",
  authDomain:        "zapkart-98905.firebaseapp.com",
  projectId:         "zapkart-98905",
  storageBucket:     "zapkart-98905.firebasestorage.app",
  messagingSenderId: "194080137119",
  appId:             "1:194080137119:web:471ddeb85bf45c79c0a7aa",
});
// ────────────────────────────────────────────────────────────────────────────

const messaging = firebase.messaging();

// Handle background messages (when app tab is not in focus)
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  const data = payload.data || {};

  self.registration.showNotification(title || 'ZAP Delivery', {
    body: body || '',
    icon: '/logo192.png',
    badge: '/logo192.png',
    tag: data.orderId || 'zap-notification',    // deduplicates per order
    renotify: true,
    data: { link: data.link || '/' },
    vibrate: [200, 100, 200],
    actions: data.type === 'new_order'
      ? [{ action: 'view', title: 'View Order' }]
      : [{ action: 'track', title: 'Track Order' }],
  });
});

// Handle notification click — open the linked page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing tab if already open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(link);
          return;
        }
      }
      // Otherwise open new tab
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});