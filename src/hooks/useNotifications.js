// ============================================================
// src/hooks/useNotifications.js
// ============================================================
import { useEffect, useCallback, useRef } from 'react';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import {
  doc, setDoc, serverTimestamp, collection, query,
  where, getDocs, deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth }  from '../context/AuthContext';
import { useStore } from '../context/StoreContext';

const VAPID_KEY = process.env.REACT_APP_FIREBASE_VAPID_KEY || '';

// ── tiny helper: play a sound file from /public/sounds/ ──────
const playNotificationSound = (src = '/sounds/order-alert.mp3') => {
  try {
    const audio = new Audio(src);
    audio.volume = 0.8;
    audio.play().catch((e) => {
      console.warn('[Sound] Autoplay blocked:', e.message);
    });
  } catch (e) {
    console.warn('[Sound] Could not play notification sound:', e.message);
  }
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
      //
      // Instead, wait for the already-registered SW (registered in index.js
      // via serviceWorkerRegistration.js) to become active, then use it.
      let swRegistration;
      try {
        swRegistration = await navigator.serviceWorker.ready;
      } catch {
        // Fallback: explicitly register the messaging SW
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
  }, [user?.uid, resolvedStoreId]); // re-run when admin switches store

  // ── Foreground FCM messages (tab is OPEN & active) ───────
  // Branches on data.type to handle admin and user notifications separately.
  useEffect(() => {
    if (!user || !('Notification' in window)) return;
    let unsub;
    try {
      const messaging = getMessaging();
      unsub = onMessage(messaging, (payload) => {
        const { title, body } = payload.notification || {};
        const data = payload.data || {};

        // ── User: order tracking / delivery status update ───────────────────
        // Shows a quiet notification and fires a custom DOM event so
        // OrderHistory can refresh its list live without a manual pull.
        // Does NOT play the loud order-alert sound — that's for admins only.
        if (data.type === 'order_tracking') {
          if (Notification.permission === 'granted') {
            navigator.serviceWorker.ready.then((registration) => {
              registration.showNotification(title || '📦 Order Update', {
                body:     body || 'Your order status has been updated.',
                icon:     '/logo192.png',
                tag:      `order-tracking-${data.orderId}`,
                renotify: true,
                data:     { url: '/orders', orderId: data.orderId, type: 'order_tracking' },
              });
            }).catch(() => {
              try {
                const n = new Notification(title || '📦 Order Update', { body, icon: '/logo192.png' });
                n.onclick = () => { window.focus(); window.location.href = '/orders'; };
              } catch { /* ignore */ }
            });
          }

          // Dispatch custom event so OrderHistory.jsx can refresh live
          window.dispatchEvent(new CustomEvent('zap:order-status-changed', {
            detail: { orderId: data.orderId, status: data.status },
          }));
          return;
        }

        // ── Admin: new order alert ──────────────────────────────────────────
        // Plays the loud alert sound and shows an OS notification.
        playNotificationSound('/sounds/order-alert.mp3');

        if (Notification.permission === 'granted') {
          // ✅ Use showNotification() via SW instead of new Notification().
          // On installed Android PWAs, new Notification() is blocked.
          // showNotification() via the SW works reliably on both Android & iOS.
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
    } catch { /* messaging not supported in this browser */ }

    return () => { if (unsub) unsub(); };
  }, [user?.uid]);

  // ── Listen for messages posted by the service worker ──────
  // The SW sends NEW_ORDER when admin clicks a background notification
  // and ORDER_STATUS_CHANGED when a user clicks their tracking notification.
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