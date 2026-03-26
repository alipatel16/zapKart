// ============================================================
// src/hooks/useStoreProducts.js
//
// Hook that fetches products from `storeInventory` for the
// active user store and returns them in the same shape that
// user-facing pages expect (matching the old products schema).
//
// This is the bridge between the new global-catalog + per-store
// storeInventory model and the existing user-facing UI components.
//
// Usage:
//   const { products, loading } = useStoreProducts({ categoryId, featured, exclusive, newArrival, limitCount });
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, where, orderBy, getDocs, limit as firestoreLimit,
  doc, getDoc,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';
import { useStore } from '../context/StoreContext';

/**
 * Fetches storeInventory docs for the active user store.
 * Returns them shaped like the old `products` collection docs
 * (with id, name, unit, mrp, discountedPrice, stock, images, etc.)
 *
 * @param {Object} options
 * @param {string} options.categoryId - filter by category
 * @param {boolean} options.featured - filter isFeatured
 * @param {boolean} options.exclusive - filter isExclusive
 * @param {boolean} options.newArrival - filter isNewArrival
 * @param {number} options.limitCount - limit results
 */
export const useStoreProducts = ({
  categoryId,
  featured,
  exclusive,
  newArrival,
  limitCount,
} = {}) => {
  const { activeUserStore } = useStore();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeUserStore?.id) {
      setProducts([]);
      setLoading(false);
      return;
    }

    const fetchProducts = async () => {
      setLoading(true);
      try {
        const constraints = [
          where('storeId', '==', activeUserStore.id),
          where('active', '==', true),
        ];

        if (categoryId) constraints.push(where('categoryId', '==', categoryId));
        if (featured) constraints.push(where('isFeatured', '==', true));
        if (exclusive) constraints.push(where('isExclusive', '==', true));
        if (newArrival) constraints.push(where('isNewArrival', '==', true));

        constraints.push(orderBy('createdAt', 'desc'));

        if (limitCount) constraints.push(firestoreLimit(limitCount));

        const snap = await getDocs(
          query(collection(db, COLLECTIONS.STORE_INVENTORY), ...constraints)
        );

        const items = snap.docs.map((d) => {
          const data = d.data();
          return {
            // Use productId as the canonical id (matches global catalog)
            id: data.productId,
            productId: data.productId,
            storeId: data.storeId,
            name: data.name || '',
            unit: data.unit || '',
            categoryId: data.categoryId || '',
            description: data.description || '',
            images: data.images || [],
            mrp: data.mrp || 0,
            discountedPrice: data.sellRate || null,  // sellRate → discountedPrice for backward compat
            stock: data.stock || 0,
            isFeatured: data.isFeatured || false,
            isExclusive: data.isExclusive || false,
            isNewArrival: data.isNewArrival || false,
            active: data.active !== false,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });

        // Only show products with stock > 0 for user-facing
        setProducts(items.filter((p) => p.stock > 0));
      } catch (err) {
        console.error('[useStoreProducts] Fetch failed:', err);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [activeUserStore?.id, categoryId, featured, exclusive, newArrival, limitCount]);

  return { products, loading };
};

/**
 * Fetch a single product from storeInventory for user-facing detail page.
 * Falls back to global product catalog if no storeInventory doc exists.
 */
export const fetchStoreProduct = async (productId, storeId) => {
  if (!productId) return null;

  // Try storeInventory first (has pricing/stock for this store)
  if (storeId) {
    const siDocId = `${storeId}__${productId}`;
    const siSnap = await getDoc(doc(db, COLLECTIONS.STORE_INVENTORY, siDocId));
    if (siSnap.exists()) {
      const data = siSnap.data();
      return {
        id: data.productId,
        productId: data.productId,
        storeId: data.storeId,
        name: data.name || '',
        unit: data.unit || '',
        categoryId: data.categoryId || '',
        description: data.description || '',
        images: data.images || [],
        mrp: data.mrp || 0,
        discountedPrice: data.sellRate || null,
        stock: data.stock || 0,
        isFeatured: data.isFeatured || false,
        isExclusive: data.isExclusive || false,
        isNewArrival: data.isNewArrival || false,
        active: data.active !== false,
      };
    }
  }

  // Fallback: global product (no pricing/stock)
  const productSnap = await getDoc(doc(db, COLLECTIONS.PRODUCTS, productId));
  if (productSnap.exists()) {
    return { id: productSnap.id, ...productSnap.data(), stock: 0, mrp: 0, discountedPrice: null };
  }

  return null;
};

export default useStoreProducts;