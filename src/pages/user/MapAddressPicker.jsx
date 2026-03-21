import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Typography, IconButton, InputBase,
  Paper, CircularProgress, Button,
} from '@mui/material';
import { ArrowBack, Search, LocationOn, Close, MyLocation } from '@mui/icons-material';
import { useStore, getDistanceKm } from '../../context/StoreContext';
import { ZAP_COLORS } from '../../theme';

const GMAP_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

// ── How far pin must move before we re-reverse-geocode ────────────────────
const REVERSE_THRESHOLD_KM = 0.03; // ~30 metres

// ── Load Google Maps JS API once (with Places library) ───────────────────
let gmapsPromise = null;
const loadGoogleMaps = () => {
  if (gmapsPromise) return gmapsPromise;
  gmapsPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.places) { resolve(); return; }
    const cb = '__zapGmapsReady';
    window[cb] = () => { resolve(); delete window[cb]; };
    const s = document.createElement('script');
    s.src     = `https://maps.googleapis.com/maps/api/js?key=${GMAP_KEY}&libraries=places&callback=${cb}&loading=async`;
    s.async   = true;
    s.defer   = true;
    s.onerror = () => reject(new Error('Google Maps failed to load. Check REACT_APP_GOOGLE_MAPS_KEY in .env'));
    document.head.appendChild(s);
  });
  return gmapsPromise;
};

// ─────────────────────────────────────────────────────────────────────────────
const MapAddressPicker = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userLocation, allStores, SERVICE_RADIUS_KM } = useStore();

  const from = new URLSearchParams(location.search).get('from') || 'checkout';

  // Map DOM ref + instance
  const mapDivRef      = useRef(null);
  const mapInstanceRef = useRef(null);

  // Google API service instances (created once after Maps loads)
  const geocoderRef        = useRef(null);
  const autocompleteRef    = useRef(null); // AutocompleteService instance
  const sessionTokenRef    = useRef(null); // current session token

  // Refs so idle listener never goes stale
  const allStoresRef       = useRef(allStores);
  const serviceRadiusRef   = useRef(SERVICE_RADIUS_KM);
  useEffect(() => { allStoresRef.current     = allStores;       }, [allStores]);
  useEffect(() => { serviceRadiusRef.current = SERVICE_RADIUS_KM; }, [SERVICE_RADIUS_KM]);

  // Last reverse-geocoded position (to skip near-identical calls)
  const lastReversedRef = useRef(null);
  const reverseTimer    = useRef(null);
  const searchTimer     = useRef(null);

  // ── Component state ───────────────────────────────────────────────────────
  const [mapReady,    setMapReady]    = useState(false);
  const [mapError,    setMapError]    = useState('');
  const [center,      setCenter]      = useState({
    lat: userLocation?.lat || 20.5937,
    lng: userLocation?.lng || 78.9629,
  });
  const [areaName,    setAreaName]    = useState('');
  const [cityName,    setCityName]    = useState('');
  const [nearbyStore, setNearbyStore] = useState(null);
  const [isReversing, setIsReversing] = useState(false);

  const [searchText,    setSearchText]    = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults,   setShowResults]   = useState(false);
  const [searching,     setSearching]     = useState(false);

  // ── Rotate session token — call this after user picks a result ───────────
  // Each token groups all autocomplete requests in one search into a single
  // billable event. Rotating after selection starts a fresh billing session.
  const rotateSessionToken = useCallback(() => {
    if (!window.google?.maps?.places) return;
    sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
  }, []);

  // ── Stable reverse-geocode (reads from refs, created once) ───────────────
  const doReverse = useCallback(async (lat, lng) => {
    // Skip if pin hasn't moved meaningfully
    if (lastReversedRef.current) {
      const moved = getDistanceKm(lat, lng, lastReversedRef.current.lat, lastReversedRef.current.lng);
      if (moved < REVERSE_THRESHOLD_KM) return;
    }
    lastReversedRef.current = { lat, lng };
    setIsReversing(true);

    // ── Google Geocoder reverse lookup ────────────────────────────────────
    const geocoder = geocoderRef.current;
    if (!geocoder) { setIsReversing(false); return; }

    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results?.length) {
        // Walk the address_components for suburb/area and city
        let area = '';
        let city = '';

        for (const result of results) {
          const comps = result.address_components || [];

          for (const comp of comps) {
            const types = comp.types;

            // Area: sublocality_level_2 > sublocality_level_1 > sublocality > neighborhood
            if (!area && (
              types.includes('sublocality_level_2') ||
              types.includes('sublocality_level_1') ||
              types.includes('sublocality') ||
              types.includes('neighborhood')
            )) {
              area = comp.long_name;
            }

            // City: locality > administrative_area_level_2
            if (!city && (
              types.includes('locality') ||
              types.includes('administrative_area_level_2')
            )) {
              city = comp.long_name;
            }
          }

          if (area && city) break; // found both, stop
        }

        // Fallback: use the formatted address first line
        if (!area) area = results[0].formatted_address.split(',')[0];

        setAreaName(area || 'Unknown area');
        setCityName(city || '');
      } else {
        setAreaName('Unknown area');
        setCityName('');
      }

      // Find nearest store
      let found = null;
      for (const store of allStoresRef.current) {
        if (!store.lat || !store.lng) continue;
        if (getDistanceKm(lat, lng, store.lat, store.lng) <= (store.deliveryRadiusKm || serviceRadiusRef.current)) {
          found = store;
          break;
        }
      }
      setNearbyStore(found);
      setIsReversing(false);
    });
  }, []); // empty deps — reads everything from refs

  // ── Init Google Map (runs once) ───────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    const startLat = userLocation?.lat || 20.5937;
    const startLng = userLocation?.lng || 78.9629;

    loadGoogleMaps()
      .then(() => {
        if (!alive || !mapDivRef.current || mapInstanceRef.current) return;

        const google = window.google;

        // Instantiate reusable service objects
        geocoderRef.current     = new google.maps.Geocoder();
        autocompleteRef.current = new google.maps.places.AutocompleteService();
        rotateSessionToken(); // create the first session token

        const map = new google.maps.Map(mapDivRef.current, {
          center:            { lat: startLat, lng: startLng },
          zoom:              17,
          disableDefaultUI:  false,
          zoomControl:       true,
          mapTypeControl:    false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling:   'greedy', // single-finger pan on mobile
          clickableIcons:    true,
        });

        // idle fires when map finishes panning/zooming
        map.addListener('idle', () => {
          const c   = map.getCenter();
          const lat = c.lat();
          const lng = c.lng();
          setCenter({ lat, lng });
          clearTimeout(reverseTimer.current);
          reverseTimer.current = setTimeout(() => doReverse(lat, lng), 500);
        });

        mapInstanceRef.current = map;
        setMapReady(true);
        doReverse(startLat, startLng);
      })
      .catch((err) => { if (alive) setMapError(err.message); });

    return () => {
      alive = false;
      clearTimeout(reverseTimer.current);
      clearTimeout(searchTimer.current);
      mapInstanceRef.current  = null;
      geocoderRef.current     = null;
      autocompleteRef.current = null;
    };
  }, []); // runs once

  // ── Autocomplete search with debounce ─────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchTimer.current);
    const q = searchText.trim();
    if (q.length < 2) { setSearchResults([]); setShowResults(false); return; }

    searchTimer.current = setTimeout(() => {
      const svc = autocompleteRef.current;
      if (!svc) return;
      setSearching(true);

      // Bias results to the current map viewport
      const map = mapInstanceRef.current;
      const request = {
        input:        q,
        // Restrict to India
        componentRestrictions: { country: 'in' },
        sessionToken: sessionTokenRef.current,
        // If map is ready, bias to its current bounds
        ...(map ? { bounds: map.getBounds() || undefined } : {}),
      };

      svc.getPlacePredictions(request, (predictions, status) => {
        setSearching(false);
        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions?.length) {
          setSearchResults(predictions.map((p) => ({
            placeId:     p.place_id,
            // main_text is the primary name (street/area), secondary is city etc.
            short:       p.structured_formatting?.main_text || p.description,
            secondary:   p.structured_formatting?.secondary_text || '',
            description: p.description,
          })));
          setShowResults(true);
        } else {
          setSearchResults([]);
          setShowResults(false);
        }
      });
    }, 400);
  }, [searchText]);

  // ── User picks a suggestion — resolve Place ID to lat/lng ────────────────
  const handleSelectResult = useCallback((result) => {
    if (!mapInstanceRef.current || !geocoderRef.current) return;

    // Rotate token BEFORE geocoding — this closes the session and
    // the Place Details/Geocode call is billed as the session-terminating call
    rotateSessionToken();

    geocoderRef.current.geocode({ placeId: result.placeId }, (res, status) => {
      if (status === 'OK' && res?.[0]) {
        const loc = res[0].geometry.location;
        lastReversedRef.current = null; // force fresh reverse on next idle
        mapInstanceRef.current.setCenter(loc);
        mapInstanceRef.current.setZoom(18);
      }
    });

    setSearchText(result.short);
    setShowResults(false);
  }, [rotateSessionToken]);

  // ── GPS re-center ─────────────────────────────────────────────────────────
  const handleMyLocation = () => {
    if (!navigator.geolocation || !mapInstanceRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastReversedRef.current = null;
        mapInstanceRef.current.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        mapInstanceRef.current.setZoom(18);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // ── Confirm ────────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    navigate('/address-details', {
      state: { lat: center.lat, lng: center.lng, area: areaName, city: cityName, from },
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ position: 'fixed', inset: 0, zIndex: 1300, display: 'flex', flexDirection: 'column', background: '#eee' }}>

      {/* ── Header ── */}
      <Box sx={{
        background: '#fff', px: 1.5, py: 1.2,
        display: 'flex', alignItems: 'center', gap: 1,
        boxShadow: '0 1px 6px rgba(0,0,0,0.10)',
        position: 'relative', zIndex: 1400, flexShrink: 0,
      }}>
        <IconButton size="small" onClick={() => navigate(-1)}><ArrowBack /></IconButton>
        <Typography fontWeight={800} fontSize="1.05rem" fontFamily="'Syne', sans-serif">
          Select Your Location
        </Typography>
      </Box>

      {/* ── Search bar ── */}
      <Box sx={{
        background: '#fff', px: 1.5, pt: 1.2, pb: 1.2,
        position: 'relative', zIndex: 1400, overflow: 'visible',
        flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <Paper elevation={0} sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          border: `1.5px solid ${ZAP_COLORS.border}`,
          borderRadius: 3, px: 1.5, py: 0.8,
          '&:focus-within': { borderColor: ZAP_COLORS.primary },
          transition: 'border-color 0.2s',
        }}>
          {searching
            ? <CircularProgress size={18} sx={{ color: ZAP_COLORS.primary, flexShrink: 0 }} />
            : <Search sx={{ color: ZAP_COLORS.textMuted, fontSize: 20, flexShrink: 0 }} />}
          <InputBase
            placeholder="Search street, area, landmark..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            fullWidth sx={{ fontSize: '0.9rem' }}
          />
          {searchText && (
            <IconButton size="small" onClick={() => { setSearchText(''); setShowResults(false); }}>
              <Close fontSize="small" />
            </IconButton>
          )}
        </Paper>

        {/* Autocomplete dropdown */}
        {showResults && searchResults.length > 0 && (
          <Paper elevation={4} sx={{
            position: 'absolute', left: 12, right: 12, top: 'calc(100% - 2px)',
            borderRadius: 2, overflow: 'hidden', zIndex: 1500, maxHeight: 300, overflowY: 'auto',
          }}>
            {searchResults.map((r, i) => (
              <Box key={r.placeId} onClick={() => handleSelectResult(r)} sx={{
                px: 2, py: 1.4, cursor: 'pointer',
                display: 'flex', alignItems: 'flex-start', gap: 1.2,
                borderBottom: i < searchResults.length - 1 ? `1px solid ${ZAP_COLORS.border}` : 'none',
                '&:hover': { background: `${ZAP_COLORS.primary}08` },
              }}>
                <LocationOn sx={{ color: ZAP_COLORS.primary, fontSize: 16, mt: 0.4, flexShrink: 0 }} />
                <Box>
                  <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3, fontSize: '0.87rem' }}>
                    {r.short}
                  </Typography>
                  {r.secondary && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                      {r.secondary}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}

            {/* Required Google attribution */}
            <Box sx={{ px: 2, py: 0.8, display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${ZAP_COLORS.border}` }}>
              <Box component="img"
                src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png"
                alt="Powered by Google"
                sx={{ height: 14, opacity: 0.7 }}
              />
            </Box>
          </Paper>
        )}
      </Box>

      {/* ── Map ── */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <Box ref={mapDivRef} sx={{ position: 'absolute', inset: 0 }} />

        {/* Loading */}
        {!mapReady && !mapError && (
          <Box sx={{ position: 'absolute', inset: 0, zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
            <Box sx={{ textAlign: 'center' }}>
              <CircularProgress sx={{ color: ZAP_COLORS.primary, mb: 1.5 }} />
              <Typography variant="body2" color="text.secondary">Loading map…</Typography>
            </Box>
          </Box>
        )}

        {/* Error */}
        {mapError && (
          <Box sx={{ position: 'absolute', inset: 0, zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', p: 3, textAlign: 'center' }}>
            <Box>
              <Typography variant="body1" fontWeight={700} color="error" mb={1}>Map failed to load</Typography>
              <Typography variant="body2" color="text.secondary" mb={1}>{mapError}</Typography>
              <Typography variant="caption" color="text.secondary">
                Ensure REACT_APP_GOOGLE_MAPS_KEY is set and Maps JavaScript API + Places API are enabled in Google Cloud Console.
              </Typography>
            </Box>
          </Box>
        )}

        {/* Fixed centre pin */}
        <Box sx={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -100%)',
          zIndex: 900, display: 'flex', flexDirection: 'column',
          alignItems: 'center', pointerEvents: 'none',
        }}>
          <Paper elevation={4} sx={{
            px: 2, py: 1, borderRadius: 2.5, mb: 0.8, background: '#fff', textAlign: 'center',
            border: `1.5px solid ${ZAP_COLORS.primary}25`, minWidth: 210,
          }}>
            <Typography fontWeight={700} fontSize="0.78rem">Order will be delivered here</Typography>
            <Typography variant="caption" color="text.secondary" fontSize="0.7rem" display="block">
              Place the pin to your exact location
            </Typography>
          </Paper>
          <Box sx={{
            width: 34, height: 34, borderRadius: '50% 50% 50% 4px', transform: 'rotate(-45deg)',
            background: `linear-gradient(135deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.primaryDark || '#e55a2b'})`,
            boxShadow: `0 4px 14px ${ZAP_COLORS.primary}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Box sx={{ width: 13, height: 13, borderRadius: '50%', background: '#fff', transform: 'rotate(45deg)' }} />
          </Box>
          <Box sx={{ width: 10, height: 5, borderRadius: '50%', background: 'rgba(0,0,0,0.18)', mt: 0.5 }} />
        </Box>

        {/* My Location FAB */}
        <Box sx={{ position: 'absolute', right: 16, bottom: 100, zIndex: 900 }}>
          <Paper elevation={3} onClick={handleMyLocation} sx={{
            width: 44, height: 44, borderRadius: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', '&:hover': { background: `${ZAP_COLORS.primary}10` },
          }}>
            <MyLocation sx={{ color: ZAP_COLORS.primary, fontSize: 20 }} />
          </Paper>
        </Box>
      </Box>

      {/* ── Footer ── */}
      <Box sx={{
        background: '#fff', px: 2, pt: 2, pb: 2,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
        flexShrink: 0, position: 'relative', zIndex: 1400,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.2, mb: 1.5 }}>
          <LocationOn sx={{ color: ZAP_COLORS.primary, mt: 0.15, flexShrink: 0, fontSize: 22 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {isReversing ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={13} sx={{ color: ZAP_COLORS.primary }} />
                <Typography variant="body2" color="text.secondary" fontSize="0.85rem">Detecting location…</Typography>
              </Box>
            ) : (
              <>
                <Typography fontWeight={700} fontSize="1rem" noWrap>{areaName || '—'}</Typography>
                {cityName && <Typography variant="caption" color="text.secondary">{cityName}</Typography>}
              </>
            )}
          </Box>
        </Box>

        {!nearbyStore && !isReversing && areaName && (
          <Box sx={{ py: 0.9, px: 1.5, borderRadius: 2, mb: 1.5, background: '#FFF5F2', border: `1px solid ${ZAP_COLORS.primary}35` }}>
            <Typography variant="caption" sx={{ color: ZAP_COLORS.primary, fontWeight: 600, fontSize: '0.75rem' }}>
              ⚠️ We don't deliver here yet — move the map to a serviceable area.
            </Typography>
          </Box>
        )}

        {nearbyStore && !isReversing && (
          <Box sx={{ py: 0.9, px: 1.5, borderRadius: 2, mb: 1.5, background: '#F0FAF6', border: '1px solid #06D6A030' }}>
            <Typography variant="caption" sx={{ color: '#06D6A0', fontWeight: 600, fontSize: '0.75rem' }}>
              ✅ Delivering from {nearbyStore.name}
            </Typography>
          </Box>
        )}

        <Button
          fullWidth variant="contained" size="large"
          disabled={!nearbyStore || isReversing}
          onClick={handleConfirm}
          sx={{ borderRadius: 3, py: 1.5, fontWeight: 700, fontSize: '1rem', fontFamily: "'Syne', sans-serif" }}
        >
          Confirm Location
        </Button>
      </Box>
    </Box>
  );
};

export default MapAddressPicker;