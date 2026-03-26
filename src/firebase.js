// ============================================================
// src/firebase.js
// ============================================================
import { initializeApp }                                      from 'firebase/app';
import { getFirestore }                                       from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, FacebookAuthProvider }  from 'firebase/auth';
import { getStorage }                                         from 'firebase/storage';
import { getAnalytics }                                       from 'firebase/analytics';
import { getPerformance }                                     from 'firebase/performance';

const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId:     process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

// ── Firebase services ─────────────────────────────────────────────────────────
export const db          = getFirestore(app);
export const auth        = getAuth(app);
export const storage     = getStorage(app);
export const analytics   = typeof window !== 'undefined' ? getAnalytics(app)   : null;
export const performance = typeof window !== 'undefined' ? getPerformance(app) : null;

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

export const facebookProvider = new FacebookAuthProvider();
facebookProvider.addScope('email');

export default app;

// ============================================================
// FIRESTORE COLLECTION NAMES — single source of truth
// ============================================================
export const COLLECTIONS = {
  USERS:           'users',
  PRODUCTS:        'products',         // Global product catalog (no storeId, no price, no stock)
  CATEGORIES:      'categories',
  ORDERS:          'orders',
  BANNERS:         'banners',
  COUPONS:         'coupons',
  PURCHASE:        'purchases',
  STORE_INVENTORY: 'storeInventory',   // Per-store stock, pricing, denormalized product info
  SETTINGS:        'settings',
  STORES:          'stores',
  FCM_TOKENS:      'fcmTokens',
};

// ============================================================
// FIRESTORE INDEXES REQUIRED (create in Firebase Console):
//
// products (global catalog):
//   categoryId ASC, name ASC
//   active ASC, createdAt DESC
//   categoryId ASC, active ASC, createdAt DESC
//   isFeatured ASC, active ASC, createdAt DESC
//   isExclusive ASC, active ASC, createdAt DESC
//   isNewArrival ASC, active ASC, createdAt DESC
//
// storeInventory (per-store stock/pricing):
//   storeId ASC, active ASC, createdAt DESC
//   storeId ASC, categoryId ASC, active ASC
//   storeId ASC, productId ASC
//   storeId ASC, isFeatured ASC, active ASC, createdAt DESC
//   storeId ASC, isExclusive ASC, active ASC, createdAt DESC
//   storeId ASC, isNewArrival ASC, active ASC, createdAt DESC
//   storeId ASC, stock ASC (for low-stock queries)
//
// purchases:
//   storeId ASC, createdAt DESC
//
// orders:
//   userId ASC, createdAt DESC
//   status ASC, createdAt DESC
//   storeId ASC, createdAt DESC
//   storeId ASC, status ASC, createdAt DESC
// ============================================================