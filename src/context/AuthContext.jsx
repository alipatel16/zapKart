import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider, facebookProvider, COLLECTIONS } from '../firebase';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchUserProfile = async (uid) => {
    const ref = doc(db, COLLECTIONS.USERS, uid);
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
    const ref = doc(db, COLLECTIONS.USERS, firebaseUser.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const profile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || extra.displayName || '',
        photoURL: firebaseUser.photoURL || '',
        phone: extra.phone || '',
        addresses: [],
        role: firebaseUser.email === process.env.REACT_APP_ADMIN_EMAIL ? 'admin' : 'user',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(ref, profile);
      setUserProfile(profile);
      setIsAdmin(profile.role === 'admin');
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
    const result = await signInWithPopup(auth, googleProvider);
    await createUserProfile(result.user);
    return result.user;
  };

  const loginWithFacebook = async () => {
    const result = await signInWithPopup(auth, facebookProvider);
    await createUserProfile(result.user);
    return result.user;
  };

  const loginWithEmail = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    await fetchUserProfile(result.user.uid);
    return result.user;
  };

  const registerWithEmail = async (email, password, displayName) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName });
    await createUserProfile(result.user, { displayName });
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
    const updated = [...addresses, newAddress];
    await updateUserProfile({ addresses: updated });
    return newAddress;
  };

  const updateAddress = async (addressId, data) => {
    if (!user || !userProfile) return;
    const updated = (userProfile.addresses || []).map((a) =>
      a.id === addressId ? { ...a, ...data } : a
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

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};
