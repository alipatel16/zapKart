import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, Box, Button,
  CircularProgress, Typography, Chip, Divider, IconButton,
  Tabs, Tab, Alert,
} from '@mui/material';
import { GpsFixed, LocationOn, Store, Close, Home, Work, Place } from '@mui/icons-material';
import { useStore, getDistanceKm } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { ZAP_COLORS } from '../../theme';

// ── Small icon map for address labels ──────────────────────────────────────
const LabelIcon = ({ label }) => {
  const lower = (label || '').toLowerCase();
  if (lower === 'home') return <Home sx={{ fontSize: 16 }} />;
  if (lower === 'work') return <Work sx={{ fontSize: 16 }} />;
  return <Place sx={{ fontSize: 16 }} />;
};

// ── Main dialog ─────────────────────────────────────────────────────────────
const LocationPickerDialog = ({ open, onClose }) => {
  const {
    setManualLocation,
    allStores, activeUserStore, userLocation, SERVICE_RADIUS_KM,
  } = useStore();
  const { userProfile } = useAuth();

  const [tab, setTab] = useState(0);          // 0 = GPS/Stores  1 = Saved addresses
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');

  // ── GPS: use browser navigator.geolocation directly ─────────────────────
  const handleGPS = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setManualLocation(latitude, longitude, 'Current Location');
        setGpsLoading(false);
        onClose();
      },
      (err) => {
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Please allow location access in your browser settings.'
            : `Could not get location: ${err.message}`
        );
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // ── Pick a saved address ─────────────────────────────────────────────────
  const handleSelectSavedAddress = (addr) => {
    if (!addr.lat || !addr.lng) return; // no coordinates — skip
    setManualLocation(
      parseFloat(addr.lat),
      parseFloat(addr.lng),
      `${addr.label} — ${addr.line1}`,
    );
    onClose();
  };

  const savedAddresses = userProfile?.addresses || [];
  const addressesWithCoords = savedAddresses.filter((a) => a.lat && a.lng);
  const addressesWithoutCoords = savedAddresses.filter((a) => !a.lat || !a.lng);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, m: 2 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0 }}>
        <Typography fontWeight={700} fontSize="1rem">Change Delivery Location</Typography>
        <IconButton size="small" onClick={onClose}><Close fontSize="small" /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 2, pb: 3 }}>
        {/* Currently delivering from */}
        {activeUserStore && (
          <Box sx={{
            p: 1.5, borderRadius: 2, mb: 2, mt: 1,
            background: `${ZAP_COLORS.primary}10`,
            border: `1px solid ${ZAP_COLORS.primary}25`,
            display: 'flex', gap: 1, alignItems: 'center',
          }}>
            <Store sx={{ color: ZAP_COLORS.primary, fontSize: 18, flexShrink: 0 }} />
            <Box>
              <Typography variant="caption" sx={{ color: ZAP_COLORS.primary, fontWeight: 700 }}>
                Currently delivering from
              </Typography>
              <Typography variant="body2" fontWeight={600}>{activeUserStore.name}</Typography>
            </Box>
          </Box>
        )}

        {/* Tabs */}
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="fullWidth"
          sx={{ mb: 2, '& .MuiTabs-indicator': { height: 2 } }}
        >
          <Tab label="Use GPS / Stores" sx={{ fontSize: '0.8rem', textTransform: 'none' }} />
          <Tab
            label={`Saved (${addressesWithCoords.length})`}
            sx={{ fontSize: '0.8rem', textTransform: 'none' }}
          />
        </Tabs>

        {/* ── Tab 0: GPS + store list ────────────────────────────────────── */}
        {tab === 0 && (
          <Box>
            {gpsError && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2, fontSize: '0.8rem' }}>
                {gpsError}
              </Alert>
            )}

            {/* GPS button */}
            <Button
              fullWidth
              variant="contained"
              size="large"
              startIcon={gpsLoading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <GpsFixed />}
              onClick={handleGPS}
              disabled={gpsLoading}
              sx={{ mb: 2, borderRadius: 2 }}
            >
              {gpsLoading ? 'Detecting location…' : 'Use My Current Location'}
            </Button>

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, textAlign: 'center' }}>
              Uses your device GPS — most accurate
            </Typography>
          </Box>
        )}

        {/* ── Tab 1: Saved addresses ─────────────────────────────────────── */}
        {tab === 1 && (
          <Box>
            {savedAddresses.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <LocationOn sx={{ fontSize: 40, color: ZAP_COLORS.textMuted, mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  No saved addresses yet.
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Add addresses in your Profile page.
                </Typography>
              </Box>
            ) : (
              <>
                {/* Addresses with coordinates */}
                {addressesWithCoords.map((addr) => {
                  const dist = userLocation
                    ? getDistanceKm(userLocation.lat, userLocation.lng, parseFloat(addr.lat), parseFloat(addr.lng))
                    : null;
                  const nearestStore = dist !== null
                    ? allStores.find((s) => getDistanceKm(addr.lat, addr.lng, s.lat, s.lng) <= SERVICE_RADIUS_KM)
                    : null;

                  return (
                    <Box
                      key={addr.id}
                      onClick={() => handleSelectSavedAddress(addr)}
                      sx={{
                        display: 'flex', alignItems: 'flex-start', gap: 1.5,
                        p: 1.5, borderRadius: 2, mb: 1, cursor: 'pointer',
                        border: `1.5px solid ${ZAP_COLORS.border}`,
                        '&:hover': { borderColor: ZAP_COLORS.primary, background: `${ZAP_COLORS.primary}05` },
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
                          {addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}, {addr.city}
                        </Typography>
                        {nearestStore ? (
                          <Typography variant="caption" sx={{ color: ZAP_COLORS.accentGreen, fontWeight: 600 }}>
                            ✅ Served by {nearestStore.name}
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

                {/* Addresses without coordinates */}
                {addressesWithoutCoords.length > 0 && (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      These addresses need GPS coordinates to use for location switching. Edit them in Profile to add coordinates.
                    </Typography>
                    {addressesWithoutCoords.map((addr) => (
                      <Box
                        key={addr.id}
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 1.5,
                          p: 1.5, borderRadius: 2, mb: 1, opacity: 0.5,
                          border: `1px dashed ${ZAP_COLORS.border}`,
                        }}
                      >
                        <LocationOn sx={{ fontSize: 18, color: ZAP_COLORS.textMuted }} />
                        <Box>
                          <Typography variant="body2" fontWeight={600}>{addr.label} — {addr.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{addr.line1}, {addr.city}</Typography>
                        </Box>
                        <Chip label="No GPS" size="small" sx={{ ml: 'auto', fontSize: '0.62rem', height: 18 }} />
                      </Box>
                    ))}
                  </>
                )}
              </>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LocationPickerDialog;