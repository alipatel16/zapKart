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
      // Autoplay blocked before user interaction — ignore silently
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

  // Resolve the storeId for this session:
  // 1. adminStoreId from Firestore userProfile (persisted across sessions)
  // 2. adminStore from StoreContext (set when admin selects store this session)
  // 3. null for regular users
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
    console.log(`[FCM] Token saved — role: ${resolvedRole}, storeId: ${resolvedStoreId}`);
  }, [user, resolvedStoreId, resolvedRole]);

  // ── Remove all tokens for this user ──────────────────────
  const removeToken = useCallback(async () => {
    if (!user) return;
    const snap = await getDocs(
      query(collection(db, 'fcmTokens'), where('userId', '==', user.uid))
    );
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }, [user]);

  // ── Request permission & register service worker ──────────
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return false;
    if (!VAPID_KEY) {
      console.warn('[FCM] REACT_APP_FIREBASE_VAPID_KEY not set — push disabled');
      return false;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return false;

      const sw        = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const messaging = getMessaging();
      const token     = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: sw });
      if (token) { await saveToken(token); return true; }
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
      requestPermission(); // refresh token
    }
  }, [user?.uid, resolvedStoreId]); // re-run when admin switches store

  // ── Foreground FCM messages (tab is OPEN & active) ───────
  // Shows an in-browser Notification AND plays the alert sound.
  useEffect(() => {
    if (!user || !('Notification' in window)) return;
    let unsub;
    try {
      const messaging = getMessaging();
      unsub = onMessage(messaging, (payload) => {
        const { title, body } = payload.notification || {};

        // Play sound 🔔
        playNotificationSound('/sounds/order-alert.mp3');

        // Show OS notification (even though tab is active)
        if (Notification.permission === 'granted') {
          const n = new Notification(title || '🛍️ New Order – ZAP Delivery', {
            body,
            icon:     '/logo192.png',
            tag:      payload.data?.orderId || 'zap',
            renotify: true,
          });

          // Click → focus the admin orders tab
          n.onclick = () => {
            window.focus();
            window.location.href = '/admin/orders';
          };
        }
      });
    } catch { /* messaging not supported in this browser */ }

    return () => { if (unsub) unsub(); };
  }, [user?.uid]);

  // ── Listen for messages posted by the service worker ──────
  // The SW sends { type: 'NEW_ORDER', orderId } when admin clicks
  // a background notification and the existing admin tab gets focused.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handler = (event) => {
      if (event.data?.type === 'NEW_ORDER') {
        // Play sound so admin knows which notification was clicked
        playNotificationSound('/sounds/order-alert.mp3');
        // You can also trigger a state refresh here via a custom event:
        window.dispatchEvent(new CustomEvent('zap:new-order', { detail: event.data }));
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