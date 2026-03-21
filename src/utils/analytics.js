import { getAnalytics, logEvent, setUserId, setUserProperties } from 'firebase/analytics';

// ── Get analytics instance safely (may be null in test/SSR) ──────────────
let _analytics = null;
const getAn = () => {
  if (_analytics) return _analytics;
  try { _analytics = getAnalytics(); } catch { /* not supported */ }
  return _analytics;
};

// ── Event helpers ─────────────────────────────────────────────────────────

export const analyticsIdentify = (userId, role) => {
  const an = getAn(); if (!an) return;
  setUserId(an, userId);
  setUserProperties(an, { role });
};

export const trackProductView = (product) => {
  const an = getAn(); if (!an) return;
  logEvent(an, 'view_item', {
    item_id: product.id,
    item_name: product.name,
    item_category: product.categoryId,
    price: product.discountedPrice || product.mrp,
  });
};

export const trackAddToCart = (product, quantity = 1) => {
  const an = getAn(); if (!an) return;
  logEvent(an, 'add_to_cart', {
    item_id: product.id,
    item_name: product.name,
    price: product.discountedPrice || product.mrp,
    quantity,
  });
};

export const trackRemoveFromCart = (product) => {
  const an = getAn(); if (!an) return;
  logEvent(an, 'remove_from_cart', {
    item_id: product.id,
    item_name: product.name,
  });
};

export const trackSearch = (searchTerm, resultCount) => {
  const an = getAn(); if (!an) return;
  logEvent(an, 'search', { search_term: searchTerm, result_count: resultCount });
};

export const trackBeginCheckout = (total, itemCount) => {
  const an = getAn(); if (!an) return;
  logEvent(an, 'begin_checkout', { value: total, num_items: itemCount, currency: 'INR' });
};

export const trackPurchase = (order) => {
  const an = getAn(); if (!an) return;
  logEvent(an, 'purchase', {
    transaction_id: order.orderNumber,
    value: order.total,
    currency: 'INR',
    coupon: order.couponCode || '',
    shipping: order.deliveryCharge,
    items: order.items?.map((i) => ({
      item_id: i.id,
      item_name: i.name,
      price: i.discountedPrice || i.mrp,
      quantity: i.quantity,
    })) || [],
  });
};

export const trackOrderCancelled = (orderId) => {
  const an = getAn(); if (!an) return;
  logEvent(an, 'refund', { transaction_id: orderId });
};

export const trackLogin = (method) => {
  const an = getAn(); if (!an) return;
  logEvent(an, 'login', { method });
};

export const trackSignUp = (method) => {
  const an = getAn(); if (!an) return;
  logEvent(an, 'sign_up', { method });
};

export const trackPageView = (pageName) => {
  const an = getAn(); if (!an) return;
  logEvent(an, 'page_view', { page_title: pageName });
};

export const trackError = (errorMessage, fatal = false) => {
  const an = getAn(); if (!an) return;
  // Note: Firebase Analytics has no native crash reporting for web.
  // Log as a custom event so you can see error patterns in Analytics.
  logEvent(an, 'app_error', { error_message: errorMessage?.slice(0, 100), fatal });
};