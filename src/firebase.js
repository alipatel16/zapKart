import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, FacebookAuthProvider } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

export const facebookProvider = new FacebookAuthProvider();
facebookProvider.addScope('email');

export default app;

// ============================================================
// FIRESTORE COLLECTION NAMES - Single source of truth
// ============================================================
export const COLLECTIONS = {
  USERS: 'users',
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  ORDERS: 'orders',
  BANNERS: 'banners',
  COUPONS: 'coupons',
  PURCHASE: 'purchases',
  INVENTORY: 'inventory',
  SETTINGS: 'settings',
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
