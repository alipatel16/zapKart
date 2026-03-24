// ============================================================
// src/context/CartContext.jsx
// ============================================================
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CartContext = createContext(null);

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};

const CART_KEY           = 'zap_cart';
const DELIVERY_CHARGE    = parseInt(process.env.REACT_APP_DELIVERY_CHARGE)    || 10;
const FREE_DELIVERY_ABOVE = parseInt(process.env.REACT_APP_FREE_DELIVERY_ABOVE) || 299;

// ✅ CART QUANTITY LIMIT: A user can add at most MAX_QTY_PER_ITEM units of any
// single product. If the product has less stock than this cap, the stock value
// wins. This prevents cart abuse and mirrors the order-level quantity check in
// the Cloud Function (which rejects any item with quantity > 100).
const MAX_QTY_PER_ITEM = 10;

/**
 * Compute the effective upper-bound quantity for a product.
 * stock value of 0/null/undefined ⟶ treated as "no stock info" ⟶ use MAX_QTY_PER_ITEM.
 */
const effectiveMax = (product) => {
  const stock = typeof product.stock === 'number' ? product.stock : Infinity;
  return Math.min(MAX_QTY_PER_ITEM, stock > 0 ? stock : MAX_QTY_PER_ITEM);
};

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem(CART_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [coupon, setCoupon] = useState(null);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  // ── addToCart ─────────────────────────────────────────────────────────────
  // Adds `qty` units of `product` to the cart, but never exceeds effectiveMax.
  // Returns an object so callers can show a friendly message when capped.
  //   { added: number, capped: boolean, max: number }
  const addToCart = useCallback((product, qty = 1) => {
    let result = { added: qty, capped: false, max: effectiveMax(product) };

    setItems((prev) => {
      const max      = effectiveMax(product);
      const existing = prev.find((i) => i.id === product.id);
      const current  = existing ? existing.quantity : 0;
      const allowed  = Math.max(0, max - current);   // how many more we can add
      const toAdd    = Math.min(qty, allowed);

      result = { added: toAdd, capped: toAdd < qty, max };

      if (toAdd === 0) return prev; // already at max — no-op

      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, quantity: current + toAdd } : i,
        );
      }
      return [...prev, { ...product, quantity: toAdd }];
    });

    return result;
  }, []);

  // ── removeFromCart ────────────────────────────────────────────────────────
  const removeFromCart = useCallback((productId) => {
    setItems((prev) => prev.filter((i) => i.id !== productId));
  }, []);

  // ── updateQuantity ────────────────────────────────────────────────────────
  // Clamps the new quantity to [1, effectiveMax].  Passing qty < 1 removes.
  const updateQuantity = useCallback((productId, qty) => {
    if (qty < 1) {
      removeFromCart(productId);
      return;
    }
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== productId) return i;
        const max     = effectiveMax(i);
        const clamped = Math.min(qty, max);
        return { ...i, quantity: clamped };
      }),
    );
  }, [removeFromCart]);

  // ── clearCart ─────────────────────────────────────────────────────────────
  const clearCart = useCallback(() => {
    setItems([]);
    setCoupon(null);
    localStorage.removeItem(CART_KEY);
  }, []);

  // ── helpers ───────────────────────────────────────────────────────────────
  const isInCart   = useCallback((productId) => items.some((i) => i.id === productId), [items]);
  const getQuantity = useCallback((productId) => {
    const item = items.find((i) => i.id === productId);
    return item ? item.quantity : 0;
  }, [items]);

  // ── Replaces the entire items array (used by store reconciliation) ────────
  const replaceItems = useCallback((newItems) => {
    setItems(newItems);
  }, []);

  // ── Totals ────────────────────────────────────────────────────────────────
  // mrpTotal: sum of full MRP prices (before any product discounts)
  // Unavailable items are excluded from all totals
  const mrpTotal = items
    .filter((i) => !i._unavailable)
    .reduce((sum, item) => sum + item.mrp * item.quantity, 0);

  // subtotal: sum of selling prices (discounted or MRP if no discount)
  const subtotal = items
    .filter((i) => !i._unavailable)
    .reduce((sum, item) => {
      const price = item.discountedPrice || item.mrp;
      return sum + price * item.quantity;
    }, 0);

  const discount = coupon
    ? coupon.type === 'percent'
      ? Math.min((subtotal * coupon.value) / 100, coupon.maxDiscount || Infinity)
      : coupon.value
    : 0;

  const deliveryCharge = subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_CHARGE;
  const total          = subtotal - discount + deliveryCharge;
  const totalItems     = items
    .filter((i) => !i._unavailable)
    .reduce((sum, item) => sum + item.quantity, 0);
  const savings = items
    .filter((i) => !i._unavailable)
    .reduce((sum, item) => {
      if (item.discountedPrice && item.mrp > item.discountedPrice) {
        return sum + (item.mrp - item.discountedPrice) * item.quantity;
      }
      return sum;
    }, 0);

  const value = {
    items,
    coupon,
    setCoupon,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    replaceItems,
    isInCart,
    getQuantity,
    mrpTotal,
    subtotal,
    discount,
    deliveryCharge,
    total,
    totalItems,
    savings,
    FREE_DELIVERY_ABOVE,
    DELIVERY_CHARGE,
    MAX_QTY_PER_ITEM,   // ← exposed so UI can show the limit to users
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};