// ============================================================
// src/components/user/CartReconciler.jsx
//
// Renderless component — returns null, exists only for its
// side-effect. Mounted once inside App.js (sibling to
// NotificationsInit) so it runs on EVERY page, not just Cart.
//
// When the active store changes (user changes delivery location),
// it fetches all products for the new store and reconciles the
// cart: items matched by name+unit are updated with the new
// store's product data; unmatched items are flagged _unavailable.
// ============================================================
import { useEffect, useRef } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { useCart } from '../../context/CartContext';
import { useStore } from '../../context/StoreContext';

// Composite key: name + unit — differentiates "Harpic 180ml" from "Harpic 500ml"
const itemKey = (name, unit) =>
  `${(name || '').trim().toLowerCase()}|||${(unit || '').trim().toLowerCase()}`;

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
        // Single query — all active products for the new store
        // Uses composite index: storeId ASC + active ASC + createdAt DESC
        const snap = await getDocs(
          query(
            collection(db, COLLECTIONS.PRODUCTS),
            where('storeId', '==', activeUserStore.id),
            where('active',  '==', true),
          )
        );

        // Build lookup map keyed by name+unit (both normalised)
        // If the same name+unit appears twice, prefer the one with more stock
        const byKey = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          const k    = itemKey(data.name, data.unit);
          if (!byKey[k] || (data.stock || 0) > (byKey[k].stock || 0)) {
            byKey[k] = { id: d.id, ...data };
          }
        });

        const next = items.map((item) => {
          const k     = itemKey(item.name, item.unit);
          const match = byKey[k];

          if (match) {
            // Found — swap to new store's product data, keep user's quantity
            return {
              ...match,
              quantity:     item.quantity,
              _unavailable: false,
            };
          } else {
            // Not found — flag as unavailable, keep original data for display
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