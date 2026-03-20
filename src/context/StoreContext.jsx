import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';

const StoreContext = createContext(null);

export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
};

// Haversine distance formula — returns km between two lat/lng points
export const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const SERVICE_RADIUS_KM = 2;
const LOCATION_CACHE_KEY = 'zap_user_location';
const ADMIN_STORE_KEY = 'zap_admin_store';

export const StoreProvider = ({ children }) => {
  // ----- USER SIDE -----
  const [userLocation, setUserLocation] = useState(() => {
    try {
      const cached = localStorage.getItem(LOCATION_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [locationLoading, setLocationLoading] = useState(!userLocation);
  const [locationError, setLocationError] = useState(null);
  const [locationPermission, setLocationPermission] = useState('prompt'); // 'granted'|'denied'|'prompt'

  const [allStores, setAllStores] = useState([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [nearestStore, setNearestStore] = useState(null); // store within 2km
  const [userSelectedStore, setUserSelectedStore] = useState(null); // manually chosen store

  // Active store for user = manually selected OR auto-detected nearest
  const activeUserStore = userSelectedStore || nearestStore;

  // ----- ADMIN SIDE -----
  const [adminStore, setAdminStoreState] = useState(() => {
    try {
      const cached = localStorage.getItem(ADMIN_STORE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });

  const setAdminStore = (store) => {
    setAdminStoreState(store);
    if (store) localStorage.setItem(ADMIN_STORE_KEY, JSON.stringify(store));
    else localStorage.removeItem(ADMIN_STORE_KEY);
  };

  // ----- Fetch all active stores once -----
  useEffect(() => {
    const fetchStores = async () => {
      setStoresLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, COLLECTIONS.STORES), where('active', '==', true))
        );
        const stores = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAllStores(stores);
      } catch (err) {
        console.error('Failed to fetch stores:', err);
      } finally {
        setStoresLoading(false);
      }
    };
    fetchStores();
  }, []);

  // ----- Find nearest store whenever location or stores change -----
  useEffect(() => {
    if (!userLocation || !allStores.length) {
      setNearestStore(null);
      return;
    }
    let closest = null;
    let closestDist = Infinity;

    for (const store of allStores) {
      if (!store.lat || !store.lng) continue;
      const dist = getDistanceKm(userLocation.lat, userLocation.lng, store.lat, store.lng);
      if (dist <= SERVICE_RADIUS_KM && dist < closestDist) {
        closest = { ...store, distanceKm: dist };
        closestDist = dist;
      }
    }
    setNearestStore(closest);
    // If manually selected store is no longer in range, clear it
    if (userSelectedStore) {
      const dist = getDistanceKm(userLocation.lat, userLocation.lng, userSelectedStore.lat, userSelectedStore.lng);
      if (dist > SERVICE_RADIUS_KM) setUserSelectedStore(null);
    }
  }, [userLocation, allStores]);

  // ----- Request GPS location -----
  const requestLocation = useCallback(() => {
    setLocationLoading(true);
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      setLocationLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(loc));
        setLocationPermission('granted');
        setLocationLoading(false);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setLocationPermission('denied');
        setLocationError(err.message);
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  // Auto-request on mount if no cached location
  useEffect(() => {
    if (!userLocation) requestLocation();
    else setLocationLoading(false);
  }, []);

  // ----- Manually set location (from search / map picker) -----
  const setManualLocation = useCallback((lat, lng, label = '') => {
    const loc = { lat, lng, label };
    setUserLocation(loc);
    localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(loc));
    setUserSelectedStore(null); // reset manual store selection
  }, []);

  // ----- Get stores near a location (for location picker UI) -----
  const getStoresNearLocation = useCallback((lat, lng) => {
    return allStores
      .map((s) => ({ ...s, distanceKm: getDistanceKm(lat, lng, s.lat, s.lng) }))
      .filter((s) => s.distanceKm <= SERVICE_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [allStores]);

  const value = {
    // User
    userLocation,
    locationLoading,
    locationError,
    locationPermission,
    requestLocation,
    setManualLocation,

    // Stores
    allStores,
    storesLoading,
    nearestStore,
    activeUserStore,
    userSelectedStore,
    setUserSelectedStore,
    getStoresNearLocation,
    SERVICE_RADIUS_KM,

    // Admin
    adminStore,
    setAdminStore,

    // Helper — is user in service area?
    isInServiceArea: !!activeUserStore,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};
