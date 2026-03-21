import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Typography, Paper, Avatar, Button, TextField,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Alert, CircularProgress, Chip,
} from '@mui/material';
import { Edit, Add, Delete, Logout, History, LocationOn, Close } from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { ZAP_COLORS } from '../../theme';

const LABELS = ['Home', 'Office', 'Others'];

// ── Edit Address Dialog ───────────────────────────────────────────────────────
const EditAddressDialog = ({ address, open, onClose, onSave }) => {
  const [form, setForm] = useState({
    label:        address?.label   || 'Home',
    customLabel:  LABELS.includes(address?.label) ? '' : (address?.label || ''),
    line1:        address?.line1   || '',
    line2:        address?.line2   || '',
    city:         address?.city    || '',
    state:        address?.state   || '',
    pincode:      address?.pincode || '',
    name:         address?.name    || '',
    phone:        address?.phone   || '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // Sync form when address changes (different card opened)
  React.useEffect(() => {
    if (!address) return;
    setForm({
      label:       address.label   || 'Home',
      customLabel: LABELS.includes(address.label) ? '' : (address.label || ''),
      line1:       address.line1   || '',
      line2:       address.line2   || '',
      city:        address.city    || '',
      state:       address.state   || '',
      pincode:     address.pincode || '',
      name:        address.name    || '',
      phone:       address.phone   || '',
    });
    setError('');
  }, [address]);

  const set = (field, val) => setForm((p) => ({ ...p, [field]: val }));

  const handleSave = async () => {
    setError('');
    if (!form.line1.trim()) { setError('Address line 1 is required.'); return; }
    if (!form.name.trim())  { setError('Receiver name is required.');  return; }
    if (!form.phone.trim()) { setError('Phone number is required.');   return; }

    setSaving(true);
    try {
      const effectiveLabel =
        form.label === 'Others'
          ? (form.customLabel.trim() || 'Others')
          : form.label;

      await onSave({
        label:   effectiveLabel,
        line1:   form.line1.trim(),
        line2:   form.line2.trim(),
        city:    form.city.trim(),
        state:   form.state.trim(),
        pincode: form.pincode.trim(),
        name:    form.name.trim(),
        phone:   form.phone.trim(),
        // Preserve existing lat/lng/area from original address
        lat:     address.lat  || '',
        lng:     address.lng  || '',
        area:    address.area || '',
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3, m: 2 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Typography fontWeight={700} fontSize="1rem">Edit Address</Typography>
        <IconButton size="small" onClick={onClose}><Close fontSize="small" /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

        {/* Label */}
        <Box>
          <Typography variant="caption" fontWeight={700} color="text.secondary" textTransform="uppercase" letterSpacing={0.6}>
            Label
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 0.8, flexWrap: 'wrap' }}>
            {LABELS.map((l) => (
              <Chip
                key={l} label={l}
                onClick={() => set('label', l)}
                variant={form.label === l ? 'filled' : 'outlined'}
                color={form.label === l ? 'primary' : 'default'}
                sx={{ cursor: 'pointer', fontWeight: form.label === l ? 700 : 400 }}
              />
            ))}
          </Box>
          {form.label === 'Others' && (
            <TextField
              label="Custom label" value={form.customLabel}
              onChange={(e) => set('customLabel', e.target.value)}
              size="small" fullWidth sx={{ mt: 1.2 }}
              placeholder="e.g. Gym, Hotel…"
            />
          )}
        </Box>

        {/* Address lines */}
        <TextField
          label="House / Flat No., Street *" value={form.line1}
          onChange={(e) => set('line1', e.target.value)}
          size="small" fullWidth required
          placeholder="e.g. Flat 4B, 2nd Floor, MG Road"
        />
        <TextField
          label="Landmark (Optional)" value={form.line2}
          onChange={(e) => set('line2', e.target.value)}
          size="small" fullWidth
          placeholder="e.g. Near City Mall"
        />

        {/* City / State / Pincode */}
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField
            label="City" value={form.city}
            onChange={(e) => set('city', e.target.value)}
            size="small" fullWidth
          />
          <TextField
            label="State" value={form.state}
            onChange={(e) => set('state', e.target.value)}
            size="small" fullWidth
          />
          <TextField
            label="Pincode" value={form.pincode}
            onChange={(e) => set('pincode', e.target.value)}
            size="small" sx={{ width: 110 }}
          />
        </Box>

        {/* Receiver */}
        <Typography variant="caption" fontWeight={700} color="text.secondary" textTransform="uppercase" letterSpacing={0.6}>
          Receiver Details
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, mt: -1 }}>
          <TextField
            label="Full Name *" value={form.name}
            onChange={(e) => set('name', e.target.value)}
            size="small" fullWidth required
          />
          <TextField
            label="Phone *" value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            size="small" fullWidth required type="tel"
            inputProps={{ maxLength: 10 }}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button fullWidth variant="outlined" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button fullWidth variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Profile Page ──────────────────────────────────────────────────────────────
const Profile = () => {
  const navigate = useNavigate();
  const { user, userProfile, logout, updateUserProfile, updateAddress, deleteAddress } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form, setForm] = useState({
    displayName: userProfile?.displayName || '',
    phone:       userProfile?.phone       || '',
  });
  const [success, setSuccess] = useState('');

  // Edit address dialog state
  const [editingAddress, setEditingAddress] = useState(null); // address object or null

  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h6" mb={2}>Please login to view your profile</Typography>
        <Button variant="contained" onClick={() => navigate('/login')}>Login</Button>
      </Container>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUserProfile({ displayName: form.displayName, phone: form.phone });
      setEditing(false);
      setSuccess('Profile updated!');
      setTimeout(() => setSuccess(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAddress = async (updatedFields) => {
    await updateAddress(editingAddress.id, updatedFields);
    setSuccess('Address updated!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleLogout = async () => { await logout(); navigate('/'); };

  return (
    <Box sx={{ pb: { xs: 20, md: 3 }, pt: 1 }}>
      <Container maxWidth="sm">
        <Typography variant="h6" fontWeight={700} sx={{ px: { xs: 1, sm: 0 }, mb: 2 }}>My Profile</Typography>

        {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}

        {/* ── Profile card ── */}
        <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 3, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2.5 }}>
            <Avatar src={user.photoURL} sx={{ width: 64, height: 64, fontSize: '1.5rem' }}>
              {user.displayName?.[0] || user.email?.[0]}
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography fontWeight={700} fontSize="1.1rem">{userProfile?.displayName || 'User'}</Typography>
              <Typography variant="body2" color="text.secondary">{user.email}</Typography>
              {userProfile?.role === 'admin' && (
                <Chip label="Admin" size="small" color="primary" sx={{ mt: 0.5, height: 20, fontSize: '0.68rem' }} />
              )}
            </Box>
            <IconButton size="small" onClick={() => setEditing(!editing)}
              sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 2 }}>
              <Edit fontSize="small" />
            </IconButton>
          </Box>

          {editing && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <TextField
                label="Full Name" value={form.displayName}
                onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
                size="small" fullWidth
              />
              <TextField
                label="Phone Number" value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                size="small" fullWidth type="tel"
              />
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Button variant="outlined" fullWidth onClick={() => setEditing(false)}>Cancel</Button>
                <Button variant="contained" fullWidth onClick={handleSave} disabled={saving}>
                  {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Save'}
                </Button>
              </Box>
            </Box>
          )}
        </Paper>

        {/* ── Quick actions ── */}
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
          <Button fullWidth variant="outlined" startIcon={<History />}
            onClick={() => navigate('/orders')} sx={{ borderRadius: 2.5 }}>
            My Orders
          </Button>
          {userProfile?.role === 'admin' && (
            <Button fullWidth variant="contained" color="secondary"
              onClick={() => navigate('/admin')} sx={{ borderRadius: 2.5 }}>
              Admin Panel
            </Button>
          )}
        </Box>

        {/* ── Addresses ── */}
        <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5, mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              📍 Saved Addresses ({userProfile?.addresses?.length || 0}/5)
            </Typography>
            {(userProfile?.addresses?.length || 0) < 5 && (
              <Button size="small" startIcon={<Add />} onClick={() => navigate('/add-address?from=profile')}>
                Add
              </Button>
            )}
          </Box>

          {!userProfile?.addresses?.length ? (
            <Box
              onClick={() => navigate('/add-address?from=profile')}
              sx={{
                py: 3, textAlign: 'center', cursor: 'pointer',
                border: `2px dashed ${ZAP_COLORS.border}`, borderRadius: 2.5,
                '&:hover': { borderColor: ZAP_COLORS.primary, background: `${ZAP_COLORS.primary}05` },
                transition: 'all 0.2s',
              }}
            >
              <LocationOn sx={{ fontSize: 40, color: ZAP_COLORS.textMuted, mb: 1 }} />
              <Typography variant="body2" fontWeight={600}>No addresses saved yet</Typography>
              <Typography variant="caption" color="text.secondary">Tap to add your first address</Typography>
            </Box>
          ) : (
            userProfile.addresses.map((addr) => (
              <Box key={addr.id} sx={{
                p: 1.5, borderRadius: 2, mb: 1,
                border: `1px solid ${ZAP_COLORS.border}`,
                display: 'flex', alignItems: 'flex-start', gap: 1,
              }}>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 0.3 }}>
                    <Chip label={addr.label} size="small" color="primary" sx={{ height: 18, fontSize: '0.65rem' }} />
                    <Typography variant="body2" fontWeight={600}>{addr.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{addr.phone}</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}
                    {addr.city ? `, ${addr.city}` : ''}
                    {addr.state ? `, ${addr.state}` : ''}
                    {addr.pincode ? ` - ${addr.pincode}` : ''}
                  </Typography>
                </Box>

                {/* ── Edit + Delete buttons ── */}
                <Box sx={{ display: 'flex', flexShrink: 0 }}>
                  <IconButton
                    size="small"
                    onClick={() => setEditingAddress(addr)}
                    sx={{ color: ZAP_COLORS.primary }}
                  >
                    <Edit fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => deleteAddress(addr.id)}
                    sx={{ color: ZAP_COLORS.error || '#EF4444' }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            ))
          )}
        </Paper>

        {/* ── Logout ── */}
        <Button fullWidth variant="outlined" color="error" startIcon={<Logout />}
          onClick={handleLogout} sx={{ borderRadius: 2.5 }}>
          Logout
        </Button>

        {/* ── Edit address dialog ── */}
        <EditAddressDialog
          open={!!editingAddress}
          address={editingAddress}
          onClose={() => setEditingAddress(null)}
          onSave={handleSaveAddress}
        />
      </Container>
    </Box>
  );
};

export default Profile;