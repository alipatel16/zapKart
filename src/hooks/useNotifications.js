// ============================================================
// src/hooks/useNotifications.js
// ============================================================
import { useEffect, useCallback, useRef } from 'react';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import {
  doc, setDoc, serverTimestamp, collection, query,
  where, getDocs, deleteDoc, orderBy, limit, onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth }  from '../context/AuthContext';
import { useStore } from '../context/StoreContext';

const VAPID_KEY = process.env.REACT_APP_FIREBASE_VAPID_KEY || '';

// ── Status copy map (mirrors Cloud Function) ──────────────────
const USER_STATUS_COPY = {
  confirmed:  { emoji: '✅', title: 'Order Confirmed!',      body: 'Your order has been confirmed and is being prepared.' },
  processing: { emoji: '⚙️', title: 'Preparing Your Order',  body: 'Your order is being carefully packed right now.' },
  packed:     { emoji: '📦', title: 'Order Packed!',         body: 'Your order is packed and waiting for pickup.' },
  enroute:    { emoji: '🛵', title: 'Out for Delivery!',     body: 'Your order is on the way! Should reach you very soon.' },
  delivered:  { emoji: '🎉', title: 'Order Delivered!',      body: 'Your order has been delivered. Enjoy! 🙏' },
  cancelled:  { emoji: '❌', title: 'Order Cancelled',       body: 'Your order has been cancelled. Contact us if this was a mistake.' },
};

// ── tiny helper: play a sound file from /public/sounds/ ──────
const playNotificationSound = (src = '/sounds/order-alert.mp3') => {
  try {
    const audio = new Audio(src);
    audio.volume = 0.8;
    audio.play().catch((e) => console.warn('[Sound] Autoplay blocked:', e.message));
  } catch (e) {
    console.warn('[Sound] Could not play notification sound:', e.message);
  }
};

// ── In-app toast for users (shown when tab is ACTIVE) ────────
// Shown at top-center of screen, auto-dismisses after 5s.
// No OS permission needed. Tapping navigates to /orders.
const USER_TOAST_CONTAINER_ID = 'zap-user-toast-container';

const showUserInAppToast = (title, body) => {
  // Inject animation styles once
  if (!document.getElementById('zap-user-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'zap-user-toast-styles';
    style.textContent = `
      @keyframes zapUserToastIn {
        from { opacity: 0; transform: translateY(-16px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0)    scale(1);    }
      }
      @keyframes zapUserToastOut {
        from { opacity: 1; transform: translateY(0)    scale(1);    }
        to   { opacity: 0; transform: translateY(-10px) scale(0.95); }
      }
    `;
    document.head.appendChild(style);
  }

  // Get or create container (top-center)
  let container = document.getElementById(USER_TOAST_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = USER_TOAST_CONTAINER_ID;
    container.style.cssText = `
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
      min-width: 280px;
      max-width: 340px;
      width: 90vw;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.style.cssText = `
    background: #1a1a1a;
    color: #fff;
    border-radius: 14px;
    padding: 13px 16px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.12);
    pointer-events: all;
    cursor: pointer;
    animation: zapUserToastIn 0.35s cubic-bezier(0.22,1,0.36,1) both;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  // Split emoji from title text
  const emojiMatch = title.match(/^(\S+)\s(.+)$/);
  const emoji      = emojiMatch ? emojiMatch[1] : '📦';
  const titleText  = emojiMatch ? emojiMatch[2] : title;

  toast.innerHTML = `
    <div style="font-size:22px;line-height:1;flex-shrink:0;margin-top:1px;">${emoji}</div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:13px;font-weight:600;line-height:1.3;margin-bottom:3px;">${titleText}</div>
      <div style="font-size:12px;opacity:0.72;line-height:1.4;">${body}</div>
    </div>
    <div style="font-size:15px;opacity:0.45;flex-shrink:0;margin-top:1px;line-height:1;">✕</div>
  `;

  const dismiss = () => {
    toast.style.animation = 'zapUserToastOut 0.25s ease forwards';
    setTimeout(() => {
      toast.remove();
      const c = document.getElementById(USER_TOAST_CONTAINER_ID);
      if (c && c.children.length === 0) c.remove();
    }, 250);
  };

  toast.onclick = () => {
    dismiss();
    window.location.href = '/orders';
  };

  container.appendChild(toast);

  // Auto-dismiss after 5 seconds
  const timer = setTimeout(dismiss, 5000);
  toast.addEventListener('click', () => clearTimeout(timer), { once: true });
};

// ── OS notification via SW (only used when tab is BACKGROUNDED) ──
const showUserOSNotification = (title, body, orderId) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  navigator.serviceWorker.ready.then((reg) => {
    reg.showNotification(title, {
      body,
      icon:     '/logo192.png',
      badge:    '/badge-72.png',
      tag:      `order-tracking-${orderId}`,
      renotify: true,
      vibrate:  [200, 100, 200],
      data:     { url: '/orders', orderId, type: 'order_tracking' },
      actions: [
        { action: 'track',   title: '📦 Track Order' },
        { action: 'dismiss', title: '✕ Dismiss'      },
      ],
    });
  }).catch(() => {});
};

export const useNotifications = () => {
  const { user, userProfile } = useAuth();
  const { adminStore }        = useStore();
  const swMessageHandlerRef   = useRef(null);

  const resolvedStoreId = userProfile?.adminStoreId || adminStore?.id || null;
  const resolvedRole    = userProfile?.role || 'user';

  // ── Save FCM token to Firestore ───────────────────────────
  const saveToken = useCallback(async (token) => {
    if (!token || !user) return;
    const tokenDocId = btoa(token).replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
    await setDoc(doc(db, 'fcmTokens', tokenDocId), {
      token,
      userId:    user.uid,
      storeId:   resolvedStoreId,
      role:      resolvedRole,
      platform:  'web',
      userAgent: navigator.userAgent.slice(0, 100),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }, [user, resolvedStoreId, resolvedRole]);

  // ── Remove all tokens for this user ──────────────────────
  const removeToken = useCallback(async () => {
    if (!user) return;
    const snap = await getDocs(
      query(collection(db, 'fcmTokens'), where('userId', '==', user.uid))
    );
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }, [user]);

  // ── Request permission & get FCM token ───────────────────
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return false;
    if (!VAPID_KEY) {
      console.warn('[FCM] REACT_APP_FIREBASE_VAPID_KEY not set — push disabled');
      return false;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return false;

      // ✅ Do NOT call navigator.serviceWorker.register() here.
      // That creates a second competing registration on Android and causes
      // FCM tokens to be tied to the wrong SW scope, breaking push on Samsung.
      let swRegistration;
      try {
        swRegistration = await navigator.serviceWorker.ready;
      } catch {
        swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      }

      const messaging = getMessaging();
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      });

      if (token) {
        await saveToken(token);
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[FCM] requestPermission error:', err.message);
      return false;
    }
  }, [saveToken]);

  // ── Auto-request permission on login ─────────────────────
  useEffect(() => {
    if (!user || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      const t = setTimeout(() => requestPermission(), 3000);
      return () => clearTimeout(t);
    }
    if (Notification.permission === 'granted') {
      requestPermission(); // refresh / re-save token
    }
  }, [user?.uid, resolvedStoreId, requestPermission]);

  // ── Firestore realtime listener for USER order status changes ──
  //
  // Behaviour by tab state:
  //   ACTIVE     → in-app toast (dark pill at top of screen, like iOS)
  //                No OS notification — avoids Chrome spam flag
  //   BACKGROUND → OS notification via SW
  //                tag deduplication prevents double-fire with FCM SW
  //   CLOSED     → SW onBackgroundMessage handles it via FCM
  //
  // This is identical to how admin gets notified via onSnapshot.
  useEffect(() => {
    if (!user || resolvedRole !== 'user') return;

    const q = query(
      collection(db, 'orders'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const statusCache = {};

    const unsub = onSnapshot(q, (snapshot) => {
      snapshot.docs.forEach((docSnap) => {
        const order = docSnap.data();
        const curr  = order.status;
        const prev  = statusCache[docSnap.id];

        // Seed on first load — never fire on mount
        if (prev === undefined) {
          statusCache[docSnap.id] = curr;
          return;
        }

        if (prev === curr) return;

        statusCache[docSnap.id] = curr;

        const copy = USER_STATUS_COPY[curr];
        if (!copy) return;

        const title = `${copy.emoji} ${copy.title}`;
        const body  = copy.body;

        console.log(`[UserNotify] Order ${docSnap.id}: ${prev} → ${curr}`);

        if (document.visibilityState === 'visible') {
          // Tab is active — show in-app toast, no OS notification
          showUserInAppToast(title, body);
        } else {
          // Tab is backgrounded — show OS notification
          // FCM SW may also fire but same `tag` deduplicates them
          showUserOSNotification(title, body, docSnap.id);
        }

        // Always dispatch so OrderHistory refreshes live
        window.dispatchEvent(new CustomEvent('zap:order-status-changed', {
          detail: { orderId: docSnap.id, status: curr },
        }));
      });
    }, (err) => {
      console.error('[UserNotify] onSnapshot error:', err.message);
    });

    return () => unsub();
  }, [user?.uid, resolvedRole]);

  // ── Foreground FCM messages (tab OPEN) ───────────────────
  // Users: onSnapshot handles everything — FCM just dispatches
  //   the refresh event as a safety net.
  // Admins: plays sound + shows OS notification as usual.
  useEffect(() => {
    if (!user || !('Notification' in window)) return;
    let unsub;
    try {
      const messaging = getMessaging();
      unsub = onMessage(messaging, (payload) => {
        const { title, body } = payload.notification || {};
        const data = payload.data || {};

        // User — just refresh OrderHistory; toast already shown by onSnapshot
        if (data.type === 'order_tracking') {
          window.dispatchEvent(new CustomEvent('zap:order-status-changed', {
            detail: { orderId: data.orderId, status: data.status },
          }));
          return;
        }

        // Admin — loud sound + OS notification
        playNotificationSound('/sounds/order-alert.mp3');
        if (Notification.permission === 'granted') {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(title || '🛍️ New Order – ZAP Delivery', {
              body,
              icon:     '/logo192.png',
              tag:      data.orderId || 'zap',
              renotify: true,
              data:     { url: '/admin/orders', type: 'new_order' },
            });
          }).catch(() => {
            try {
              const n = new Notification(title || '🛍️ New Order – ZAP Delivery', { body, icon: '/logo192.png' });
              n.onclick = () => { window.focus(); window.location.href = '/admin/orders'; };
            } catch { /* ignore */ }
          });
        }
      });
    } catch { /* messaging not supported */ }

    return () => { if (unsub) unsub(); };
  }, [user?.uid]);

  // ── Listen for messages posted by the service worker ──────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handler = (event) => {
      if (event.data?.type === 'NEW_ORDER') {
        playNotificationSound('/sounds/order-alert.mp3');
        window.dispatchEvent(new CustomEvent('zap:new-order', { detail: event.data }));
      }
      if (event.data?.type === 'ORDER_STATUS_CHANGED') {
        window.dispatchEvent(new CustomEvent('zap:order-status-changed', {
          detail: { orderId: event.data.orderId },
        }));
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    swMessageHandlerRef.current = handler;

    return () => {
      navigator.serviceWorker.removeEventListener('message', handler);
    };
  }, []);

  return { requestPermission, removeToken };
};