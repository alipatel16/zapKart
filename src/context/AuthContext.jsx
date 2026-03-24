// ============================================================
// src/context/AuthContext.jsx
// ============================================================
import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
} from 'firebase/auth';
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
  deleteDoc,                                          // ← added for rate-limit cleanup
} from 'firebase/firestore';
import { auth, db, googleProvider, facebookProvider, COLLECTIONS } from '../firebase';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

// ── Login rate-limit constants ────────────────────────────────────────────────
const MAX_ATTEMPTS  = 3;          // failed attempts before block
const BLOCK_MINUTES = 10;         // how long the block lasts

// ── Rate-limit helpers (stored in Firestore loginAttempts/{emailKey}) ─────────

/**
 * Derive a Firestore-safe document key from an email address.
 * Lowercases and replaces non-alphanumeric characters with underscores.
 */
const emailKey = (email) => email.toLowerCase().replace(/[^a-z0-9]/g, '_');

/**
 * Check whether the email is currently blocked.
 * Throws auth/too-many-requests with the minutes-remaining if so.
 * Silently clears an expired block document.
 */
const checkLoginRateLimit = async (email) => {
  const ref  = doc(db, 'loginAttempts', emailKey(email));
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  const now  = Date.now();

  if (data.blockedUntil && data.blockedUntil.toMillis() > now) {
    const minsLeft = Math.ceil((data.blockedUntil.toMillis() - now) / 60_000);
    throw Object.assign(
      new Error(
        `Too many failed attempts. Try again in ${minsLeft} minute${minsLeft > 1 ? 's' : ''}.`,
      ),
      { code: 'auth/too-many-requests' },
    );
  }

  // Block has expired — clean up so the slate is fresh
  if (data.blockedUntil && data.blockedUntil.toMillis() <= now) {
    await deleteDoc(ref).catch(() => {});
  }
};

/**
 * Increment the failed-attempt counter for this email.
 * On the MAX_ATTEMPTS-th failure the document gets a blockedUntil timestamp.
 */
const recordFailedAttempt = async (email) => {
  const ref  = doc(db, 'loginAttempts', emailKey(email));
  const snap = await getDoc(ref);

  const attempts = (snap.exists() ? snap.data().attempts || 0 : 0) + 1;

  if (attempts >= MAX_ATTEMPTS) {
    const blockedUntil = new Date(Date.now() + BLOCK_MINUTES * 60_000);
    await setDoc(ref, { attempts, blockedUntil, updatedAt: serverTimestamp() });
  } else {
    await setDoc(
      ref,
      { attempts, blockedUntil: null, updatedAt: serverTimestamp() },
      { merge: true },
    );
  }
};

/**
 * Remove the attempt record on successful login so a legitimate user
 * starts fresh next time.
 */
const clearLoginAttempts = async (email) => {
  await deleteDoc(doc(db, 'loginAttempts', emailKey(email))).catch(() => {});
};

// ─────────────────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }) => {
  const [user, setUser]               = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [isAdmin, setIsAdmin]         = useState(false);

  const fetchUserProfile = async (uid) => {
    const ref  = doc(db, COLLECTIONS.USERS, uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      setUserProfile(data);
      setIsAdmin(data.role === 'admin');
      return data;
    }
    return null;
  };

  const createUserProfile = async (firebaseUser, extra = {}) => {
    const ref  = doc(db, COLLECTIONS.USERS, firebaseUser.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const profile = {
        uid:         firebaseUser.uid,
        email:       firebaseUser.email,
        displayName: firebaseUser.displayName || extra.displayName || '',
        photoURL:    firebaseUser.photoURL || '',
        phone:       extra.phone || '',
        addresses:   [],
        // ✅ SECURITY FIX: Role is always 'user' on creation.
        // Admin role must be assigned manually via Firebase Console or a
        // one-time admin script. Never trust the client to self-assign admin.
        // To promote yourself: Firestore Console → users → {your uid} → role → 'admin'
        role:      'user',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(ref, profile);
      setUserProfile(profile);
      setIsAdmin(false);
      return profile;
    }
    await updateDoc(ref, { updatedAt: serverTimestamp(), lastLogin: serverTimestamp() });
    return await fetchUserProfile(firebaseUser.uid);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await fetchUserProfile(firebaseUser.uid);
      } else {
        setUserProfile(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loginWithGoogle = async () => {
    // Google OAuth always returns a verified account — no email check needed.
    const result = await signInWithPopup(auth, googleProvider);
    await createUserProfile(result.user);
    return result.user;
  };

  const loginWithFacebook = async () => {
    // Facebook OAuth always returns a verified account — no email check needed.
    const result = await signInWithPopup(auth, facebookProvider);
    await createUserProfile(result.user);
    return result.user;
  };

  // ── Updated loginWithEmail — now with rate limiting ───────────────────────
  const loginWithEmail = async (email, password) => {
    // ✅ RATE LIMIT FIX: Check BEFORE calling Firebase so blocked users never
    // even hit Firebase Auth — this prevents brute-force attacks on accounts
    // while staying entirely within Firebase's free tier (no reCAPTCHA needed).
    await checkLoginRateLimit(email);

    let result;
    try {
      result = await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      // Only count credential errors as failed attempts — not network issues,
      // quota errors, etc. that are outside the user's control.
      if (
        err.code === 'auth/wrong-password'     ||
        err.code === 'auth/user-not-found'     ||
        err.code === 'auth/invalid-credential'
      ) {
        await recordFailedAttempt(email);
      }
      throw err;
    }

    // ✅ SECURITY FIX: Block unverified email/password accounts from logging in.
    // After registration, users receive a verification email. Until they click
    // the link, their account is locked out here — even if the password is correct.
    // Note: Google/Facebook users bypass this check entirely (they use signInWithPopup).
    if (!result.user.emailVerified) {
      await signOut(auth);
      await sendEmailVerification(result.user);
      throw Object.assign(
        new Error(
          'Please verify your email before logging in. We just resent the verification link — check your inbox and spam folder.',
        ),
        { code: 'auth/email-not-verified' },
      );
    }

    // Login success — clear any stored attempt counter
    await clearLoginAttempts(email);
    await fetchUserProfile(result.user.uid);
    return result.user;
  };

  const registerWithEmail = async (email, password, displayName) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName });
    // ✅ BOT PROTECTION: Send verification email immediately after signup.
    // Even if a bot creates an account, it can't verify the email — so it
    // can't log in, can't place orders, and can't access protected features.
    // Totally free with no limits — uses Firebase Auth's built-in email sending.
    await sendEmailVerification(result.user);
    await createUserProfile(result.user, { displayName });
    // Sign out immediately — user must verify email before they can use the app.
    await signOut(auth);
    return result.user;
  };

  const logout = () => signOut(auth);

  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  const updateUserProfile = async (data) => {
    if (!user) return;
    const ref = doc(db, COLLECTIONS.USERS, user.uid);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
    setUserProfile((prev) => ({ ...prev, ...data }));
  };

  const addAddress = async (address) => {
    if (!user || !userProfile) return;
    const addresses = userProfile.addresses || [];
    if (addresses.length >= 5) throw new Error('Maximum 5 addresses allowed');
    const newAddress = { id: Date.now().toString(), ...address };
    const updated   = [...addresses, newAddress];
    await updateUserProfile({ addresses: updated });
    return newAddress;
  };

  const updateAddress = async (addressId, data) => {
    if (!user || !userProfile) return;
    const updated = (userProfile.addresses || []).map((a) =>
      a.id === addressId ? { ...a, ...data } : a,
    );
    await updateUserProfile({ addresses: updated });
  };

  const deleteAddress = async (addressId) => {
    if (!user || !userProfile) return;
    const updated = (userProfile.addresses || []).filter((a) => a.id !== addressId);
    await updateUserProfile({ addresses: updated });
  };

  const value = {
    user,
    userProfile,
    loading,
    isAdmin,
    loginWithGoogle,
    loginWithFacebook,
    loginWithEmail,
    registerWithEmail,
    logout,
    resetPassword,
    updateUserProfile,
    addAddress,
    updateAddress,
    deleteAddress,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};