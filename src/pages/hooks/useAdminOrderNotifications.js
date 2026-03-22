// ============================================================
// src/hooks/useAdminOrderNotifications.js
// ── Beep sound via Web Audio API (no MP3 file needed)
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
let audioCtx = null;

const unlockAudio = () => {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume();
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

  // Items pill list — cap at 4 then "+N more"
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

  // Billing summary (only show if there are interesting breakdowns)
  const hasBreakdown = subtotal && (discount || Number(deliveryCharge) > 0);
  const billRows = hasBreakdown ? `
    <div style="
      margin-top: 8px;
      padding-top: 8px;
      border-top: 0.5px solid rgba(0,0,0,0.08);
      display: flex;
      flex-direction: column;
      gap: 3px;
    ">
      ${subtotal ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:#777;">
        <span>Subtotal</span><span>₹${Number(subtotal).toFixed(2)}</span>
      </div>` : ''}
      ${discount ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:#2a7d4f;">
        <span>Discount${couponCode ? ` (${couponCode})` : ''}</span>
        <span>−₹${Number(discount).toFixed(2)}</span>
      </div>` : ''}
      ${deliveryCharge !== undefined ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:#777;">
        <span>Delivery</span>
        <span>${Number(deliveryCharge) === 0
          ? '<span style="color:#2a7d4f;">Free</span>'
          : '₹' + Number(deliveryCharge).toFixed(2)}</span>
      </div>` : ''}
    </div>
  ` : '';

  // Address
  const addressLine = address
    ? [address.line1, address.line2, address.city, address.state, address.pincode]
        .filter(Boolean).join(', ')
    : '';

  // Payment badge
  const isPaid = paymentMethod === 'razorpay';
  const paymentBadge = isPaid
    ? `<span style="font-size:11px;font-weight:500;background:#E6F1FB;color:#185FA5;padding:2px 7px;border-radius:20px;">Paid</span>`
    : `<span style="font-size:11px;font-weight:500;background:#EAF3DE;color:#3B6D11;padding:2px 7px;border-radius:20px;">COD</span>`;

  const toastId = `zap-toast-${orderId}`;
  const initials = getInitials(customerName);

  const wrapper = document.createElement('div');
  wrapper.className = 'zap-single-toast';
  wrapper.id = toastId;
  wrapper.style.cssText = `
    width: 320px;
    background: #ffffff;
    border: 0.5px solid rgba(0,0,0,0.14);
    border-left: 3px solid #D85A30;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(0,0,0,0.10);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    animation: zapSlideIn 0.28s cubic-bezier(0.22,1,0.36,1);
    flex-shrink: 0;
  `;

  wrapper.innerHTML = `
    <style>
      @keyframes zapSlideIn {
        from { opacity:0; transform:translateX(40px) scale(0.97); }
        to   { opacity:1; transform:translateX(0) scale(1); }
      }
    </style>

    <!-- Header -->
    <div style="
      padding: 10px 12px;
      display: flex; align-items: center; justify-content: space-between;
      border-bottom: 0.5px solid rgba(0,0,0,0.07);
    ">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="
          width: 28px; height: 28px;
          border-radius: 7px;
          background: #FAECE7;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        ">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 2h2l1.5 7h7l1.5-5H5" stroke="#D85A30" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="7" cy="13" r="1" fill="#D85A30"/>
            <circle cx="12" cy="13" r="1" fill="#D85A30"/>
          </svg>
        </div>
        <div>
          <p style="margin:0;font-size:13px;font-weight:600;color:#111;">
            New order <span style="color:#D85A30;">#${orderNumber}</span>
          </p>
          <p style="margin:0;font-size:11px;color:#888;">Just now</p>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        ${paymentBadge}
        <button class="zap-close-btn" style="
          border: none; background: none; color: #aaa;
          cursor: pointer; font-size: 15px; line-height: 1;
          padding: 2px 4px; border-radius: 4px;
        ">✕</button>
      </div>
    </div>

    <!-- Body -->
    <div style="padding: 10px 12px; display: flex; flex-direction: column; gap: 9px;">

      <!-- Customer + total -->
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="
            width: 28px; height: 28px; border-radius: 50%;
            background: #EEEDFE;
            display: flex; align-items: center; justify-content: center;
            font-size: 11px; font-weight: 600; color: #534AB7;
            flex-shrink: 0;
          ">${initials}</div>
          <div>
            <p style="margin:0;font-size:13px;font-weight:600;color:#111;">${customerName || '—'}</p>
            ${customerPhone ? `<p style="margin:0;font-size:11px;color:#888;">${customerPhone}</p>` : ''}
          </div>
        </div>
        <p style="margin:0;font-size:16px;font-weight:600;color:#111;">₹${Number(total).toFixed(2)}</p>
      </div>

      <!-- Bill breakdown (optional) -->
      ${billRows}

      <!-- Items -->
      <div style="display:flex;flex-wrap:wrap;gap:4px;">
        ${itemPills}${extraPill}
      </div>

      <!-- Address -->
      ${addressLine ? `
      <div style="display:flex;align-items:flex-start;gap:5px;">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="margin-top:1px;flex-shrink:0;">
          <path d="M8 1.5C5.51 1.5 3.5 3.51 3.5 6c0 3.75 4.5 8.5 4.5 8.5S12.5 9.75 12.5 6C12.5 3.51 10.49 1.5 8 1.5zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"
            fill="#aaa"/>
        </svg>
        <p style="margin:0;font-size:11px;color:#888;line-height:1.5;">${addressLine}</p>
      </div>` : ''}

    </div>

    <!-- Footer -->
    <div style="padding: 8px 12px; border-top: 0.5px solid rgba(0,0,0,0.07);">
      <button class="zap-view-btn" style="
        width: 100%; padding: 7px; cursor: pointer;
        border: 0.5px solid #D85A30; border-radius: 7px;
        background: #FAECE7; color: #993C1D;
        font-size: 12px; font-weight: 500;
        font-family: inherit;
      ">View in dashboard</button>
    </div>
  `;

  // Events
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

  // Auto-dismiss after 30s
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

// ── OS notification (background tab) ─────────────────────────
const showOSNotification = ({ orderNumber, customerName, total, orderId }) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(`New order #${orderNumber}`, {
      body: `${customerName} · ₹${Number(total).toFixed(2)}`,
      icon: '/logo192.png',
      tag: orderId,
      renotify: true,
    });
    n.onclick = () => { window.focus(); window.location.href = '/admin/orders'; };
  } catch (e) {}
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
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            total: order.total,
            orderId: docSnap.id,
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