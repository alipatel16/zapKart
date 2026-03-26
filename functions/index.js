// ============================================================
// functions/index.js
// Deploy with:  firebase deploy --only functions
//
// Stock operations now target the `storeInventory` collection
// (docs keyed as `{storeId}__{productId}`) instead of `products`.
// Products collection is now a global catalog with no stock/pricing.
// ============================================================

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError }                   = require('firebase-functions/v2/https');
const { onSchedule }                           = require('firebase-functions/v2/scheduler');
const { initializeApp }                        = require('firebase-admin/app');
const { getFirestore, FieldValue }             = require('firebase-admin/firestore');
const { getMessaging }                         = require('firebase-admin/messaging');
const crypto                                   = require('crypto');

initializeApp();

const db        = getFirestore();
const messaging = getMessaging();

// ── Helper: storeInventory doc ID ────────────────────────────────────────────
const siDocId = (storeId, productId) => `${storeId}__${productId}`;

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
// CALLABLE: Verify Razorpay payment signature server-side
// ============================================================
exports.verifyRazorpayPayment = onCall(
  { secrets: ['RAZORPAY_KEY_SECRET'] },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'You must be logged in to verify a payment.');
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.data;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
      throw new HttpsError('invalid-argument', 'Missing required payment fields.');
    }

    const orderSnap = await db.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) {
      throw new HttpsError('not-found', 'Order not found.');
    }
    if (orderSnap.data().userId !== req.auth.uid) {
      throw new HttpsError('permission-denied', 'This order does not belong to you.');
    }

    const secret   = process.env.RAZORPAY_KEY_SECRET;
    const body     = razorpay_order_id + '|' + razorpay_payment_id;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

    if (expected !== razorpay_signature) {
      console.error(`[Razorpay] Signature mismatch for order ${orderId}. Possible fraud.`);
      throw new HttpsError('permission-denied', 'Payment signature verification failed.');
    }

    await db.collection('orders').doc(orderId).update({
      paymentStatus: 'paid',
      paymentInfo: {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(`[Razorpay] Payment verified for order ${orderId}`);
    return { success: true };
  }
);

// ============================================================
// TRIGGER 1: Validate order total & deduct stock on new order
// ============================================================
// Stock is now deducted from storeInventory (not products).
// Each order has a storeId; items have productId (global).
// storeInventory doc ID = `{storeId}__{productId}`
exports.validateAndProcessOrder = onDocumentCreated(
  'orders/{orderId}',
  async (event) => {
    const order   = event.data.data();
    const orderId = event.params.orderId;

    if (!order || !Array.isArray(order.items) || order.items.length === 0) return;

    const storeId = order.storeId;
    if (!storeId) {
      console.warn(`[validateOrder] Order ${orderId} has no storeId. Skipping.`);
      return;
    }

    // Validate item quantities
    for (const item of order.items) {
      if (!item.id || typeof item.quantity !== 'number' || item.quantity < 1 || item.quantity > 100) {
        console.warn(`[validateOrder] Order ${orderId} has invalid quantity for item ${item.id}. Cancelling.`);
        await db.collection('orders').doc(orderId).update({
          status:       'cancelled',
          cancelReason: 'Invalid item quantity detected.',
          updatedAt:    FieldValue.serverTimestamp(),
        });
        return;
      }
    }

    // COD abuse prevention
    if (order.paymentMethod === 'cod') {
      try {
        const activeCodSnap = await db.collection('orders')
          .where('userId',        '==', order.userId)
          .where('paymentMethod', '==', 'cod')
          .where('paymentStatus', '==', 'pending')
          .get();

        const activeCount = activeCodSnap.docs.filter((d) => {
          const s = d.data().status;
          return s !== 'cancelled' && s !== 'delivered';
        }).length - 1;

        if (activeCount >= 2) {
          console.warn(
            `[COD Limit] User ${order.userId} has ${activeCount} active COD orders. Cancelling ${orderId}.`,
          );
          await db.collection('orders').doc(orderId).update({
            status:       'cancelled',
            cancelReason: 'Maximum 2 unpaid COD orders allowed at a time.',
            updatedAt:    FieldValue.serverTimestamp(),
          });
          return;
        }
      } catch (err) {
        console.warn('[COD Limit] Could not check active COD orders:', err.message);
      }
    }

    // ── 1. Fetch settings for delivery thresholds ───────────
    let DELIVERY_CHARGE     = 10;
    let FREE_DELIVERY_ABOVE = 299;
    try {
      const settingsSnap = await db.collection('settings').doc('app').get();
      if (settingsSnap.exists) {
        const s = settingsSnap.data();
        if (s.deliveryCharge    != null) DELIVERY_CHARGE     = Number(s.deliveryCharge);
        if (s.freeDeliveryAbove != null) FREE_DELIVERY_ABOVE = Number(s.freeDeliveryAbove);
      }
    } catch (err) {
      console.warn('[validateOrder] Could not fetch settings, using defaults:', err.message);
    }

    // ── 2. Fetch storeInventory prices & build stock update list ───
    let serverSubtotal = 0;
    const stockItems   = []; // { ref, currentStock, deductQty }

    for (const item of order.items) {
      try {
        const siRef = db.collection('storeInventory').doc(siDocId(storeId, item.id));
        const siSnap = await siRef.get();

        if (!siSnap.exists) {
          console.warn(`[validateOrder] storeInventory not found for store=${storeId} product=${item.id} — skipping`);
          continue;
        }
        const siData = siSnap.data();
        const price  = siData.sellRate || siData.mrp || 0;
        serverSubtotal += price * item.quantity;
        stockItems.push({
          ref:          siRef,
          currentStock: siData.stock || 0,
          deductQty:    item.quantity,
        });
      } catch (err) {
        console.warn(`[validateOrder] Error fetching storeInventory for ${item.id}:`, err.message);
      }
    }

    // ── 3. Validate coupon server-side ───────────────────────
    let serverDiscount = 0;
    let couponDocId    = null;

    if (order.couponCode) {
      try {
        const couponSnap = await db.collection('coupons')
          .where('code',   '==', order.couponCode)
          .where('active', '==', true)
          .get();

        if (!couponSnap.empty) {
          const couponDoc = couponSnap.docs[0];
          const coupon    = couponDoc.data();
          couponDocId     = couponDoc.id;

          const expired  = coupon.expiresAt &&
            (coupon.expiresAt.toDate ? coupon.expiresAt.toDate() : new Date(coupon.expiresAt)) < new Date();
          const belowMin = coupon.minOrder && serverSubtotal < coupon.minOrder;

          const usedBy      = Array.isArray(coupon.usedBy) ? coupon.usedBy : [];
          const alreadyUsed = usedBy.includes(order.userId);
          const maxUses     = coupon.maxUsesPerUser || 1;
          const userUseCount = usedBy.filter((u) => u === order.userId).length;

          if (!expired && !belowMin && !alreadyUsed && userUseCount < maxUses) {
            if (coupon.type === 'percent') {
              serverDiscount = Math.min(
                (serverSubtotal * coupon.value) / 100,
                coupon.maxDiscount || Infinity,
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

    // ── 4. Calculate server-side total ───────────────────────
    const afterDiscount  = serverSubtotal - serverDiscount;
    const serverDelivery = afterDiscount >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_CHARGE;
    const serverTotal    = Math.max(0, afterDiscount + serverDelivery);

    // ── 5. Compare with client total ─────────────────────────
    const clientTotal = order.total || order.totalAmount || 0;
    const diff        = Math.abs(serverTotal - clientTotal);

    if (diff > 5) {
      console.warn(
        `[validateOrder] Price mismatch for order ${orderId}: client=${clientTotal}, server=${serverTotal} (diff=${diff.toFixed(2)})`,
      );
    }

    // ── 6. Update order with server-computed values ──────────
    await db.collection('orders').doc(orderId).update({
      serverSubtotal,
      serverDiscount,
      serverDelivery,
      serverTotal,
      priceMismatch: diff > 5,
    });

    // ── 7. Mark coupon as used ───────────────────────────────
    if (couponDocId && serverDiscount > 0) {
      try {
        await db.collection('coupons').doc(couponDocId).update({
          usedBy: FieldValue.arrayUnion(order.userId),
        });
      } catch (err) {
        console.warn('[validateOrder] Failed to record coupon usage:', err.message);
      }
    }

    // ── 8. Deduct stock from storeInventory via batch write ──
    if (stockItems.length > 0) {
      const batch = db.batch();
      for (const { ref, currentStock, deductQty } of stockItems) {
        batch.update(ref, {
          stock:     Math.max(0, currentStock - deductQty),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
      console.log(`[Stock] Deducted stock for order ${orderId} from storeInventory`);
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
// TRIGGER 3: Notify USER on status change + manage stock on
//            cancel / delivered ↔ cancelled overrides
// ============================================================
// Stock operations now target storeInventory collection.
exports.notifyUserOnStatusChange = onDocumentUpdated(
  'orders/{orderId}',
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    if (!before || !after || before.status === after.status) return;

    const newStatus   = after.status;
    const orderId     = event.params.orderId;
    const userId      = after.userId;
    const orderNumber = after.orderNumber || orderId.slice(-6).toUpperCase();
    const prevStatus  = before.status;
    const items       = after.items;
    const storeId     = after.storeId;

    if (Array.isArray(items) && items.length > 0 && storeId) {

      // ── Case 1: restock on cancel (from any non-cancelled status) ──────
      if (newStatus === 'cancelled' && prevStatus !== 'cancelled') {
        try {
          const batch = db.batch();
          for (const item of items) {
            const siRef  = db.collection('storeInventory').doc(siDocId(storeId, item.id));
            const siSnap = await siRef.get();
            if (siSnap.exists) {
              const currentStock = siSnap.data().stock || 0;
              batch.update(siRef, {
                stock:     currentStock + item.quantity,
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
          }
          await batch.commit();
          console.log(`[Stock] Restocked for order ${orderId} (${prevStatus} → cancelled)`);
        } catch (err) {
          console.error(`[Stock] Restock failed for order ${orderId}:`, err.message);
        }
      }

      // ── Case 2: deduct on cancelled → delivered (admin override) ──────
      if (prevStatus === 'cancelled' && newStatus === 'delivered') {
        try {
          const batch = db.batch();
          for (const item of items) {
            const siRef  = db.collection('storeInventory').doc(siDocId(storeId, item.id));
            const siSnap = await siRef.get();
            if (siSnap.exists) {
              const currentStock = siSnap.data().stock || 0;
              batch.update(siRef, {
                stock:     Math.max(0, currentStock - item.quantity),
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
          }
          await batch.commit();
          console.log(`[Stock] Deducted for order ${orderId} (cancelled → delivered override)`);
        } catch (err) {
          console.error(`[Stock] Deduct failed for order ${orderId}:`, err.message);
        }
      }

      // ── Case 3: deduct on any-non-delivered → delivered ────────────────
      // Normal flow: order moves through placed → confirmed → ... → delivered
      // Stock was already deducted on order creation (TRIGGER 1).
      // Only deduct again if coming FROM cancelled (handled in Case 2 above).
      // No additional stock logic needed for normal delivery flow.

      // ── Case 4: delivered → cancelled (admin override) ────────────────
      // Stock was deducted when order was first created AND not restored
      // (because it went through the normal flow to delivered).
      // Now admin is cancelling a delivered order — restore stock.
      if (prevStatus === 'delivered' && newStatus === 'cancelled') {
        try {
          const batch = db.batch();
          for (const item of items) {
            const siRef  = db.collection('storeInventory').doc(siDocId(storeId, item.id));
            const siSnap = await siRef.get();
            if (siSnap.exists) {
              const currentStock = siSnap.data().stock || 0;
              batch.update(siRef, {
                stock:     currentStock + item.quantity,
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
          }
          await batch.commit();
          console.log(`[Stock] Restocked for order ${orderId} (delivered → cancelled override)`);
        } catch (err) {
          console.error(`[Stock] Restock failed for order ${orderId}:`, err.message);
        }
      }
    }

    // ── Send FCM notification to user ────────────────────────────────────
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

// ============================================================
// SCHEDULED: Clean up FCM tokens older than 60 days
// ============================================================
exports.cleanStaleFcmTokens = onSchedule(
  { schedule: 'every 24 hours', timeZone: 'Asia/Kolkata' },
  async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);

    const snap = await db.collection('fcmTokens')
      .where('updatedAt', '<', cutoff)
      .get();

    if (snap.empty) {
      console.log('[FCM Cleanup] No stale tokens found.');
      return;
    }

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`[FCM Cleanup] Deleted ${snap.size} stale tokens.`);
  }
);