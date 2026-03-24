// ============================================================
// functions/index.js
// Deploy with:  firebase deploy --only functions
// ============================================================

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError }                   = require('firebase-functions/v2/https');
const { initializeApp }                        = require('firebase-admin/app');
const { getFirestore, FieldValue }             = require('firebase-admin/firestore');
const { getMessaging }                         = require('firebase-admin/messaging');
const crypto                                   = require('crypto'); // built-in Node module

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
// CALLABLE: Verify Razorpay payment signature server-side
// ============================================================
// ✅ SECURITY FIX: Previously the client stored the Razorpay signature but
// never verified it — any user could forge paymentInfo and mark their order
// as 'paid'. Now the client calls this function after the Razorpay checkout
// completes. We HMAC-verify the signature with our secret key (never exposed
// to the client) before updating paymentStatus to 'paid'.
//
// Setup:
//   firebase functions:secrets:set RAZORPAY_KEY_SECRET
//   (paste your Razorpay Key Secret when prompted)
//
// The client writes the order with paymentStatus:'pending', then calls this.
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

    // Verify the order belongs to the calling user before doing anything
    const orderSnap = await db.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) {
      throw new HttpsError('not-found', 'Order not found.');
    }
    if (orderSnap.data().userId !== req.auth.uid) {
      throw new HttpsError('permission-denied', 'This order does not belong to you.');
    }

    // HMAC-SHA256 verification — Razorpay's documented approach
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const body   = razorpay_order_id + '|' + razorpay_payment_id;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

    if (expected !== razorpay_signature) {
      console.error(`[Razorpay] Signature mismatch for order ${orderId}. Possible fraud.`);
      throw new HttpsError('permission-denied', 'Payment signature verification failed.');
    }

    // Signature is valid — mark the order as paid
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
// Runs server-side so no client can manipulate prices or skip stock deduction.
exports.validateAndProcessOrder = onDocumentCreated(
  'orders/{orderId}',
  async (event) => {
    const order   = event.data.data();
    const orderId = event.params.orderId;

    if (!order || !Array.isArray(order.items) || order.items.length === 0) return;

    // ✅ SECURITY FIX: Reject orders with unreasonable item quantities.
    // A client could write quantity:99999 to drain all stock. We cancel
    // the order before touching stock if any item looks suspicious.
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
    let couponDocId    = null;

    if (order.couponCode) {
      try {
        const couponSnap = await db.collection('coupons')
          .where('code',   '==', order.couponCode)
          .where('active', '==', true)
          .get();

        if (!couponSnap.empty) {
          const couponDoc  = couponSnap.docs[0];
          const coupon     = couponDoc.data();
          couponDocId      = couponDoc.id;

          const expired  = coupon.expiresAt &&
            (coupon.expiresAt.toDate ? coupon.expiresAt.toDate() : new Date(coupon.expiresAt)) < new Date();
          const belowMin = coupon.minOrder && serverSubtotal < coupon.minOrder;

          // ✅ SECURITY FIX: Enforce per-user coupon usage limit.
          // Previously a user could apply the same coupon to every order they placed.
          const usedBy       = Array.isArray(coupon.usedBy) ? coupon.usedBy : [];
          const alreadyUsed  = usedBy.includes(order.userId);

          if (!expired && !belowMin && !alreadyUsed) {
            if (coupon.type === 'percent') {
              serverDiscount = Math.min(
                (serverSubtotal * coupon.value) / 100,
                coupon.maxDiscount != null ? coupon.maxDiscount : Infinity,
              );
            } else {
              serverDiscount = coupon.value || 0;
            }
          } else {
            if (alreadyUsed) console.warn(`[validateOrder] Coupon ${order.couponCode} already used by ${order.userId}`);
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
      serverVerified:       true,
      serverSubtotal:       Math.round(serverSubtotal),
      serverDiscount:       Math.round(serverDiscount),
      serverDeliveryCharge: serverDelivery,
      serverTotal,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (discrepancy > 5) {
      console.warn(
        `[Order ${orderId}] Total tampered: submitted ₹${submittedTotal}, server ₹${serverTotal}. Correcting.`
      );
      orderUpdate.total          = serverTotal;
      orderUpdate.subtotal       = Math.round(serverSubtotal);
      orderUpdate.discount       = Math.round(serverDiscount);
      orderUpdate.deliveryCharge = serverDelivery;
      orderUpdate.totalAdjusted  = true;
      orderUpdate.originalTotal  = submittedTotal;
    }

    await db.collection('orders').doc(orderId).update(orderUpdate);

    // ── 6. Mark coupon as used by this user ──────────────────
    // Do this AFTER we've committed the order update so a crash here
    // doesn't leave a paid order without the coupon discount recorded.
    if (couponDocId && serverDiscount > 0) {
      try {
        await db.collection('coupons').doc(couponDocId).update({
          usedBy: FieldValue.arrayUnion(order.userId),
        });
      } catch (err) {
        console.warn('[validateOrder] Failed to record coupon usage:', err.message);
      }
    }

    // ── 7. Deduct stock via batch write ──────────────────────
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

    if (!before || !after || before.status === after.status) return;

    const newStatus   = after.status;
    const orderId     = event.params.orderId;
    const userId      = after.userId;
    const orderNumber = after.orderNumber || orderId.slice(-6).toUpperCase();
    const prevStatus  = before.status;
    const items       = after.items;
 
    if (Array.isArray(items) && items.length > 0) {
 
      // ── Case 1 & 3: restock on cancel ──────────────────────────────────────
      if (newStatus === 'cancelled' && prevStatus !== 'cancelled') {
        try {
          const batch = db.batch();
          for (const item of items) {
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
          console.log(`[Stock] Restocked for order ${orderId} (${prevStatus} → cancelled)`);
        } catch (err) {
          console.error(`[Stock] Restock failed for order ${orderId}:`, err.message);
        }
      }
 
      // ── Case 2: deduct on cancelled → delivered (admin override) ───────────
      // The order was previously cancelled (stock already restored at that time).
      // Admin is now marking it as delivered, so consume the stock again.
      if (prevStatus === 'cancelled' && newStatus === 'delivered') {
        try {
          const batch = db.batch();
          for (const item of items) {
            const productSnap = await db.collection('products').doc(item.id).get();
            if (productSnap.exists) {
              const currentStock = productSnap.data().stock || 0;
              batch.update(productSnap.ref, {
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