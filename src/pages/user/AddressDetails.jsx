import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Typography, IconButton, TextField,
  Chip, Button, Paper, CircularProgress, Alert,
} from '@mui/material';
import { ArrowBack, LocationOn } from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { ZAP_COLORS } from '../../theme';

const LABELS = ['Home', 'Office', 'Others'];

const AddressDetails = () => {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { addAddress } = useAuth();

  const { lat, lng, area, city, from = 'checkout' } = state || {};

  const [form, setForm] = useState({
    houseNo: '',
    buildingName: '',
    landmark: '',
    label: 'Home',
    customLabel: '',
    name: '',
    phone: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field, val) => setForm((p) => ({ ...p, [field]: val }));

  // ── Guard: no location state ──────────────────────────────────────────────
  if (!lat || !lng) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="error" mb={2}>
          No location selected. Please go back and pick a location on the map.
        </Typography>
        <Button variant="outlined" onClick={() => navigate(-1)}>Go Back</Button>
      </Box>
    );
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setError('');
    if (!form.houseNo.trim()) { setError('Please enter your house / flat number.'); return; }
    if (!form.name.trim())    { setError('Please enter the receiver\'s name.');     return; }
    if (!form.phone.trim())   { setError('Please enter a valid phone number.');     return; }

    setSaving(true);
    try {
      const effectiveLabel =
        form.label === 'Others'
          ? (form.customLabel.trim() || 'Others')
          : form.label;

      const line1 = [form.houseNo.trim(), form.buildingName.trim()].filter(Boolean).join(', ');
      const line2 = form.landmark.trim();

      await addAddress({
        label: effectiveLabel,
        name:  form.name.trim(),
        phone: form.phone.trim(),
        line1,
        line2,
        city:    city    || '',
        state:   '',
        pincode: '',
        lat:     lat.toString(),
        lng:     lng.toString(),
        area:    area || '',
      });

      // Navigate back to wherever the user came from
      navigate(from === 'profile' ? '/profile' : '/checkout', { replace: true });
    } catch (err) {
      setError(err.message || 'Failed to save address. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const canSave = form.houseNo.trim() && form.name.trim() && form.phone.trim();

  return (
    <Box sx={{ pb: { xs: 14, md: 4 }, minHeight: '100vh', background: '#f7f7f8' }}>

      {/* ── Sticky header ── */}
      <Box sx={{
        background: '#fff', px: 1.5, py: 1.4,
        display: 'flex', alignItems: 'center', gap: 1,
        boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <IconButton size="small" onClick={() => navigate(-1)}>
          <ArrowBack />
        </IconButton>
        <Typography
          fontWeight={800} fontSize="1.05rem"
          fontFamily="'Syne', sans-serif"
        >
          Address Details
        </Typography>
      </Box>

      <Box sx={{ px: 2, pt: 2.5 }}>

        {/* ── Location preview chip ── */}
        <Paper
          elevation={0}
          sx={{
            border: `1.5px solid ${ZAP_COLORS.primary}35`,
            borderRadius: 3, p: 2, mb: 2.5,
            background: `${ZAP_COLORS.primary}06`,
            display: 'flex', alignItems: 'flex-start', gap: 1.5,
          }}
        >
          <LocationOn sx={{ color: ZAP_COLORS.primary, mt: 0.15, flexShrink: 0 }} />
          <Box>
            <Typography fontWeight={700} fontSize="0.95rem">
              {area || 'Selected location'}
            </Typography>
            {city && (
              <Typography variant="caption" color="text.secondary">
                {city}
              </Typography>
            )}
            <Typography
              variant="caption"
              sx={{ color: ZAP_COLORS.primary, fontWeight: 600, display: 'block', mt: 0.3 }}
            >
              📍 {parseFloat(lat).toFixed(5)}, {parseFloat(lng).toFixed(5)}
            </Typography>
          </Box>
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>
        )}

        {/* ── Address details card ── */}
        <Paper
          elevation={0}
          sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5, mb: 2 }}
        >
          <Typography
            fontWeight={700} fontSize="0.75rem" mb={2}
            color="text.secondary" textTransform="uppercase" letterSpacing={0.8}
          >
            📍 Address Details
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="House / Flat No. & Floor *"
              value={form.houseNo}
              onChange={(e) => set('houseNo', e.target.value)}
              size="small" fullWidth required
              placeholder="e.g. Flat 4B, 2nd Floor"
            />
            <TextField
              label="Building / Society Name (Optional)"
              value={form.buildingName}
              onChange={(e) => set('buildingName', e.target.value)}
              size="small" fullWidth
              placeholder="e.g. Green Park Apartments"
            />
            <TextField
              label="Landmark (Optional)"
              value={form.landmark}
              onChange={(e) => set('landmark', e.target.value)}
              size="small" fullWidth
              placeholder="e.g. Near City Mall, Opposite Bank"
            />
          </Box>
        </Paper>

        {/* ── Label card ── */}
        <Paper
          elevation={0}
          sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5, mb: 2 }}
        >
          <Typography
            fontWeight={700} fontSize="0.75rem" mb={1.5}
            color="text.secondary" textTransform="uppercase" letterSpacing={0.8}
          >
            🏷️ Address Label
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {LABELS.map((l) => (
              <Chip
                key={l} label={l}
                onClick={() => set('label', l)}
                variant={form.label === l ? 'filled' : 'outlined'}
                color={form.label === l ? 'primary' : 'default'}
                sx={{ fontWeight: form.label === l ? 700 : 400, cursor: 'pointer' }}
              />
            ))}
          </Box>

          {form.label === 'Others' && (
            <TextField
              label="Enter custom label *"
              value={form.customLabel}
              onChange={(e) => set('customLabel', e.target.value)}
              size="small" fullWidth
              placeholder="e.g. Gym, Hotel, Salon…"
              sx={{ mt: 1.8 }}
            />
          )}
        </Paper>

        {/* ── Receiver details card ── */}
        <Paper
          elevation={0}
          sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5, mb: 3 }}
        >
          <Typography
            fontWeight={700} fontSize="0.75rem" mb={2}
            color="text.secondary" textTransform="uppercase" letterSpacing={0.8}
          >
            👤 Receiver Details
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Full Name *"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              size="small" fullWidth required
              placeholder="Name of the person receiving the order"
            />
            <TextField
              label="Phone Number *"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              size="small" fullWidth required type="tel"
              placeholder="10-digit mobile number"
              inputProps={{ maxLength: 10 }}
            />
          </Box>
        </Paper>

        {/* ── Save button ── */}
        <Button
          fullWidth variant="contained" size="large"
          disabled={saving || !canSave}
          onClick={handleSave}
          sx={{
            borderRadius: 3, py: 1.7,
            fontWeight: 700, fontSize: '1.05rem',
            fontFamily: "'Syne', sans-serif",
            mb: 2,
          }}
        >
          {saving
            ? <CircularProgress size={22} sx={{ color: '#fff' }} />
            : 'Save Address'}
        </Button>
      </Box>
    </Box>
  );
};

export default AddressDetails;