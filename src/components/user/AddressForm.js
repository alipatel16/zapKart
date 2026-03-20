import React, { useState } from 'react';
import {
  Box, TextField, Button, Chip, CircularProgress,
  Typography, Alert,
} from '@mui/material';
import { GpsFixed, LocationOn } from '@mui/icons-material';
import { ZAP_COLORS } from '../../theme';

const LABELS = ['Home', 'Work', 'Other'];

const EMPTY = {
  label: 'Home',
  name: '', phone: '',
  line1: '', line2: '',
  city: '', state: '', pincode: '',
  lat: '', lng: '',
};

/**
 * Reusable address form.
 *
 * Props:
 *   value        — controlled address object
 *   onChange     — (updatedAddress) => void
 *   onSave       — async () => void  (called when "Save" clicked)
 *   onCancel     — () => void
 *   saving       — boolean
 *   error        — string | null
 */
const AddressForm = ({ value = EMPTY, onChange, onSave, onCancel, saving = false, error = '' }) => {
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');

  const set = (field, val) => onChange({ ...value, [field]: val });

  const handleGPS = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation not supported by your browser.');
      return;
    }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          ...value,
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        });
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Allow access in browser settings.'
            : `GPS error: ${err.message}`
        );
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const hasCoords = value.lat && value.lng;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.8 }}>
      {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

      {/* Label chips */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        {LABELS.map((l) => (
          <Chip
            key={l} label={l} size="small"
            onClick={() => set('label', l)}
            variant={value.label === l ? 'filled' : 'outlined'}
            color={value.label === l ? 'primary' : 'default'}
          />
        ))}
      </Box>

      {/* Name + Phone */}
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <TextField
          label="Full Name *" value={value.name}
          onChange={(e) => set('name', e.target.value)}
          size="small" fullWidth required
        />
        <TextField
          label="Phone *" value={value.phone}
          onChange={(e) => set('phone', e.target.value)}
          size="small" fullWidth required type="tel"
        />
      </Box>

      {/* Address lines */}
      <TextField
        label="Address Line 1 *" value={value.line1}
        onChange={(e) => set('line1', e.target.value)}
        size="small" fullWidth required
        placeholder="House / Flat no., Street"
      />
      <TextField
        label="Address Line 2" value={value.line2}
        onChange={(e) => set('line2', e.target.value)}
        size="small" fullWidth
        placeholder="Area, Landmark (optional)"
      />

      {/* City / State / Pincode */}
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <TextField
          label="City *" value={value.city}
          onChange={(e) => set('city', e.target.value)}
          size="small" fullWidth required
        />
        <TextField
          label="State *" value={value.state}
          onChange={(e) => set('state', e.target.value)}
          size="small" fullWidth required
        />
        <TextField
          label="Pincode *" value={value.pincode}
          onChange={(e) => set('pincode', e.target.value)}
          size="small" sx={{ width: 110 }} required
        />
      </Box>

      {/* GPS coordinates section */}
      <Box sx={{
        p: 1.5, borderRadius: 2,
        border: `1.5px solid ${hasCoords ? ZAP_COLORS.accentGreen + '50' : ZAP_COLORS.border}`,
        background: hasCoords ? `${ZAP_COLORS.accentGreen}06` : `${ZAP_COLORS.primary}04`,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
            <LocationOn sx={{ fontSize: 16, color: hasCoords ? ZAP_COLORS.accentGreen : ZAP_COLORS.primary }} />
            <Typography variant="caption" fontWeight={700} sx={{ color: hasCoords ? ZAP_COLORS.accentGreen : ZAP_COLORS.textPrimary }}>
              {hasCoords ? '✅ GPS Coordinates saved' : 'GPS Coordinates (recommended)'}
            </Typography>
          </Box>
          <Button
            size="small"
            variant={hasCoords ? 'outlined' : 'contained'}
            startIcon={gpsLoading ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : <GpsFixed />}
            onClick={handleGPS}
            disabled={gpsLoading}
            sx={{ fontSize: '0.72rem', py: 0.4, px: 1.2, borderRadius: 1.5 }}
          >
            {gpsLoading ? 'Getting GPS…' : hasCoords ? 'Update GPS' : 'Use My GPS'}
          </Button>
        </Box>

        {gpsError && (
          <Typography variant="caption" sx={{ color: ZAP_COLORS.error, display: 'block', mb: 0.5 }}>
            {gpsError}
          </Typography>
        )}

        {hasCoords ? (
          <Typography variant="caption" sx={{ color: ZAP_COLORS.textMuted }}>
            📍 {parseFloat(value.lat).toFixed(5)}, {parseFloat(value.lng).toFixed(5)}
          </Typography>
        ) : (
          <Typography variant="caption" color="text.secondary">
            Adding GPS coordinates lets you switch delivery location to this address with one tap. Tap "Use My GPS" while you're at this address.
          </Typography>
        )}
      </Box>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5 }}>
        {onCancel && (
          <Button fullWidth variant="outlined" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button
          fullWidth variant="contained"
          onClick={onSave}
          disabled={saving || !value.name || !value.phone || !value.line1 || !value.city}
        >
          {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Save Address'}
        </Button>
      </Box>
    </Box>
  );
};

export { EMPTY as EMPTY_ADDRESS };
export default AddressForm;