// ============================================================
// src/pages/hooks/useAdminOrderNotifications.js
// ── Stacked toasts for multiple simultaneous orders
// ── "Clear All" button when more than one toast is shown
// ============================================================
import { useEffect, useRef } from 'react';
import {
  collection, query, where, orderBy, limit, onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';

// ── Sound: unlock on first user interaction (Chrome autoplay policy) ──
let audioUnlocked = false;

const unlockAudio = () => {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
  } catch (e) {}
  document.removeEventListener('click', unlockAudio);
  document.removeEventListener('keydown', unlockAudio);
  document.removeEventListener('touchstart', unlockAudio);
};

document.addEventListener('click', unlockAudio);
document.addEventListener('keydown', unlockAudio);
document.addEventListener('touchstart', unlockAudio);

const playSound = () => {
  try {
    const audio = new Audio('/sounds/order-alert.mp3');
    audio.volume = 1.0;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((e) => {
        console.warn('[Sound] Autoplay blocked — admin must click the page first:', e.message);
      });
    }
  } catch (e) {
    console.warn('[Sound] Error:', e.message);
  }
};

// ── Toast container manager ───────────────────────────────────
const CONTAINER_ID = 'zap-toast-container';
const CLEAR_BTN_ID = 'zap-toast-clear-all';

const getOrCreateContainer = () => {
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 95vh;
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 2px;
      scrollbar-width: thin;
      scrollbar-color: #D85A30 transparent;
    `;
    document.body.appendChild(container);
  }
  return container;
};

const updateClearAllButton = () => {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  const toastCount = container.querySelectorAll('.zap-single-toast').length;
  let clearBtn = document.getElementById(CLEAR_BTN_ID);

  if (toastCount > 1) {
    if (!clearBtn) {
      clearBtn = document.createElement('div');
      clearBtn.id = CLEAR_BTN_ID;
      clearBtn.innerHTML = `
        <button style="
          width: 100%;
          padding: 6px 12px;
          background: #fff;
          border: 0.5px solid rgba(0,0,0,0.18);
          border-radius: 8px;
          color: #666;
          font-weight: 500;
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
        ">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"
              stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Clear all (${toastCount})
        </button>
      `;
      clearBtn.querySelector('button').addEventListener('click', () => {
        const c = document.getElementById(CONTAINER_ID);
        if (c) c.remove();
      });
      container.insertBefore(clearBtn, container.firstChild);
    } else {
      const btn = clearBtn.querySelector('button');
      if (btn) {
        btn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"
              stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Clear all (${toastCount})
        `;
      }
    }
  } else if (clearBtn) {
    clearBtn.remove();
  }
};

// ── Initials helper ───────────────────────────────────────────
const getInitials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

// ── Build a single toast card ─────────────────────────────────
const showInAppToast = (order) => {
  const container = getOrCreateContainer();

  const {
    id: orderId,
    orderNumber, customerName, customerPhone,
    items = [], address = {}, total, subtotal, deliveryCharge,
    discount, paymentMethod, couponCode,
  } = order;

  const MAX_ITEMS = 4;
  const visibleItems = items.slice(0, MAX_ITEMS);
  const extraCount  = items.length - MAX_ITEMS;
  const itemPills   = visibleItems.map((i) => `
    <span style="
      font-size: 11px;
      background: #f5f5f5;
      color: #555;
      padding: 3px 8px;
      border-radius: 6px;
      border: 0.5px solid rgba(0,0,0,0.09);
      white-space: nowrap;
    ">${i.name} ×${i.quantity}</span>
  `).join('');
  const extraPill = extraCount > 0 ? `
    <span style="
      font-size: 11px;
      background: #f5f5f5;
      color: #888;
      padding: 3px 8px;
      border-radius: 6px;
      border: 0.5px solid rgba(0,0,0,0.09);
    ">+${extraCount} more</span>
  ` : '';

  const hasBreakdown = subtotal && (discount || Number(deliveryCharge) > 0);
  const billRows = hasBreakdown ? `
    <div style="margin-top:8px;padding-top:8px;border-top:0.5px solid rgba(0,0,0,0.08);display:flex;flex-direction:column;gap:3px;">
      ${subtotal ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:#888;"><span>Subtotal</span><span>₹${Number(subtotal).toFixed(2)}</span></div>` : ''}
      ${Number(deliveryCharge) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:#888;"><span>Delivery</span><span>₹${Number(deliveryCharge).toFixed(2)}</span></div>` : ''}
      ${discount ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:#06D6A0;"><span>Discount${couponCode ? ` (${couponCode})` : ''}</span><span>-₹${Number(discount).toFixed(2)}</span></div>` : ''}
    </div>
  ` : '';

  const addressParts = [address.flat, address.building, address.area, address.landmark].filter(Boolean);
  const addressLine = addressParts.join(', ');

  const toastId = `zap-toast-${orderId}`;
  if (document.getElementById(toastId)) return;

  const wrapper = document.createElement('div');
  wrapper.id = toastId;
  wrapper.className = 'zap-single-toast';
  wrapper.style.cssText = `
    width: 300px;
    background: #fff;
    border-radius: 12px;
    border: 0.5px solid rgba(0,0,0,0.12);
    box-shadow: 0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    animation: zapToastSlideIn 0.3s cubic-bezier(0.22,1,0.36,1) both;
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes zapToastSlideIn {
      from { opacity: 0; transform: translateX(20px) scale(0.96); }
      to   { opacity: 1; transform: translateX(0)   scale(1);    }
    }
  `;
  if (!document.getElementById('zap-toast-styles')) {
    style.id = 'zap-toast-styles';
    document.head.appendChild(style);
  }

  const pmBadgeColor = paymentMethod === 'cod' ? '#666' : '#0066cc';
  const pmLabel = paymentMethod === 'cod' ? 'COD' : 'PAID';

  wrapper.innerHTML = `
    <!-- Header -->
    <div style="padding:10px 12px 8px;background:linear-gradient(135deg,#FF6B35,#E55A25);display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:16px;">🛍️</span>
        <div>
          <p style="margin:0;font-size:13px;font-weight:700;color:#fff;">New Order #${orderNumber || orderId.slice(-6).toUpperCase()}</p>
          <p style="margin:0;font-size:10px;color:rgba(255,255,255,0.8);">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:10px;font-weight:600;color:${pmBadgeColor};background:#fff;padding:2px 6px;border-radius:4px;">${pmLabel}</span>
        <button class="zap-close-btn" style="background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;line-height:1;padding:0;">×</button>
      </div>
    </div>

    <!-- Body -->
    <div style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;">
      <!-- Customer row -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#FF6B35,#E55A25);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <span style="font-size:12px;font-weight:700;color:#fff;">${getInitials(customerName)}</span>
          </div>
          <div>
            <p style="margin:0;font-size:13px;font-weight:600;color:#111;">${customerName || 'Customer'}</p>
            ${customerPhone ? `<p style="margin:0;font-size:11px;color:#888;">${customerPhone}</p>` : ''}
          </div>
        </div>
        <p style="margin:0;font-size:16px;font-weight:600;color:#111;">₹${Number(total).toFixed(2)}</p>
      </div>

      ${billRows}

      <div style="display:flex;flex-wrap:wrap;gap:4px;">
        ${itemPills}${extraPill}
      </div>

      ${addressLine ? `
      <div style="display:flex;align-items:flex-start;gap:5px;">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="margin-top:1px;flex-shrink:0;">
          <path d="M8 1.5C5.51 1.5 3.5 3.51 3.5 6c0 3.75 4.5 8.5 4.5 8.5S12.5 9.75 12.5 6C12.5 3.51 10.49 1.5 8 1.5zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" fill="#aaa"/>
        </svg>
        <p style="margin:0;font-size:11px;color:#888;line-height:1.5;">${addressLine}</p>
      </div>` : ''}
    </div>

    <!-- Footer -->
    <div style="padding:8px 12px;border-top:0.5px solid rgba(0,0,0,0.07);">
      <button class="zap-view-btn" style="width:100%;padding:7px;cursor:pointer;border:0.5px solid #D85A30;border-radius:7px;background:#FAECE7;color:#993C1D;font-size:12px;font-weight:500;font-family:inherit;">View in dashboard</button>
    </div>
  `;

  wrapper.querySelector('.zap-close-btn').addEventListener('click', () => {
    wrapper.remove();
    updateClearAllButton();
    const c = document.getElementById(CONTAINER_ID);
    if (c && c.querySelectorAll('.zap-single-toast').length === 0) c.remove();
  });

  wrapper.querySelector('.zap-view-btn').addEventListener('click', () => {
    const c = document.getElementById(CONTAINER_ID);
    if (c) c.remove();
    window.location.href = '/admin/orders';
  });

  container.appendChild(wrapper);
  updateClearAllButton();

  setTimeout(() => {
    const el = document.getElementById(toastId);
    if (el) {
      el.remove();
      updateClearAllButton();
      const c = document.getElementById(CONTAINER_ID);
      if (c && c.querySelectorAll('.zap-single-toast').length === 0) c.remove();
    }
  }, 30000);
};

// ── OS notification ───────────────────────────────────────────
// ✅ FIX: Use registration.showNotification() instead of `new Notification()`.
// On Android PWA (installed to home screen), `new Notification()` is blocked
// by Chrome — it requires a service worker context. Samsung is especially
// strict about this. Using the SW registration works on both Android & iOS.
const showOSNotification = ({ orderNumber, customerName, total, orderId }) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;

  const title = `New order #${orderNumber || orderId?.slice(-6).toUpperCase()}`;
  const body  = `${customerName} · ₹${Number(total).toFixed(2)}`;

  navigator.serviceWorker.ready
    .then((registration) => {
      // showNotification() works in both browser tab AND installed PWA mode on Android
      return registration.showNotification(title, {
        body,
        icon:     '/logo192.png',
        badge:    '/badge-72.png',
        tag:      orderId || 'new-order',
        renotify: true,
        vibrate:  [200, 100, 200],
        data:     { url: '/admin/orders', orderId },
        actions: [
          { action: 'view',    title: '👀 View Order' },
          { action: 'dismiss', title: '✕ Dismiss'    },
        ],
      });
    })
    .catch(() => {
      // Last-resort fallback for browsers where SW isn't ready yet
      try {
        const n = new Notification(title, { body, icon: '/logo192.png', tag: orderId, renotify: true });
        n.onclick = () => { window.focus(); window.location.href = '/admin/orders'; };
      } catch { /* ignore */ }
    });
};

// ── Request permission ────────────────────────────────────────
export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
};

// ── Main hook ─────────────────────────────────────────────────
export const useAdminOrderNotifications = () => {
  const { user, userProfile } = useAuth();
  const { adminStore }        = useStore();
  const knownOrderIds         = useRef(null);
  const isAdmin               = userProfile?.role === 'admin';
  const storeId               = userProfile?.adminStoreId || adminStore?.id || null;

  useEffect(() => {
    if (!user || !isAdmin) return;
    const t = setTimeout(() => requestNotificationPermission(), 2000);
    return () => clearTimeout(t);
  }, [user?.uid, isAdmin]);

  useEffect(() => {
    if (!user || !isAdmin) return;

    let q = query(
      collection(db, 'orders'),
      where('status', '==', 'placed'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    if (storeId) {
      q = query(
        collection(db, 'orders'),
        where('storeId', '==', storeId),
        where('status', '==', 'placed'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
    }

    const unsub = onSnapshot(q, (snapshot) => {
      const currentIds = new Set(snapshot.docs.map((d) => d.id));

      if (knownOrderIds.current === null) {
        knownOrderIds.current = currentIds;
        return;
      }

      snapshot.docs.forEach((docSnap) => {
        if (!knownOrderIds.current.has(docSnap.id)) {
          const order = { id: docSnap.id, ...docSnap.data() };

          playSound();
          showInAppToast(order);
          showOSNotification({
            orderNumber:  order.orderNumber,
            customerName: order.customerName,
            total:        order.total,
            orderId:      docSnap.id,
          });

          window.dispatchEvent(new CustomEvent('zap:new-order', { detail: order }));
        }
      });

      knownOrderIds.current = currentIds;
    }, (err) => {
      console.error('[Notify] onSnapshot error:', err.message);
    });

    knownOrderIds.current = null;
    return () => unsub();
  }, [user?.uid, isAdmin, storeId]);
};