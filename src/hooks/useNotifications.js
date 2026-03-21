import { useEffect, useCallback } from 'react';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import {
  doc, setDoc, serverTimestamp, collection, query,
  where, getDocs, deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';

const VAPID_KEY = process.env.REACT_APP_FIREBASE_VAPID_KEY || '';

export const useNotifications = () => {
  const { user, userProfile } = useAuth();
  const { adminStore } = useStore();

  // Resolve the storeId for this session:
  // 1. Use adminStoreId from Firestore userProfile (persisted across sessions)
  // 2. Fall back to adminStore from StoreContext (set when admin selects store this session)
  // 3. null for regular users (they don't need store-scoped notifications)
  const resolvedStoreId = userProfile?.adminStoreId || adminStore?.id || null;
  const resolvedRole = userProfile?.role || 'user';

  const saveToken = useCallback(async (token) => {
    if (!token || !user) return;
    const tokenDocId = btoa(token).replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
    await setDoc(doc(db, 'fcmTokens', tokenDocId), {
      token,
      userId: user.uid,
      storeId: resolvedStoreId,
      role: resolvedRole,
      platform: 'web',
      userAgent: navigator.userAgent.slice(0, 100),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    console.log(`[FCM] Token saved — role: ${resolvedRole}, storeId: ${resolvedStoreId}`);
  }, [user, resolvedStoreId, resolvedRole]);

  const removeToken = useCallback(async () => {
    if (!user) return;
    const snap = await getDocs(
      query(collection(db, 'fcmTokens'), where('userId', '==', user.uid))
    );
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }, [user]);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return false;
    if (!VAPID_KEY) {
      console.warn('[FCM] REACT_APP_FIREBASE_VAPID_KEY not set in .env — push notifications disabled');
      return false;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return false;

      const sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const messaging = getMessaging();
      const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: sw });
      if (token) { await saveToken(token); return true; }
      return false;
    } catch (err) {
      console.warn('[FCM] requestPermission error:', err.message);
      return false;
    }
  }, [saveToken]);

  // Auto-run when user logs in
  useEffect(() => {
    if (!user) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      // Wait 3s so permission prompt doesn't fire immediately on page load
      const t = setTimeout(() => requestPermission(), 3000);
      return () => clearTimeout(t);
    }
    if (Notification.permission === 'granted') {
      // Already granted — refresh token (rotates periodically)
      requestPermission();
    }
  }, [user?.uid, resolvedStoreId]); // re-run when storeId changes (admin picks store)

  // Handle foreground messages (tab is open and active)
  useEffect(() => {
    if (!user || !('Notification' in window)) return;
    try {
      const messaging = getMessaging();
      const unsub = onMessage(messaging, (payload) => {
        const { title, body } = payload.notification || {};
        if (Notification.permission === 'granted') {
          new Notification(title || 'ZAP Delivery', {
            body,
            icon: '/logo192.png',
            tag: payload.data?.orderId || 'zap',
          });
        }
      });
      return unsub;
    } catch { /* messaging not supported in this browser */ }
  }, [user?.uid]);

  return { requestPermission, removeToken };
};