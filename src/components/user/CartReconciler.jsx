// ============================================================
// src/components/user/CartReconciler.jsx
//
// Renderless component — returns null, exists only for its
// side-effect. Mounted once inside App.js (sibling to
// NotificationsInit) so it runs on EVERY page, not just Cart.
//
// When the active store changes (user changes delivery location),
// it fetches all storeInventory docs for the new store and
// reconciles the cart: items matched by PRODUCT ID are updated
// with the new store's pricing & stock; unmatched items are
// flagged _unavailable.
//
// Product IDs are GLOBAL — the same productId works across
// all stores. Each store manages its own stock/pricing via
// the storeInventory collection.
// ============================================================
import { useEffect, useRef } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { useCart } from '../../context/CartContext';
import { useStore } from '../../context/StoreContext';

const CartReconciler = () => {
  const { items, replaceItems } = useCart();
  const { activeUserStore }     = useStore();

  // Track the last store we reconciled for — avoids re-running on every render
  const lastReconciledStoreRef = useRef(null);

  useEffect(() => {
    // Nothing to reconcile
    if (!items.length || !activeUserStore?.id) return;

    const cartStoreId = items[0]?.storeId;

    // Already reconciled for this store and no unavailable flags — nothing to do
    if (
      lastReconciledStoreRef.current === activeUserStore.id &&
      cartStoreId === activeUserStore.id &&
      !items.some((i) => i._unavailable)
    ) return;

    // Cart already belongs to this store and is clean — nothing to do
    if (cartStoreId === activeUserStore.id && !items.some((i) => i._unavailable)) return;

    const reconcile = async () => {
      try {
        // Fetch storeInventory for the new store (active items with stock)
        const snap = await getDocs(
          query(
            collection(db, COLLECTIONS.STORE_INVENTORY),
            where('storeId', '==', activeUserStore.id),
            where('active',  '==', true),
          )
        );

        // Build lookup map keyed by productId
        const byProductId = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          // If duplicate productId (shouldn't happen), prefer higher stock
          if (!byProductId[data.productId] || (data.stock || 0) > (byProductId[data.productId].stock || 0)) {
            byProductId[data.productId] = { id: data.productId, ...data, _siDocId: d.id };
          }
        });

        const next = items.map((item) => {
          // Match by product ID (global, same across stores)
          const match = byProductId[item.id] || byProductId[item.productId];

          if (match) {
            // Found — swap to new store's pricing & stock, keep user's quantity
            return {
              id: match.productId,         // keep global productId as the item id
              productId: match.productId,
              storeId: activeUserStore.id,
              name: match.name,
              unit: match.unit || '',
              categoryId: match.categoryId || '',
              description: match.description || '',
              images: match.images || [],
              mrp: match.mrp || 0,
              discountedPrice: match.sellRate || null,  // sellRate maps to discountedPrice
              stock: match.stock || 0,
              isFeatured: match.isFeatured,
              isExclusive: match.isExclusive,
              isNewArrival: match.isNewArrival,
              active: match.active,
              quantity: item.quantity,
              _unavailable: false,
            };
          } else {
            // Not found at this store — flag as unavailable
            return { ...item, _unavailable: true };
          }
        });

        replaceItems(next);
        lastReconciledStoreRef.current = activeUserStore.id;
      } catch (err) {
        console.error('[CartReconciler] Reconciliation failed:', err);
      }
    };

    reconcile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUserStore?.id]);

  return null; // renderless
};

export default CartReconciler;