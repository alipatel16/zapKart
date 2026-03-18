import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Typography, Paper, Avatar, Button, TextField,
  Divider, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Chip, Alert, CircularProgress,
} from '@mui/material';
import { Edit, Add, Delete, Logout, History, LocationOn } from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { ZAP_COLORS } from '../../theme';

const Profile = () => {
  const navigate = useNavigate();
  const { user, userProfile, logout, updateUserProfile, addAddress, deleteAddress } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ displayName: userProfile?.displayName || '', phone: userProfile?.phone || '' });
  const [addressDialog, setAddressDialog] = useState(false);
  const [newAddress, setNewAddress] = useState({ label: 'Home', name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' });
  const [success, setSuccess] = useState('');

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

  const handleAddAddress = async () => {
    try {
      await addAddress(newAddress);
      setAddressDialog(false);
      setNewAddress({ label: 'Home', name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' });
      setSuccess('Address added!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <Box sx={{ pb: { xs: 10, md: 3 }, pt: 1 }}>
      <Container maxWidth="sm">
        <Typography variant="h6" fontWeight={700} sx={{ px: { xs: 1, sm: 0 }, mb: 2 }}>My Profile</Typography>

        {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}

        {/* Profile Card */}
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

        {/* Quick Actions */}
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
          <Button
            fullWidth variant="outlined" startIcon={<History />}
            onClick={() => navigate('/orders')} sx={{ borderRadius: 2.5 }}
          >
            My Orders
          </Button>
          {userProfile?.role === 'admin' && (
            <Button
              fullWidth variant="contained" color="secondary"
              onClick={() => navigate('/admin')} sx={{ borderRadius: 2.5 }}
            >
              Admin Panel
            </Button>
          )}
        </Box>

        {/* Addresses */}
        <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5, mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              📍 Saved Addresses ({userProfile?.addresses?.length || 0}/5)
            </Typography>
            {(userProfile?.addresses?.length || 0) < 5 && (
              <Button size="small" startIcon={<Add />} onClick={() => setAddressDialog(true)}>Add</Button>
            )}
          </Box>

          {!userProfile?.addresses?.length ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <LocationOn sx={{ fontSize: 40, color: ZAP_COLORS.textMuted, mb: 1 }} />
              <Typography variant="body2" color="text.secondary">No addresses saved yet</Typography>
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
                    {addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}, {addr.city}, {addr.state} - {addr.pincode}
                  </Typography>
                </Box>
                <IconButton size="small" onClick={() => deleteAddress(addr.id)} sx={{ color: ZAP_COLORS.error }}>
                  <Delete fontSize="small" />
                </IconButton>
              </Box>
            ))
          )}
        </Paper>

        {/* Logout */}
        <Button
          fullWidth variant="outlined" color="error" startIcon={<Logout />}
          onClick={handleLogout} sx={{ borderRadius: 2.5 }}
        >
          Logout
        </Button>

        {/* Add Address Dialog */}
        <Dialog open={addressDialog} onClose={() => setAddressDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle fontWeight={700}>Add New Address</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {['Home', 'Work', 'Other'].map((l) => (
                  <Chip key={l} label={l} size="small"
                    onClick={() => setNewAddress((p) => ({ ...p, label: l }))}
                    variant={newAddress.label === l ? 'filled' : 'outlined'}
                    color={newAddress.label === l ? 'primary' : 'default'}
                  />
                ))}
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <TextField label="Full Name" value={newAddress.name} onChange={(e) => setNewAddress((p) => ({ ...p, name: e.target.value }))} size="small" fullWidth required />
                <TextField label="Phone" value={newAddress.phone} onChange={(e) => setNewAddress((p) => ({ ...p, phone: e.target.value }))} size="small" fullWidth required />
              </Box>
              <TextField label="Address Line 1" value={newAddress.line1} onChange={(e) => setNewAddress((p) => ({ ...p, line1: e.target.value }))} size="small" fullWidth required />
              <TextField label="Address Line 2 (Optional)" value={newAddress.line2} onChange={(e) => setNewAddress((p) => ({ ...p, line2: e.target.value }))} size="small" fullWidth />
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <TextField label="City" value={newAddress.city} onChange={(e) => setNewAddress((p) => ({ ...p, city: e.target.value }))} size="small" fullWidth required />
                <TextField label="State" value={newAddress.state} onChange={(e) => setNewAddress((p) => ({ ...p, state: e.target.value }))} size="small" fullWidth required />
                <TextField label="Pincode" value={newAddress.pincode} onChange={(e) => setNewAddress((p) => ({ ...p, pincode: e.target.value }))} size="small" sx={{ width: 120 }} required />
              </Box>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setAddressDialog(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleAddAddress}>Save Address</Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
};

export default Profile;
