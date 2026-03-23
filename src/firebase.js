// ============================================================
// src/firebase.js
// ============================================================
import { initializeApp }                                      from 'firebase/app';
import { getFirestore }                                       from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, FacebookAuthProvider }  from 'firebase/auth';
import { getStorage }                                         from 'firebase/storage';
import { getAnalytics }                                       from 'firebase/analytics';
import { getPerformance }                                     from 'firebase/performance';
import { initializeAppCheck, ReCaptchaV3Provider }            from 'firebase/app-check';

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

// ── App Check ─────────────────────────────────────────────────────────────────
//
// HOW IT WORKS:
//   Every call your app makes to Firestore / Storage / Functions is accompanied
//   by a short-lived App Check token. Firebase rejects requests without a valid
//   token once enforcement is turned on in the console.
//
// DEVELOPMENT (localhost):
//   Firebase reads window.FIREBASE_APPCHECK_DEBUG_TOKEN and accepts it as a
//   valid token so you can develop normally without reCAPTCHA.
//   → Set REACT_APP_APPCHECK_DEBUG_TOKEN in .env.local (gitignored).
//   → Register that same token in Firebase Console → App Check → Apps → your app
//     → Add debug token.
//   → NEVER commit this token or put it in .env (only .env.local).
//
// PRODUCTION:
//   Uses reCAPTCHA v3 which runs silently in the background.
//   → Create a reCAPTCHA v3 site key at https://www.google.com/recaptcha/admin
//     (choose "reCAPTCHA v3", add your production domain).
//   → Set REACT_APP_RECAPTCHA_SITE_KEY in your hosting env vars (Render/Vercel/etc).
//   → In Firebase Console → App Check → each service → click "Enforce".


if (process.env.NODE_ENV !== 'production') {
  // Must be set before initializeAppCheck is called.
  // If the env var is missing, passing `true` tells Firebase to auto-generate
  // a token and print it to the console so you can register it.
  window.FIREBASE_APPCHECK_DEBUG_TOKEN =
    process.env.REACT_APP_APPCHECK_DEBUG_TOKEN || true;
}

const recaptchaKey = process.env.REACT_APP_RECAPTCHA_SITE_KEY;

if (!recaptchaKey) {
  throw new Error("Missing REACT_APP_RECAPTCHA_SITE_KEY");
}

initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(recaptchaKey),
  isTokenAutoRefreshEnabled: true,
});

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
  USERS:      'users',
  PRODUCTS:   'products',
  CATEGORIES: 'categories',
  ORDERS:     'orders',
  BANNERS:    'banners',
  COUPONS:    'coupons',
  PURCHASE:   'purchases',
  INVENTORY:  'inventory',
  SETTINGS:   'settings',
  STORES:     'stores',
  FCM_TOKENS: 'fcmTokens',
};

// ============================================================
// FIRESTORE INDEXES REQUIRED (create in Firebase Console):
// orders: userId ASC, createdAt DESC
// orders: status ASC, createdAt DESC
// products: categoryId ASC, createdAt DESC
// products: isFeatured ASC, createdAt DESC
// products: isExclusive ASC, createdAt DESC
// products: isNewArrival ASC, createdAt DESC
// inventory: productId ASC, updatedAt DESC
// ============================================================