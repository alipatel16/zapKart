import React, { useState } from 'react';
import {
  Box, Typography, Button, CircularProgress, Container,
  TextField, Paper, Alert, InputAdornment, Divider, Chip,
} from '@mui/material';
import {
  LocationOn, GpsFixed, SearchOutlined, Store, Home, Work, Place,
} from '@mui/icons-material';
import { useStore, getDistanceKm } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { ZAP_COLORS } from '../../theme';

// ── Geocode helper ───────────────────────────────────────────────────────────
const geocodeAddress = async (address) => {
  const BASE = 'https://nominatim.openstreetmap.org/search';
  const headers = { Accept: 'application/json', 'Accept-Language': 'en' };
  const queries = [
    `${BASE}?q=${encodeURIComponent(address)}&format=json&limit=5&countrycodes=in&addressdetails=1`,
    `${BASE}?q=${encodeURIComponent(address)}&format=json&limit=5&addressdetails=1`,
    `${BASE}?q=${encodeURIComponent(address + ', India')}&format=json&limit=5&addressdetails=1`,
  ];
  for (let i = 0; i < queries.length; i++) {
    try {
      const res = await fetch(queries[i], { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data.map((r) => ({
            label: r.display_name,
            shortLabel: r.display_name.split(',').slice(0, 3).join(',').trim(),
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
          }));
        }
      }
    } catch { /* try next */ }
    if (i < queries.length - 1) await new Promise((r) => setTimeout(r, 800));
  }
  return [];
};

// ── Address label icon ───────────────────────────────────────────────────────
const LabelIcon = ({ label }) => {
  const l = (label || '').toLowerCase();
  if (l === 'home')                   return <Home sx={{ fontSize: 16 }} />;
  if (l === 'office' || l === 'work') return <Work sx={{ fontSize: 16 }} />;
  return <Place sx={{ fontSize: 16 }} />;
};

// ── Saved addresses list ─────────────────────────────────────────────────────
const SavedAddressList = ({ addresses, allStores, SERVICE_RADIUS_KM, onSelect }) => {
  const withCoords    = addresses.filter((a) => a.lat && a.lng);
  const withoutCoords = addresses.filter((a) => !a.lat || !a.lng);

  if (!addresses.length) return null;

  return (
    <Box>
      <Divider sx={{ my: 2 }}>
        <Typography variant="caption" color="text.secondary">or use saved address</Typography>
      </Divider>

      {withCoords.map((addr) => {
        const servedByStore = allStores.find(
          (s) => getDistanceKm(parseFloat(addr.lat), parseFloat(addr.lng), s.lat, s.lng) <= SERVICE_RADIUS_KM,
        );

        return (
          <Box
            key={addr.id}
            onClick={() => servedByStore && onSelect(addr)}
            sx={{
              display: 'flex', alignItems: 'flex-start', gap: 1.5,
              p: 1.5, borderRadius: 2, mb: 1,
              border: `1.5px solid ${ZAP_COLORS.border}`,
              cursor: servedByStore ? 'pointer' : 'not-allowed',
              opacity: servedByStore ? 1 : 0.55,
              '&:hover': servedByStore
                ? { borderColor: ZAP_COLORS.primary, background: `${ZAP_COLORS.primary}06` }
                : {},
              transition: 'all 0.15s',
            }}
          >
            <Box sx={{
              width: 32, height: 32, borderRadius: 2, flexShrink: 0,
              background: `${ZAP_COLORS.primary}12`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: ZAP_COLORS.primary,
            }}>
              <LabelIcon label={addr.label} />
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', gap: 0.8, alignItems: 'center', mb: 0.2 }}>
                <Typography variant="body2" fontWeight={700}>{addr.label}</Typography>
                <Typography variant="caption" color="text.secondary">{addr.name}</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}{addr.city ? `, ${addr.city}` : ''}
              </Typography>
              {servedByStore ? (
                <Typography variant="caption" sx={{ color: '#16a34a', fontWeight: 600 }}>
                  ✅ Served by {servedByStore.name}
                </Typography>
              ) : (
                <Typography variant="caption" sx={{ color: ZAP_COLORS.error }}>
                  ❌ Not in service area
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}

      {/* Addresses without coordinates — informational only */}
      {withoutCoords.length > 0 && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            These addresses have no GPS data — search manually above to use them.
          </Typography>
          {withoutCoords.map((addr) => (
            <Box
              key={addr.id}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                p: 1.5, borderRadius: 2, mb: 1, opacity: 0.5,
                border: `1px dashed ${ZAP_COLORS.border}`,
              }}
            >
              <LocationOn sx={{ fontSize: 18, color: ZAP_COLORS.textMuted, flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {addr.label} — {addr.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                  {addr.line1}{addr.city ? `, ${addr.city}` : ''}
                </Typography>
              </Box>
              <Chip label="No GPS" size="small" sx={{ fontSize: '0.62rem', height: 18, flexShrink: 0 }} />
            </Box>
          ))}
        </>
      )}
    </Box>
  );
};

// ── Main gate ────────────────────────────────────────────────────────────────
const LocationGate = ({ children }) => {
  const {
    locationLoading, locationError, locationPermission,
    requestLocation, isInServiceArea,
    allStores, storesLoading,
    setManualLocation, userLocation,
    SERVICE_RADIUS_KM,
  } = useStore();

  const { userProfile } = useAuth();

  const [searchText, setSearchText]       = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]         = useState(false);
  const [searchError, setSearchError]     = useState('');

  // ── 1. Loading ─────────────────────────────────────────────────────────────
  if (locationLoading || storesLoading) {
    return (
      <Box sx={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(160deg, ${ZAP_COLORS.primary}15, #fff)`,
      }}>
        <Box sx={{
          width: 72, height: 72, borderRadius: 4,
          background: `linear-gradient(135deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.primaryDark})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          mb: 3, boxShadow: `0 12px 32px ${ZAP_COLORS.primary}40`,
          animation: 'pulse 1.5s ease-in-out infinite',
          '@keyframes pulse': {
            '0%': { transform: 'scale(1)' },
            '50%': { transform: 'scale(1.06)' },
            '100%': { transform: 'scale(1)' },
          },
        }}>
          <Box sx={{ fontSize: '2.2rem' }}>⚡</Box>
        </Box>
        <CircularProgress sx={{ color: ZAP_COLORS.primary, mb: 2 }} size={28} />
        <Typography variant="body2" color="text.secondary">
          {storesLoading ? 'Loading stores...' : 'Detecting your location...'}
        </Typography>
      </Box>
    );
  }

  // ── 2. In service area — render app ───────────────────────────────────────
  if (isInServiceArea) return children;

  // ── Shared handlers ────────────────────────────────────────────────────────
  const savedAddresses = userProfile?.addresses || [];

  const handleSearch = async () => {
    if (!searchText.trim()) return;
    setSearching(true);
    setSearchError('');
    setSearchResults([]);
    try {
      const results = await geocodeAddress(searchText);
      if (!results.length) setSearchError('No results found. Try a more specific address.');
      else setSearchResults(results);
    } catch {
      setSearchError('Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSearchResult = (result) => {
    setManualLocation(result.lat, result.lng, result.label.split(',')[0]);
    setSearchResults([]);
    setSearchText('');
  };

  const handleSelectSavedAddress = (addr) => {
    setManualLocation(
      parseFloat(addr.lat),
      parseFloat(addr.lng),
      `${addr.label} — ${addr.line1}`,
    );
  };

  // ── 3. No location — GPS / manual / saved ─────────────────────────────────
  if (!userLocation) {
    return (
      <Box sx={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(160deg, ${ZAP_COLORS.primary}15, #fff)`, p: 2,
      }}>
        <Container maxWidth="xs">
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Box sx={{
              width: 80, height: 80, borderRadius: 4, mx: 'auto', mb: 3,
              background: `linear-gradient(135deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.primaryDark})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 16px 40px ${ZAP_COLORS.primary}30`,
            }}>
              <Box sx={{ fontSize: '2.5rem' }}>⚡</Box>
            </Box>
            <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif", mb: 0.5 }}>
              ZAP Delivery
            </Typography>
            <Typography color="text.secondary" variant="body2">
              We need your location to show available stores and products near you.
            </Typography>
          </Box>

          <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 3 }}>
            <Box sx={{
              width: 56, height: 56, borderRadius: 3, mx: 'auto', mb: 2,
              background: `${ZAP_COLORS.primary}15`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <GpsFixed sx={{ color: ZAP_COLORS.primary, fontSize: 28 }} />
            </Box>

            {locationPermission === 'denied' ? (
              <>
                <Typography variant="subtitle1" fontWeight={700} textAlign="center" mb={0.5}>
                  Location Access Blocked
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center" mb={2}>
                  Your browser has blocked location access. Search for your address or pick a saved one below.
                </Typography>
                <Alert severity="info" sx={{ mb: 2, borderRadius: 2, fontSize: '0.8rem' }}>
                  To enable GPS, update your browser's site permissions and reload.
                </Alert>
              </>
            ) : (
              <>
                <Typography variant="subtitle1" fontWeight={700} textAlign="center" mb={0.5}>
                  Allow Location Access
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center" mb={3}>
                  We'll find the nearest ZAP store within {SERVICE_RADIUS_KM}km of you.
                </Typography>
                {locationError && (
                  <Alert severity="error" sx={{ mb: 2, borderRadius: 2, fontSize: '0.8rem' }}>{locationError}</Alert>
                )}
                <Button variant="contained" fullWidth size="large" startIcon={<GpsFixed />} onClick={requestLocation}>
                  Use My Current Location
                </Button>
                <Box sx={{ my: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ flex: 1, height: 1, background: ZAP_COLORS.border }} />
                  <Typography variant="caption" color="text.secondary">or search manually</Typography>
                  <Box sx={{ flex: 1, height: 1, background: ZAP_COLORS.border }} />
                </Box>
              </>
            )}

            <ManualSearch
              searchText={searchText} setSearchText={setSearchText}
              handleSearch={handleSearch} searching={searching}
              searchResults={searchResults} searchError={searchError}
              handleSelectSearchResult={handleSelectSearchResult}
            />

            {savedAddresses.length > 0 && (
              <SavedAddressList
                addresses={savedAddresses}
                allStores={allStores}
                SERVICE_RADIUS_KM={SERVICE_RADIUS_KM}
                onSelect={handleSelectSavedAddress}
              />
            )}
          </Paper>
        </Container>
      </Box>
    );
  }

  // ── 4. Location set but outside every store's radius ─────────────────────
  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(160deg, ${ZAP_COLORS.primary}15, #fff)`, p: 2,
    }}>
      <Container maxWidth="xs">
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Box sx={{ fontSize: '4rem', mb: 1 }}>😔</Box>
          <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif", mb: 1 }}>
            Not Serving Here Yet
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mb: 0.5 }}>
            We're not delivering to your current location.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ZAP is available within {SERVICE_RADIUS_KM}km of our stores.
          </Typography>
        </Box>

        <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 3, mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} mb={1.5}>Try a different address</Typography>

          <ManualSearch
            searchText={searchText} setSearchText={setSearchText}
            handleSearch={handleSearch} searching={searching}
            searchResults={searchResults} searchError={searchError}
            handleSelectSearchResult={handleSelectSearchResult}
          />

          {savedAddresses.length > 0 && (
            <SavedAddressList
              addresses={savedAddresses}
              allStores={allStores}
              SERVICE_RADIUS_KM={SERVICE_RADIUS_KM}
              onSelect={handleSelectSavedAddress}
            />
          )}

          <Button
            fullWidth variant="outlined" startIcon={<GpsFixed />}
            onClick={requestLocation} sx={{ mt: 2 }}
          >
            Re-detect My Location
          </Button>
        </Paper>

        {allStores.length > 0 && (
          <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5 }}>
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
              📍 Our Current Stores
            </Typography>
            {allStores.map((store) => (
              <Box key={store.id} sx={{
                display: 'flex', alignItems: 'flex-start', gap: 1.5,
                p: 1.5, borderRadius: 2, mb: 1,
                background: `${ZAP_COLORS.primary}06`,
                border: `1px solid ${ZAP_COLORS.border}`,
              }}>
                <Store sx={{ color: ZAP_COLORS.primary, fontSize: 20, mt: 0.2, flexShrink: 0 }} />
                <Box>
                  <Typography variant="body2" fontWeight={600}>{store.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{store.address}</Typography>
                  <Typography variant="caption" display="block" sx={{ color: ZAP_COLORS.primary }}>
                    {SERVICE_RADIUS_KM}km delivery radius
                  </Typography>
                </Box>
              </Box>
            ))}
          </Paper>
        )}
      </Container>
    </Box>
  );
};

// ── Shared manual search component ───────────────────────────────────────────
const ManualSearch = ({
  searchText, setSearchText, handleSearch, searching,
  searchResults, searchError, handleSelectSearchResult,
}) => (
  <Box>
    <Box sx={{ display: 'flex', gap: 1 }}>
      <TextField
        placeholder="Enter your area or address..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        size="small" fullWidth
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchOutlined fontSize="small" sx={{ color: ZAP_COLORS.textMuted }} />
            </InputAdornment>
          ),
        }}
      />
      <Button
        variant="contained" size="small" onClick={handleSearch}
        disabled={searching} sx={{ flexShrink: 0 }}
      >
        {searching ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : 'Search'}
      </Button>
    </Box>
    {searchError && (
      <Typography variant="caption" sx={{ color: ZAP_COLORS.error, display: 'block', mt: 0.5 }}>
        {searchError}
      </Typography>
    )}
    {searchResults.length > 0 && (
      <Box sx={{ mt: 1, border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 2, overflow: 'hidden' }}>
        {searchResults.map((r, i) => (
          <Box
            key={i}
            onClick={() => handleSelectSearchResult(r)}
            sx={{
              px: 1.5, py: 1, cursor: 'pointer', display: 'flex', gap: 1, alignItems: 'flex-start',
              borderBottom: i < searchResults.length - 1 ? `1px solid ${ZAP_COLORS.border}` : 'none',
              '&:hover': { background: `${ZAP_COLORS.primary}08` },
            }}
          >
            <LocationOn sx={{ fontSize: 16, color: ZAP_COLORS.primary, mt: 0.2, flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
              {r.label}
            </Typography>
          </Box>
        ))}
      </Box>
    )}
  </Box>
);

export default LocationGate;