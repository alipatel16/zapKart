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

// ── Background message handler ──────────────────────────────────────────────
// Fires when a FCM push arrives and the tab is NOT in the foreground.
// We branch on data.type to show the right notification for:
//   • 'order_tracking' → user delivery status update
//   • anything else    → admin new-order alert (existing behaviour)
messaging.onBackgroundMessage((payload) => {
  const { title, body, image } = payload.notification || {};
  const data = payload.data || {};

  // ── User: order tracking / delivery status update ─────────────────────────
  // Uses tag: order-tracking-{orderId} so each new status update REPLACES
  // the previous notification in the Android notification panel — just like
  // Swiggy / Zomato showing a single live-updating delivery card.
  if (data.type === 'order_tracking') {
    self.registration.showNotification(title || '📦 Order Update', {
      body:     body || 'Your order status has been updated.',
      icon:     '/logo192.png',
      badge:    '/badge-72.png',
      tag:      `order-tracking-${data.orderId}`,
      renotify: true,
      vibrate:  [200, 100, 200],
      data: {
        url:     '/orders',
        orderId: data.orderId || '',
        type:    'order_tracking',
      },
      actions: [
        { action: 'track',   title: '📦 Track Order' },
        { action: 'dismiss', title: '✕ Dismiss'      },
      ],
    });
    return;
  }

  // ── Admin: new order alert ────────────────────────────────────────────────
  // Note: 'sound' property is intentionally omitted — it caused Android to
  // show a media-player notification for the MP3. OS default sound plays fine.
  self.registration.showNotification(title || '🛍️ New Order – ZAP Delivery', {
    body:     body    || 'A customer just placed an order!',
    icon:     image   || '/logo192.png',
    badge:              '/badge-72.png',
    tag:      data.orderId || 'new-order',
    renotify: true,
    vibrate:  [200, 100, 200],
    data: {
      url:     data.adminUrl || '/admin/orders',
      orderId: data.orderId  || '',
      type:    'new_order',
    },
    actions: [
      { action: 'view',    title: '👀 View Order' },
      { action: 'dismiss', title: '✕ Dismiss'    },
    ],
  });
});

// ── Notification click handler ──────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {

      // ── User tracking: focus any existing tab ─────────────
      if (notifData.type === 'order_tracking') {
        for (const client of windowClients) {
          if ('focus' in client) {
            client.postMessage({ type: 'ORDER_STATUS_CHANGED', orderId: notifData.orderId });
            client.navigate('/orders');
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow('/orders');
        return;
      }

      // ── Admin new-order: focus existing admin tab ─────────
      for (const client of windowClients) {
        if (client.url.includes('/admin') && 'focus' in client) {
          client.postMessage({ type: 'NEW_ORDER', orderId: notifData.orderId });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});