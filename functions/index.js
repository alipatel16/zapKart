// ============================================================
// functions/index.js
// Deploy with:  firebase deploy --only functions
// ============================================================

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp }     = require('firebase-admin/app');
const { getFirestore }      = require('firebase-admin/firestore');
const { getMessaging }      = require('firebase-admin/messaging');

initializeApp();

const db        = getFirestore();
const messaging = getMessaging();

// ── Trigger: fires whenever a new document is created in /orders ────────────
exports.notifyAdminOnNewOrder = onDocumentCreated(
  'orders/{orderId}',
  async (event) => {
    const order   = event.data.data();
    const orderId = event.params.orderId;

    if (!order) return;

    const storeId       = order.storeId || null;
    const customerName  = order.customerName  || order.userName || 'A customer';
    const orderNumber   = order.orderNumber   || orderId.slice(-6).toUpperCase();
    const totalAmount   = order.totalAmount   || order.total    || 0;

    // ── 1. Fetch admin FCM tokens for this store ────────────
    let tokensQuery = db.collection('fcmTokens').where('role', '==', 'admin');
    if (storeId) {
      tokensQuery = tokensQuery.where('storeId', '==', storeId);
    }

    const tokenSnap = await tokensQuery.get();
    if (tokenSnap.empty) {
      return;
    }

    const tokens = tokenSnap.docs.map((d) => d.data().token).filter(Boolean);
    if (tokens.length === 0) return;

    // ── 2. Build FCM message ────────────────────────────────
    const message = {
      notification: {
        title: `🛍️ New Order #${orderNumber}`,
        body:  `${customerName} placed an order for ₹${Number(totalAmount).toFixed(2)}`,
      },
      data: {
        orderId,
        orderNumber,
        adminUrl: '/admin/orders',
        // sound key used by some Android/iOS handlers
        sound: 'order_alert',
      },
      webpush: {
        notification: {
          icon:     '/logo192.png',
          badge:    '/badge-72.png',
          tag:      `order-${orderId}`,
          renotify: 'true',
          vibrate:  '[200,100,200]',
          // ⚠️  'sound' in webpush.notification is NOT widely supported.
          //     The OS notification sound plays by default on most devices.
          //     For custom sound, the service worker must handle it client-side.
          actions: JSON.stringify([
            { action: 'view',    title: '👀 View Order' },
            { action: 'dismiss', title: '✕ Dismiss'    },
          ]),
        },
        fcm_options: {
          link: '/admin/orders',
        },
      },
      android: {
        notification: {
          sound:       'order_alert',  // must exist in res/raw/ for native apps
          channelId:   'new_orders',
          priority:    'high',
          visibility:  'public',
        },
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            sound: 'order_alert.caf', // must exist in app bundle for native apps
            badge: 1,
          },
        },
      },
      tokens,  // sendEachForMulticast accepts an array
    };

    // ── 3. Send & clean up invalid tokens ──────────────────
    try {
      const response = await messaging.sendEachForMulticast(message);

      // Remove tokens that are no longer valid
      const staleTokenIds = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const code = resp.error?.code;
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            staleTokenIds.push(tokenSnap.docs[idx].id);
          }
          console.warn(`[FCM] Token ${idx} failed:`, code);
        }
      });

      if (staleTokenIds.length > 0) {
        const batch = db.batch();
        staleTokenIds.forEach((id) => batch.delete(db.collection('fcmTokens').doc(id)));
        await batch.commit();
      }
    } catch (err) {
      console.error('[FCM] sendEachForMulticast error:', err);
    }
  }
);