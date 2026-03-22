// ============================================================
// functions/index.js
// Deploy with:  firebase deploy --only functions
// ============================================================

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { initializeApp }     = require('firebase-admin/app');
const { getFirestore }      = require('firebase-admin/firestore');
const { getMessaging }      = require('firebase-admin/messaging');

initializeApp();

const db        = getFirestore();
const messaging = getMessaging();

// ── Shared helper: clean up stale FCM tokens after a multicast send ─────────
const cleanStaleTokens = async (tokenSnap, responses) => {
  const staleIds = [];
  responses.forEach((resp, idx) => {
    if (!resp.success) {
      const code = resp.error?.code;
      if (
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered'
      ) {
        staleIds.push(tokenSnap.docs[idx].id);
      }
      console.warn(`[FCM] Token ${idx} failed:`, code);
    }
  });
  if (staleIds.length > 0) {
    const batch = db.batch();
    staleIds.forEach((id) => batch.delete(db.collection('fcmTokens').doc(id)));
    await batch.commit();
  }
};

// ── Status copy map: what users see on each status change ────────────────────
const STATUS_COPY = {
  confirmed:  { emoji: '✅', title: 'Order Confirmed!',      body: 'Great news! Your order has been confirmed and is being prepared.' },
  processing: { emoji: '⚙️', title: 'Preparing Your Order',  body: 'Your order is being carefully packed right now.' },
  packed:     { emoji: '📦', title: 'Order Packed!',         body: 'Your order is packed and waiting for pickup by our delivery partner.' },
  enroute:    { emoji: '🛵', title: 'Out for Delivery!',     body: 'Your order is on the way! Should reach you very soon.' },
  delivered:  { emoji: '🎉', title: 'Order Delivered!',      body: 'Your order has been delivered. Enjoy! 🙏' },
  cancelled:  { emoji: '❌', title: 'Order Cancelled',       body: 'Your order has been cancelled. Contact us if this was a mistake.' },
};

// ── Trigger 1: Notify ADMIN when a new order is placed ──────────────────────
exports.notifyAdminOnNewOrder = onDocumentCreated(
  'orders/{orderId}',
  async (event) => {
    const order   = event.data.data();
    const orderId = event.params.orderId;

    if (!order) return;

    const storeId      = order.storeId || null;
    const customerName = order.customerName || order.userName || 'A customer';
    const orderNumber  = order.orderNumber  || orderId.slice(-6).toUpperCase();
    const totalAmount  = order.totalAmount  || order.total || 0;

    // ── 1. Fetch admin FCM tokens for this store ────────────
    let tokensQuery = db.collection('fcmTokens').where('role', '==', 'admin');
    if (storeId) {
      tokensQuery = tokensQuery.where('storeId', '==', storeId);
    }

    const tokenSnap = await tokensQuery.get();
    if (tokenSnap.empty) return;

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
        type:     'new_order',
        sound:    'order_alert',
      },
      webpush: {
        notification: {
          icon:     '/logo192.png',
          badge:    '/badge-72.png',
          tag:      `order-${orderId}`,
          renotify: 'true',
          vibrate:  '[200,100,200]',
          // ⚠️ 'sound' in webpush.notification is NOT widely supported.
          //    The OS default notification sound plays on most devices.
          //    For custom sound, the SW handles it client-side.
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
          sound:      'order_alert',
          channelId:  'new_orders',
          priority:   'high',
          visibility: 'public',
        },
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            sound: 'order_alert.caf',
            badge: 1,
          },
        },
      },
      tokens,
    };

    // ── 3. Send & clean up invalid tokens ──────────────────
    try {
      const response = await messaging.sendEachForMulticast(message);
      await cleanStaleTokens(tokenSnap, response.responses);
    } catch (err) {
      console.error('[FCM] notifyAdminOnNewOrder error:', err);
    }
  }
);

// ── Trigger 2: Notify USER when admin updates the order status ───────────────
exports.notifyUserOnStatusChange = onDocumentUpdated(
  'orders/{orderId}',
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    // Only fire when status actually changed
    if (!before || !after || before.status === after.status) return;

    const newStatus = after.status;
    const copy      = STATUS_COPY[newStatus];

    // No notification for 'placed' — user already sees in-app order confirmation
    if (!copy) return;

    const orderId     = event.params.orderId;
    const userId      = after.userId;
    const orderNumber = after.orderNumber || orderId.slice(-6).toUpperCase();

    if (!userId) return;

    // ── 1. Fetch this user's FCM tokens (role = 'user') ─────
    const tokenSnap = await db
      .collection('fcmTokens')
      .where('userId', '==', userId)
      .where('role',   '==', 'user')
      .get();

    if (tokenSnap.empty) return;

    const tokens = tokenSnap.docs.map((d) => d.data().token).filter(Boolean);
    if (tokens.length === 0) return;

    // ── 2. Build FCM message ────────────────────────────────
    const message = {
      notification: {
        title: `${copy.emoji} ${copy.title}`,
        body:  copy.body,
      },
      data: {
        orderId,
        orderNumber,
        status:  newStatus,
        url:     '/orders',
        // ✅ type flag lets the SW & foreground handler distinguish
        //    this from the admin new-order notification
        type:    'order_tracking',
      },
      webpush: {
        notification: {
          icon:     '/logo192.png',
          badge:    '/badge-72.png',
          // ✅ Same tag for every status update on the same order —
          //    replaces the previous notification in the Android panel,
          //    giving a live-updating feel (like Swiggy / Zomato).
          tag:      `order-tracking-${orderId}`,
          renotify: 'true',
          vibrate:  '[200,100,200]',
          actions: JSON.stringify([
            { action: 'track',   title: '📦 Track Order' },
            { action: 'dismiss', title: '✕ Dismiss'      },
          ]),
        },
        fcm_options: {
          link: '/orders',
        },
      },
      android: {
        notification: {
          channelId:  'order_tracking',
          priority:   'high',
          visibility: 'public',
        },
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            badge: 1,
          },
        },
      },
      tokens,
    };

    // ── 3. Send & clean up invalid tokens ──────────────────
    try {
      const response = await messaging.sendEachForMulticast(message);
      await cleanStaleTokens(tokenSnap, response.responses);
    } catch (err) {
      console.error('[FCM] notifyUserOnStatusChange error:', err);
    }
  }
);