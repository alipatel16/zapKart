import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CartContext = createContext(null);

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};

const CART_KEY = 'zap_cart';
const DELIVERY_CHARGE = parseInt(process.env.REACT_APP_DELIVERY_CHARGE) || 10;
const FREE_DELIVERY_ABOVE = parseInt(process.env.REACT_APP_FREE_DELIVERY_ABOVE) || 299;

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

  const addToCart = useCallback((product, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, quantity: i.quantity + qty } : i
        );
      }
      return [...prev, { ...product, quantity: qty }];
    });
  }, []);

  const removeFromCart = useCallback((productId) => {
    setItems((prev) => prev.filter((i) => i.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId, qty) => {
    if (qty < 1) {
      removeFromCart(productId);
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.id === productId ? { ...i, quantity: qty } : i))
    );
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    setItems([]);
    setCoupon(null);
    localStorage.removeItem(CART_KEY);
  }, []);

  const isInCart = useCallback((productId) => items.some((i) => i.id === productId), [items]);

  const getQuantity = useCallback((productId) => {
    const item = items.find((i) => i.id === productId);
    return item ? item.quantity : 0;
  }, [items]);

  // mrpTotal: sum of full MRP prices (before any product discounts)
  const mrpTotal = items.reduce((sum, item) => sum + item.mrp * item.quantity, 0);

  // subtotal: sum of selling prices (discounted or MRP if no discount)
  const subtotal = items.reduce((sum, item) => {
    const price = item.discountedPrice || item.mrp;
    return sum + price * item.quantity;
  }, 0);

  const discount = coupon
    ? coupon.type === 'percent'
      ? Math.min((subtotal * coupon.value) / 100, coupon.maxDiscount || Infinity)
      : coupon.value
    : 0;

  const deliveryCharge = subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_CHARGE;
  const total = subtotal - discount + deliveryCharge;
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const savings = items.reduce((sum, item) => {
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
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};