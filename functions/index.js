// ============================================================
// functions/index.js
// Deploy with:  firebase deploy --only functions
//
// STOCK MODEL (v2 — clean rewrite):
//
//  SOURCE OF STOCK ADDITIONS:
//    Purchase created  → add qty for each item
//    Purchase updated  → apply delta (new qty − old qty) per item
//    Purchase deleted  → deduct entire qty for each item
//
//  SOURCE OF STOCK DEDUCTIONS:
//    Order → delivered → deduct qty for each item
//    delivered → cancelled → add back qty
//    cancelled → delivered → deduct qty
//    * → cancelled (where prev ≠ delivered) → do NOTHING
//    Order creation → does NOT touch stock at all
//
//  All stock ops use FieldValue.increment() — atomic, no race conditions.
// ============================================================

const { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
// const { onCall, HttpsError } = require('firebase-functions/v2/https'); // ← Razorpay: uncomment when ready
const { onSchedule }           = require('firebase-functions/v2/scheduler');
const { initializeApp }        = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging }         = require('firebase-admin/messaging');
// const crypto = require('crypto'); // ← Razorpay: uncomment when ready

initializeApp();

const db        = getFirestore();
const messaging = getMessaging();

// ── Helper: storeInventory doc ID ────────────────────────────────────────────
const siDocId = (storeId, productId) => `${storeId}__${productId}`;

// ── Helper: apply atomic stock increment to a list of items ─────────────────
// delta is a NUMBER — positive = add, negative = deduct.
// Skips items where the storeInventory doc doesn't exist.
// Used for ORDER-based stock changes (delivered / cancelled).
const applyStockDelta = async (storeId, items, getDelta) => {
  if (!storeId || !Array.isArray(items) || items.length === 0) return 0;
  const batch = db.batch();
  let changed = 0;

  for (const item of items) {
    const productId = item.productId || item.id;
    if (!productId) continue;
    const delta = getDelta(item);
    if (delta === 0) continue;

    const ref  = db.collection('storeInventory').doc(siDocId(storeId, productId));
    const snap = await ref.get();
    if (!snap.exists) {
      console.warn(`[Stock] storeInventory not found for store=${storeId} product=${productId} — skipping`);
      continue;
    }

    batch.update(ref, {
      stock:     FieldValue.increment(delta),
      updatedAt: FieldValue.serverTimestamp(),
    });
    changed++;
  }

  if (changed > 0) await batch.commit();
  return changed;
};

// ── Helper: upsert storeInventory for purchase items ─────────────────────────
// Unlike applyStockDelta, this CREATES the storeInventory doc if it doesn't
// exist yet, pulling product info from the global products catalog.
// Used only by purchase triggers (create / update / delete).
//
// Each item in purchaseItems must have:
//   productId, quantity (the delta to apply), mrp, sellRate, costPrice
const upsertStockForPurchase = async (storeId, purchaseItems) => {
  if (!storeId || !Array.isArray(purchaseItems) || purchaseItems.length === 0) return 0;
  let changed = 0;

  for (const item of purchaseItems) {
    const productId = item.productId || item.id;
    if (!productId) continue;
    // _delta is set by the update trigger; quantity is used by create/delete triggers
    const delta = item._delta !== undefined ? item._delta : (item.quantity || 0);
    if (delta === 0) continue;

    try {
      const ref  = db.collection('storeInventory').doc(siDocId(storeId, productId));
      const snap = await ref.get();

      if (snap.exists) {
        // ── Doc already exists: increment atomically + refresh pricing ──────
        const updateData = {
          stock:     FieldValue.increment(delta),
          updatedAt: FieldValue.serverTimestamp(),
        };
        // Only overwrite pricing fields if the purchase actually supplied them
        if (item.mrp)       updateData.mrp       = item.mrp;
        if (item.sellRate)  updateData.sellRate  = item.sellRate;
        if (item.costPrice) updateData.costPrice = item.costPrice;
        await ref.update(updateData);
      } else {
        // ── Doc doesn't exist: fetch from global catalog and create ─────────
        if (delta < 0) {
          // Deleting/decreasing a purchase for a product with no inventory doc
          // — nothing to deduct from, just skip
          console.warn(`[Stock] Cannot deduct from non-existent storeInventory for product=${productId}. Skipping.`);
          continue;
        }
        const productSnap = await db.collection('products').doc(productId).get();
        if (!productSnap.exists) {
          console.warn(`[Stock] Global product not found: ${productId} — cannot create storeInventory doc`);
          continue;
        }
        const product = productSnap.data();
        await ref.set({
          storeId,
          productId,
          // Denormalized from global product catalog
          name:         product.name        || '',
          unit:         product.unit        || '',
          categoryId:   product.categoryId  || '',
          description:  product.description || '',
          images:       product.images      || [],
          isFeatured:   !!product.isFeatured,
          isExclusive:  !!product.isExclusive,
          isNewArrival: !!product.isNewArrival,
          active:       product.active !== false,
          // Store-specific pricing & stock
          stock:        Math.max(0, delta),
          mrp:          item.mrp       || 0,
          sellRate:     item.sellRate  || 0,
          costPrice:    item.costPrice || 0,
          createdAt:    FieldValue.serverTimestamp(),
          updatedAt:    FieldValue.serverTimestamp(),
        });
        console.log(`[Stock] Created new storeInventory doc for store=${storeId} product=${productId} stock=${delta}`);
      }
      changed++;
    } catch (err) {
      console.error(`[Stock] upsertStockForPurchase failed for product=${productId}:`, err.message);
    }
  }

  return changed;
};

// ── Shared helper: clean up stale FCM tokens after a multicast send ──────────
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

// ── Status copy map ──────────────────────────────────────────────────────────
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
// ── DISABLED: uncomment when you register with Razorpay ──
// ============================================================
// exports.verifyRazorpayPayment = onCall(
//   { secrets: ['RAZORPAY_KEY_SECRET'] },
//   async (req) => {
//     if (!req.auth) {
//       throw new HttpsError('unauthenticated', 'You must be logged in to verify a payment.');
//     }
//
//     const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.data;
//
//     if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
//       throw new HttpsError('invalid-argument', 'Missing required payment fields.');
//     }
//
//     const orderSnap = await db.collection('orders').doc(orderId).get();
//     if (!orderSnap.exists) {
//       throw new HttpsError('not-found', 'Order not found.');
//     }
//     if (orderSnap.data().userId !== req.auth.uid) {
//       throw new HttpsError('permission-denied', 'This order does not belong to you.');
//     }
//
//     const secret   = process.env.RAZORPAY_KEY_SECRET;
//     const body     = razorpay_order_id + '|' + razorpay_payment_id;
//     const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
//
//     if (expected !== razorpay_signature) {
//       console.error(`[Razorpay] Signature mismatch for order ${orderId}. Possible fraud.`);
//       throw new HttpsError('permission-denied', 'Payment signature verification failed.');
//     }
//
//     await db.collection('orders').doc(orderId).update({
//       paymentStatus: 'paid',
//       paymentInfo: {
//         razorpay_order_id,
//         razorpay_payment_id,
//         razorpay_signature,
//       },
//       updatedAt: FieldValue.serverTimestamp(),
//     });
//
//     console.log(`[Razorpay] Payment verified for order ${orderId}`);
//     return { success: true };
//   }
// );

// ============================================================
// TRIGGER 1: Validate order total & coupon on new order
//            Stock is NOT touched here anymore.
// ============================================================
exports.validateAndProcessOrder = onDocumentCreated(
  { document: 'orders/{orderId}', region: 'asia-south1' },
  async (event) => {
    const order   = event.data.data();
    const orderId = event.params.orderId;

    if (!order || !Array.isArray(order.items) || order.items.length === 0) return;

    const storeId = order.storeId;
    if (!storeId) {
      console.warn(`[validateOrder] Order ${orderId} has no storeId. Skipping.`);
      return;
    }

    // ── Validate item quantities ─────────────────────────────
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

    // ── COD abuse prevention ─────────────────────────────────
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
        }).length - 1; // subtract 1 because the current order is already in results

        if (activeCount >= 2) {
          console.warn(`[COD Limit] User ${order.userId} has ${activeCount} active COD orders. Cancelling ${orderId}.`);
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

    // ── 1. Fetch settings for delivery thresholds ────────────
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

    // ── 2. Fetch storeInventory prices ───────────────────────
    let serverSubtotal = 0;

    for (const item of order.items) {
      try {
        const siSnap = await db.collection('storeInventory').doc(siDocId(storeId, item.id)).get();
        if (!siSnap.exists) {
          console.warn(`[validateOrder] storeInventory not found for store=${storeId} product=${item.id} — skipping`);
          continue;
        }
        const siData = siSnap.data();
        const price  = siData.sellRate || siData.mrp || 0;
        serverSubtotal += price * item.quantity;
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
          const couponDoc  = couponSnap.docs[0];
          const coupon     = couponDoc.data();
          couponDocId      = couponDoc.id;

          const expired  = coupon.expiresAt &&
            (coupon.expiresAt.toDate ? coupon.expiresAt.toDate() : new Date(coupon.expiresAt)) < new Date();
          const belowMin = coupon.minOrder && serverSubtotal < coupon.minOrder;

          // Per-user usage check
          const usedBy       = Array.isArray(coupon.usedBy) ? coupon.usedBy : [];
          const maxUses      = coupon.maxUsesPerUser || 1;
          const userUseCount = usedBy.filter((u) => u === order.userId).length;
          const userLimitHit = userUseCount >= maxUses;

          // Global usage limit check
          const totalUsageCount = coupon.totalUsageCount || 0;
          const maxTotalUses    = coupon.maxTotalUses || null; // null = unlimited
          const globalLimitHit  = maxTotalUses !== null && totalUsageCount >= maxTotalUses;

          if (!expired && !belowMin && !userLimitHit && !globalLimitHit) {
            if (coupon.type === 'percent') {
              serverDiscount = Math.min(
                (serverSubtotal * coupon.value) / 100,
                coupon.maxDiscount || Infinity,
              );
            } else {
              serverDiscount = coupon.value || 0;
            }
          } else {
            console.log(
              `[Coupon] Rejected "${order.couponCode}" for order ${orderId}:`,
              { expired, belowMin, userLimitHit, globalLimitHit }
            );
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

    // ── 5. Compare with client total — auto-cancel on tampering ─────────────
    const clientTotal = order.total || order.totalAmount || 0;
    const diff        = Math.abs(serverTotal - clientTotal);

    if (diff > 5) {
      console.warn(
        `[validateOrder] Price tampering detected for order ${orderId}: client=${clientTotal}, server=${serverTotal} (diff=${diff.toFixed(2)}). Auto-cancelling.`,
      );
      await db.collection('orders').doc(orderId).update({
        status:          'cancelled',
        cancelReason:    'Price tampering detected. Order auto-cancelled.',
        serverSubtotal,
        serverDiscount,
        serverDelivery,
        serverTotal,
        priceMismatch:   true,
        updatedAt:       FieldValue.serverTimestamp(),
      });
      return; // stop — no coupon marking, no further processing
    }

    // ── 6. Update order with server-computed values ──────────
    await db.collection('orders').doc(orderId).update({
      serverSubtotal,
      serverDiscount,
      serverDelivery,
      serverTotal,
      priceMismatch: false,
    });

    // ── 7. Mark coupon as used ───────────────────────────────
    if (couponDocId && serverDiscount > 0) {
      try {
        await db.collection('coupons').doc(couponDocId).update({
          usedBy:           FieldValue.arrayUnion(order.userId),
          totalUsageCount:  FieldValue.increment(1),   // atomic global counter
          lastUsedAt:       FieldValue.serverTimestamp(),
        });
      } catch (err) {
        console.warn('[validateOrder] Failed to record coupon usage:', err.message);
      }
    }

    // ── NOTE: Stock is NOT deducted here.  ──────────────────
    // Stock is only deducted when admin marks the order as DELIVERED.
    // See: notifyUserOnStatusChange trigger below.
    console.log(`[validateOrder] Order ${orderId} validated. serverTotal=${serverTotal}`);
  }
);

// ============================================================
// TRIGGER 2: Notify ADMIN when a new order is placed
// ============================================================
exports.notifyAdminOnNewOrder = onDocumentCreated(
  { document: 'orders/{orderId}', region: 'asia-south1' },
  async (event) => {
    const order   = event.data.data();
    const orderId = event.params.orderId;

    if (!order) return;

    const storeId      = order.storeId || null;
    const customerName = order.customerName || order.userName || 'A customer';
    const orderNumber  = order.orderNumber  || orderId.slice(-6).toUpperCase();

    const tokenQuery = storeId
      ? db.collection('fcmTokens').where('storeId', '==', storeId).where('role', '==', 'admin')
      : db.collection('fcmTokens').where('role', '==', 'admin');

    const tokenSnap = await tokenQuery.get();
    if (tokenSnap.empty) return;

    const tokens = tokenSnap.docs.map((d) => d.data().token).filter(Boolean);
    if (tokens.length === 0) return;

    const message = {
      notification: {
        title: '🛒 New Order Received!',
        body:  `${customerName} placed order #${orderNumber}`,
      },
      data: {
        orderId,
        orderNumber,
        type: 'new_order',
        url:  '/admin/orders',
      },
      webpush: {
        notification: {
          icon:    '/logo192.png',
          badge:   '/badge-72.png',
          tag:     `new-order-${orderId}`,
          actions: JSON.stringify([
            { action: 'view',    title: '📋 View Order' },
            { action: 'dismiss', title: '✕ Dismiss'    },
          ]),
        },
        fcm_options: { link: '/admin/orders' },
      },
    };

    try {
      const res = await messaging.sendEachForMulticast({ tokens, ...message });
      await cleanStaleTokens(tokenSnap, res.responses);
      console.log(`[FCM] Admin notified for order ${orderId}. Success: ${res.successCount}`);
    } catch (err) {
      console.error(`[FCM] Admin notify failed for order ${orderId}:`, err.message);
    }
  }
);

// ============================================================
// TRIGGER 3: Handle stock on order status changes
//
//  * → delivered            → DEDUCT stock
//  delivered → cancelled    → ADD BACK stock
//  cancelled → delivered    → DEDUCT stock
//  * → cancelled (not from delivered) → do NOTHING
//    (stock was never deducted for this order in the new model)
// ============================================================
exports.notifyUserOnStatusChange = onDocumentUpdated(
  { document: 'orders/{orderId}', region: 'asia-south1' },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    if (!before || !after || before.status === after.status) return;

    const prevStatus  = before.status;
    const newStatus   = after.status;
    const orderId     = event.params.orderId;
    const userId      = after.userId;
    const orderNumber = after.orderNumber || orderId.slice(-6).toUpperCase();
    const items       = after.items;
    const storeId     = after.storeId;

    // ── Stock logic ───────────────────────────────────────────────────────────
    if (Array.isArray(items) && items.length > 0 && storeId) {

      // ── CASE A: any status → delivered ────────────────────────────────────
      // Covers normal flow (enroute → delivered) AND edge case (cancelled → delivered)
      if (newStatus === 'delivered') {
        try {
          const count = await applyStockDelta(storeId, items, (item) => -(item.quantity || 0));
          console.log(`[Stock] Deducted stock for ${count} item(s) on order ${orderId} (${prevStatus} → delivered)`);
        } catch (err) {
          console.error(`[Stock] Deduct failed for order ${orderId}:`, err.message);
        }
      }

      // ── CASE B: delivered → cancelled ─────────────────────────────────────
      // Stock was deducted when it was marked delivered — restore it now.
      else if (prevStatus === 'delivered' && newStatus === 'cancelled') {
        try {
          const count = await applyStockDelta(storeId, items, (item) => item.quantity || 0);
          console.log(`[Stock] Restocked ${count} item(s) for order ${orderId} (delivered → cancelled)`);
        } catch (err) {
          console.error(`[Stock] Restock failed for order ${orderId}:`, err.message);
        }
      }

      // ── CASE C: anything else → cancelled ─────────────────────────────────
      // Order was never delivered so stock was never deducted. Do nothing.
      else if (newStatus === 'cancelled') {
        console.log(`[Stock] No stock change for order ${orderId} (${prevStatus} → cancelled, never delivered)`);
      }

      // ── CASE D: intermediate status changes (placed/confirmed/processing/packed/enroute)
      // No stock change needed.
    }

    // ── Send FCM notification to user ─────────────────────────────────────────
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
          icon:        'notification_icon',
          color:       '#FF6B35',
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
    };

    try {
      const res = await messaging.sendEachForMulticast({ tokens, ...message });
      await cleanStaleTokens(tokenSnap, res.responses);
      console.log(`[FCM] User notified for order ${orderId} (${newStatus}). Success: ${res.successCount}`);
    } catch (err) {
      console.error(`[FCM] User notify failed for order ${orderId}:`, err.message);
    }
  }
);

// ============================================================
// TRIGGER 4: Purchase CREATED → add stock for each item
// ============================================================
exports.onPurchaseCreated = onDocumentCreated(
  { document: 'purchases/{purchaseId}', region: 'asia-south1' },
  async (event) => {
    const purchase   = event.data.data();
    const purchaseId = event.params.purchaseId;

    if (!purchase || !Array.isArray(purchase.items) || purchase.items.length === 0) return;

    const storeId = purchase.storeId;
    if (!storeId) {
      console.warn(`[Purchase] Purchase ${purchaseId} has no storeId. Skipping stock update.`);
      return;
    }

    try {
      const count = await upsertStockForPurchase(storeId, purchase.items);
      console.log(`[Purchase] Stock added for ${count} item(s) on purchase ${purchaseId}`);
    } catch (err) {
      console.error(`[Purchase] Stock add failed for purchase ${purchaseId}:`, err.message);
    }
  }
);

// ============================================================
// TRIGGER 5: Purchase UPDATED → apply delta (new qty − old qty)
//
// Examples:
//   item A: 100 → 200  →  increment +100
//   item B: 200 → 100  →  increment −100
//   item C: removed    →  increment −(old qty)
//   item D: new item   →  increment +(new qty)
// ============================================================
exports.onPurchaseUpdated = onDocumentUpdated(
  { document: 'purchases/{purchaseId}', region: 'asia-south1' },
  async (event) => {
    const before     = event.data.before.data();
    const after      = event.data.after.data();
    const purchaseId = event.params.purchaseId;

    if (!before || !after) return;

    const storeId = after.storeId || before.storeId;
    if (!storeId) {
      console.warn(`[Purchase] Purchase ${purchaseId} has no storeId. Skipping stock update.`);
      return;
    }

    const oldItems = Array.isArray(before.items) ? before.items : [];
    const newItems = Array.isArray(after.items)  ? after.items  : [];

    // Build a map of old quantities keyed by productId
    const oldQtyMap = {};
    for (const item of oldItems) {
      const pid = item.productId || item.id;
      if (pid) oldQtyMap[pid] = (oldQtyMap[pid] || 0) + (item.quantity || 0);
    }

    // Build a map of new quantities keyed by productId
    const newQtyMap = {};
    for (const item of newItems) {
      const pid = item.productId || item.id;
      if (pid) newQtyMap[pid] = (newQtyMap[pid] || 0) + (item.quantity || 0);
    }

    // Collect all unique productIds across old and new
    const allProductIds = new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)]);

    // Build a flat list with _delta and pricing from the new items
    const deltaItems = [];
    for (const productId of allProductIds) {
      const oldQty  = oldQtyMap[productId] || 0;
      const newQty  = newQtyMap[productId] || 0;
      const delta   = newQty - oldQty;
      if (delta !== 0) {
        // Pull latest pricing from newItems for this product (for upsert)
        const newItem = newItems.find((i) => (i.productId || i.id) === productId);
        deltaItems.push({
          productId,
          _delta:    delta,
          mrp:       newItem?.mrp       || 0,
          sellRate:  newItem?.sellRate  || 0,
          costPrice: newItem?.costPrice || 0,
        });
      }
    }

    if (deltaItems.length === 0) {
      console.log(`[Purchase] No quantity changes in purchase ${purchaseId}. Skipping stock update.`);
      return;
    }

    try {
      const count = await upsertStockForPurchase(storeId, deltaItems);
      console.log(`[Purchase] Stock delta applied for ${count} item(s) on purchase ${purchaseId}`);
    } catch (err) {
      console.error(`[Purchase] Stock delta failed for purchase ${purchaseId}:`, err.message);
    }
  }
);

// ============================================================
// TRIGGER 6: Purchase DELETED → deduct full qty for each item
// ============================================================
exports.onPurchaseDeleted = onDocumentDeleted(
  { document: 'purchases/{purchaseId}', region: 'asia-south1' },
  async (event) => {
    const purchase   = event.data.data();
    const purchaseId = event.params.purchaseId;

    if (!purchase || !Array.isArray(purchase.items) || purchase.items.length === 0) return;

    const storeId = purchase.storeId;
    if (!storeId) {
      console.warn(`[Purchase] Deleted purchase ${purchaseId} has no storeId. Skipping stock update.`);
      return;
    }

    try {
      // Pass items with negative quantity so upsertStockForPurchase deducts
      const negatedItems = purchase.items.map((item) => ({
        ...item,
        _delta: -(item.quantity || 0),
      }));
      const count = await upsertStockForPurchase(storeId, negatedItems);
      console.log(`[Purchase] Stock deducted for ${count} item(s) on deleted purchase ${purchaseId}`);
    } catch (err) {
      console.error(`[Purchase] Stock deduct failed on delete for purchase ${purchaseId}:`, err.message);
    }
  }
);

// ============================================================
// SCHEDULED: Daily low-stock check (runs at 8 AM IST = 2:30 AM UTC)
// ============================================================
exports.dailyLowStockCheck = onSchedule({ schedule: '30 2 * * *', region: 'asia-south1' }, async () => {
  const LOW_STOCK_THRESHOLD = 5;

  try {
    const storesSnap = await db.collection('stores').where('active', '==', true).get();

    for (const storeDoc of storesSnap.docs) {
      const storeId   = storeDoc.id;
      const storeName = storeDoc.data().name || storeId;

      const lowStockSnap = await db.collection('storeInventory')
        .where('storeId', '==', storeId)
        .where('stock',   '<=', LOW_STOCK_THRESHOLD)
        .where('active',  '==', true)
        .get();

      if (lowStockSnap.empty) continue;

      const lowItems = lowStockSnap.docs.map((d) => {
        const data = d.data();
        return `${data.name || data.productId}: ${data.stock ?? '?'} left`;
      });

      const tokenSnap = await db.collection('fcmTokens')
        .where('storeId', '==', storeId)
        .where('role',    '==', 'admin')
        .get();

      if (tokenSnap.empty) continue;

      const tokens = tokenSnap.docs.map((d) => d.data().token).filter(Boolean);
      if (tokens.length === 0) continue;

      const preview = lowItems.slice(0, 3).join(', ');
      const extra   = lowItems.length > 3 ? ` and ${lowItems.length - 3} more` : '';

      const message = {
        notification: {
          title: `⚠️ Low Stock Alert — ${storeName}`,
          body:  `${preview}${extra}`,
        },
        data: {
          type: 'low_stock',
          url:  '/admin/inventory',
        },
        webpush: { fcm_options: { link: '/admin/inventory' } },
      };

      try {
        const res = await messaging.sendEachForMulticast({ tokens, ...message });
        await cleanStaleTokens(tokenSnap, res.responses);
        console.log(`[LowStock] Notified admin for store ${storeId}. Items: ${lowItems.length}`);
      } catch (err) {
        console.error(`[LowStock] FCM failed for store ${storeId}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[LowStock] Scheduled check failed:', err.message);
  }
});