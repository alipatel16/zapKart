// ============================================================
// functions/index.js
// Deploy with:  firebase deploy --only functions
// ============================================================

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { initializeApp }  = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging }   = require('firebase-admin/messaging');

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

// ============================================================
// TRIGGER 1: Validate order total & deduct stock on new order
// ============================================================
// Runs server-side so no client can manipulate prices or skip stock deduction.
// - Re-fetches every product price from Firestore
// - Re-validates the coupon if one was applied
// - Recalculates subtotal, discount, delivery, and total
// - If the submitted total is > ₹5 lower than the server total, corrects it
//   and flags the order with totalAdjusted: true so admin can review
// - Deducts stock for each ordered item atomically via batch write
exports.validateAndProcessOrder = onDocumentCreated(
  'orders/{orderId}',
  async (event) => {
    const order   = event.data.data();
    const orderId = event.params.orderId;

    if (!order || !Array.isArray(order.items) || order.items.length === 0) return;

    // ── 1. Fetch settings for delivery thresholds ───────────
    // Falls back to sensible defaults if the settings doc doesn't exist.
    let DELIVERY_CHARGE     = 10;
    let FREE_DELIVERY_ABOVE = 299;
    try {
      const settingsSnap = await db.collection('settings').doc('app').get();
      if (settingsSnap.exists) {
        const s = settingsSnap.data();
        if (s.deliveryCharge     != null) DELIVERY_CHARGE     = Number(s.deliveryCharge);
        if (s.freeDeliveryAbove  != null) FREE_DELIVERY_ABOVE = Number(s.freeDeliveryAbove);
      }
    } catch (err) {
      console.warn('[validateOrder] Could not fetch settings, using defaults:', err.message);
    }

    // ── 2. Fetch product prices & build stock update list ───
    let serverSubtotal = 0;
    const stockItems   = []; // { ref, currentStock, deductQty }

    for (const item of order.items) {
      try {
        const productSnap = await db.collection('products').doc(item.id).get();
        if (!productSnap.exists) {
          console.warn(`[validateOrder] Product ${item.id} not found — skipping`);
          continue;
        }
        const product = productSnap.data();
        const price   = product.discountedPrice || product.mrp || 0;
        serverSubtotal += price * item.quantity;
        stockItems.push({
          ref:          productSnap.ref,
          currentStock: product.stock || 0,
          deductQty:    item.quantity,
        });
      } catch (err) {
        console.warn(`[validateOrder] Error fetching product ${item.id}:`, err.message);
      }
    }

    // ── 3. Validate coupon server-side ───────────────────────
    let serverDiscount = 0;
    if (order.couponCode) {
      try {
        const couponSnap = await db.collection('coupons')
          .where('code',   '==', order.couponCode)
          .where('active', '==', true)
          .get();

        if (!couponSnap.empty) {
          const coupon = couponSnap.docs[0].data();

          // Check expiry
          const expired = coupon.expiresAt &&
            (coupon.expiresAt.toDate ? coupon.expiresAt.toDate() : new Date(coupon.expiresAt)) < new Date();

          // Check minimum order
          const belowMin = coupon.minOrder && serverSubtotal < coupon.minOrder;

          if (!expired && !belowMin) {
            if (coupon.type === 'percent') {
              serverDiscount = Math.min(
                (serverSubtotal * coupon.value) / 100,
                coupon.maxDiscount != null ? coupon.maxDiscount : Infinity
              );
            } else {
              serverDiscount = coupon.value || 0;
            }
          }
        }
      } catch (err) {
        console.warn('[validateOrder] Coupon validation error:', err.message);
      }
    }

    // ── 4. Recalculate totals ────────────────────────────────
    const serverDelivery = serverSubtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_CHARGE;
    const serverTotal    = Math.round(serverSubtotal - serverDiscount + serverDelivery);
    const submittedTotal = Number(order.total) || 0;
    const discrepancy    = serverTotal - submittedTotal;

    // ── 5. Build order update ────────────────────────────────
    const orderUpdate = {
      serverVerified:      true,
      serverSubtotal:      Math.round(serverSubtotal),
      serverDiscount:      Math.round(serverDiscount),
      serverDeliveryCharge: serverDelivery,
      serverTotal,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // If the client submitted a suspiciously low total (> ₹5 difference),
    // override with the server-calculated values and flag for admin review.
    if (discrepancy > 5) {
      console.warn(
        `[Order ${orderId}] Total tampered: submitted ₹${submittedTotal}, server ₹${serverTotal}. Correcting.`
      );
      orderUpdate.total         = serverTotal;
      orderUpdate.subtotal      = Math.round(serverSubtotal);
      orderUpdate.discount      = Math.round(serverDiscount);
      orderUpdate.deliveryCharge = serverDelivery;
      orderUpdate.totalAdjusted  = true;
      orderUpdate.originalTotal  = submittedTotal;
    }

    await db.collection('orders').doc(orderId).update(orderUpdate);

    // ── 6. Deduct stock via batch write ──────────────────────
    if (stockItems.length > 0) {
      const batch = db.batch();
      for (const { ref, currentStock, deductQty } of stockItems) {
        batch.update(ref, {
          stock:     Math.max(0, currentStock - deductQty),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }
  }
);

// ============================================================
// TRIGGER 2: Notify ADMIN when a new order is placed
// ============================================================
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

    // Fetch admin FCM tokens for this store
    let tokensQuery = db.collection('fcmTokens').where('role', '==', 'admin');
    if (storeId) tokensQuery = tokensQuery.where('storeId', '==', storeId);

    const tokenSnap = await tokensQuery.get();
    if (tokenSnap.empty) return;

    const tokens = tokenSnap.docs.map((d) => d.data().token).filter(Boolean);
    if (tokens.length === 0) return;

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
          actions: JSON.stringify([
            { action: 'view',    title: '👀 View Order' },
            { action: 'dismiss', title: '✕ Dismiss'    },
          ]),
        },
        fcm_options: { link: '/admin/orders' },
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
        payload: { aps: { sound: 'order_alert.caf', badge: 1 } },
      },
      tokens,
    };

    try {
      const response = await messaging.sendEachForMulticast(message);
      await cleanStaleTokens(tokenSnap, response.responses);
    } catch (err) {
      console.error('[FCM] notifyAdminOnNewOrder error:', err);
    }
  }
);

// ============================================================
// TRIGGER 3: Notify USER on status change + restore stock on cancel
// ============================================================
exports.notifyUserOnStatusChange = onDocumentUpdated(
  'orders/{orderId}',
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    // Only fire when status actually changed
    if (!before || !after || before.status === after.status) return;

    const newStatus   = after.status;
    const orderId     = event.params.orderId;
    const userId      = after.userId;
    const orderNumber = after.orderNumber || orderId.slice(-6).toUpperCase();

    // ── Restore stock when an order is cancelled ─────────────────────────────
    // This covers both user-initiated cancels (via OrderHistory.jsx) and
    // admin-initiated cancels (via AdminOrders.jsx). Client-side stock
    // restoration has been removed from both; this Function is the single
    // source of truth for stock restoration.
    if (newStatus === 'cancelled' && Array.isArray(after.items) && after.items.length > 0) {
      try {
        const batch = db.batch();
        for (const item of after.items) {
          const productSnap = await db.collection('products').doc(item.id).get();
          if (productSnap.exists) {
            const currentStock = productSnap.data().stock || 0;
            batch.update(productSnap.ref, {
              stock:     currentStock + item.quantity,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }
        await batch.commit();
        console.log(`[Stock] Restored for cancelled order ${orderId}`);
      } catch (err) {
        console.error(`[Stock] Restore failed for order ${orderId}:`, err.message);
      }
    }

    // ── Send FCM notification to user ────────────────────────────────────────
    const copy = STATUS_COPY[newStatus];
    if (!copy || !userId) return;

    const tokenSnap = await db
      .collection('fcmTokens')
      .where('userId', '==', userId)
      .where('role',   '==', 'user')
      .get();

    if (tokenSnap.empty) return;

    const tokens = tokenSnap.docs.map((d) => d.data().token).filter(Boolean);
    if (tokens.length === 0) return;

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
        type:    'order_tracking',
      },
      webpush: {
        notification: {
          icon:     '/logo192.png',
          badge:    '/badge-72.png',
          // ✅ Same tag for every update on the same order —
          //    replaces the previous notification in the Android panel
          //    (Swiggy / Zomato style live-updating delivery card).
          tag:      `order-tracking-${orderId}`,
          renotify: 'true',
          vibrate:  '[200,100,200]',
          actions: JSON.stringify([
            { action: 'track',   title: '📦 Track Order' },
            { action: 'dismiss', title: '✕ Dismiss'      },
          ]),
        },
        fcm_options: { link: '/orders' },
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
        payload: { aps: { badge: 1 } },
      },
      tokens,
    };

    try {
      const response = await messaging.sendEachForMulticast(message);
      await cleanStaleTokens(tokenSnap, response.responses);
    } catch (err) {
      console.error('[FCM] notifyUserOnStatusChange error:', err);
    }
  }
);