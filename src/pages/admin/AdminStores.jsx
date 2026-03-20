import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Switch, CircularProgress,
  Alert, Grid, Chip,
} from '@mui/material';
import { Add, Edit, Delete, LocationOn, Store } from '@mui/icons-material';
import {
  collection, query, orderBy, getDocs, doc, addDoc, updateDoc,
  deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { ZAP_COLORS } from '../../theme';

const EMPTY_STORE = {
  name: '', address: '', lat: '', lng: '',
  phone: '', email: '', active: true,
  deliveryRadiusKm: 2,
  openTime: '08:00', closeTime: '22:00',
};



const AdminStores = () => {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_STORE);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const fetchStores = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.STORES), orderBy('name')));
      setStores(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStores(); }, []);

  const openAdd = () => { setEditItem(null); setForm(EMPTY_STORE); setError(''); setDialog(true); };
  const openEdit = (s) => { setEditItem(s); setForm({ ...EMPTY_STORE, ...s }); setError(''); setDialog(true); };

    const handleAutoGeocode = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser. Enter coordinates manually.');
      return;
    }
    setGeocoding(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((p) => ({
          ...p,
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        }));
        setSuccess('✅ GPS captured! Verify these coordinates match the store location.');
        setTimeout(() => setSuccess(''), 5000);
        setGeocoding(false);
      },
      (err) => {
        const msg = err.code === 1
          ? 'Location permission denied. Allow it in browser settings, or paste coordinates from Google Maps (right-click → "What\'s here?").'
          : `GPS error: ${err.message}`;
        setError(msg);
        setGeocoding(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSave = async () => {
    if (!form.name || !form.address || !form.lat || !form.lng) {
      setError('Name, address and coordinates are required.');
      return;
    }
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError('Invalid coordinates. Latitude: -90 to 90, Longitude: -180 to 180');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = {
        ...form,
        lat,
        lng,
        deliveryRadiusKm: parseFloat(form.deliveryRadiusKm) || 2,
        updatedAt: serverTimestamp(),
      };
      if (editItem) {
        await updateDoc(doc(db, COLLECTIONS.STORES, editItem.id), data);
        setStores((prev) => prev.map((s) => s.id === editItem.id ? { ...s, ...data } : s));
        setSuccess('Store updated!');
      } else {
        data.createdAt = serverTimestamp();
        const ref = await addDoc(collection(db, COLLECTIONS.STORES), data);
        setStores((prev) => [...prev, { id: ref.id, ...data }]);
        setSuccess('Store added!');
      }
      setDialog(false);
      setTimeout(() => setSuccess(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (store) => {
    if (!window.confirm(`Delete store "${store.name}"? This will affect all products and orders linked to it.`)) return;
    await deleteDoc(doc(db, COLLECTIONS.STORES, store.id));
    setStores((prev) => prev.filter((s) => s.id !== store.id));
    setSuccess('Store deleted.');
    setTimeout(() => setSuccess(''), 3000);
  };

  const toggleActive = async (store) => {
    await updateDoc(doc(db, COLLECTIONS.STORES, store.id), { active: !store.active });
    setStores((prev) => prev.map((s) => s.id === store.id ? { ...s, active: !s.active } : s));
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif" }}>
            Stores / Warehouses
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage delivery store locations and service radius
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={openAdd}>Add Store</Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}

      {/* Store cards for mobile */}
      <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 2, mb: 2 }}>
        {loading ? <CircularProgress /> : stores.map((store) => (
          <Paper key={store.id} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Store sx={{ color: ZAP_COLORS.primary, fontSize: 20 }} />
                <Box>
                  <Typography variant="body1" fontWeight={700}>{store.name}</Typography>
                  <Chip label={store.active ? 'Active' : 'Inactive'} size="small" color={store.active ? 'success' : 'default'} sx={{ height: 18, fontSize: '0.65rem', mt: 0.3 }} />
                </Box>
              </Box>
              <Box>
                <IconButton size="small" onClick={() => openEdit(store)}><Edit fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => handleDelete(store)} sx={{ color: ZAP_COLORS.error }}><Delete fontSize="small" /></IconButton>
              </Box>
            </Box>
            <Typography variant="body2" color="text.secondary" mb={0.5}>{store.address}</Typography>
            <Typography variant="caption" color="text.secondary">
              📍 {store.lat}, {store.lng} · 📦 {store.deliveryRadiusKm}km radius
            </Typography>
          </Paper>
        ))}
      </Box>

      {/* Table for desktop */}
      <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, display: { xs: 'none', md: 'block' } }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ background: `${ZAP_COLORS.primary}08` }}>
              {['Store Name', 'Address', 'Coordinates', 'Radius', 'Hours', 'Active', 'Actions'].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.78rem', color: ZAP_COLORS.textSecondary }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
            ) : stores.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <Store sx={{ fontSize: 40, color: ZAP_COLORS.textMuted, mb: 1, display: 'block', mx: 'auto' }} />
                  <Typography color="text.secondary">No stores added yet. Add your first store to get started.</Typography>
                </TableCell>
              </TableRow>
            ) : stores.map((store) => (
              <TableRow key={store.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={700}>{store.name}</Typography>
                  {store.phone && <Typography variant="caption" color="text.secondary">{store.phone}</Typography>}
                </TableCell>
                <TableCell sx={{ fontSize: '0.78rem', maxWidth: 200 }}>
                  <Typography variant="body2" fontSize="0.78rem" noWrap>{store.address}</Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    <LocationOn sx={{ fontSize: 14, color: ZAP_COLORS.primary }} />
                    <Typography variant="caption">{parseFloat(store.lat).toFixed(4)}, {parseFloat(store.lng).toFixed(4)}</Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Chip label={`${store.deliveryRadiusKm || 2}km`} size="small" color="primary" sx={{ fontSize: '0.7rem' }} />
                </TableCell>
                <TableCell sx={{ fontSize: '0.78rem' }}>
                  {store.openTime && store.closeTime ? `${store.openTime} – ${store.closeTime}` : '—'}
                </TableCell>
                <TableCell>
                  <Switch size="small" checked={!!store.active} onChange={() => toggleActive(store)} />
                </TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => openEdit(store)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => handleDelete(store)} sx={{ color: ZAP_COLORS.error }}><Delete fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add / Edit Dialog */}
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>{editItem ? 'Edit Store' : 'Add New Store'}</DialogTitle>
        <DialogContent dividers>
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                label="Store Name *" value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                fullWidth size="small" placeholder="e.g. ZAP Mart - Anna Nagar"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Full Address *" value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                fullWidth size="small" multiline rows={2}
                placeholder="Shop No. 4, Main Road, Anna Nagar, Chennai - 600040"
              />
            </Grid>

            {/* Coordinates */}
            <Grid item xs={12}>
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                GPS COORDINATES *
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <TextField
                  label="Latitude" value={form.lat}
                  onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))}
                  size="small" sx={{ flex: 1 }}
                  placeholder="e.g. 13.0827"
                />
                <TextField
                  label="Longitude" value={form.lng}
                  onChange={(e) => setForm((p) => ({ ...p, lng: e.target.value }))}
                  size="small" sx={{ flex: 1 }}
                  placeholder="e.g. 80.2707"
                />
                <Button
                  variant="outlined" size="small" onClick={handleAutoGeocode}
                  disabled={geocoding} sx={{ flexShrink: 0, height: 40 }}
                  startIcon={geocoding ? <CircularProgress size={12} /> : <LocationOn />}
                >
                  {geocoding ? 'Getting GPS…' : '📍 Use My GPS'}
                </Button>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                💡 Stand at the store and tap "Use My GPS" for exact coordinates, or get them from{' '}
                <a href="https://www.google.com/maps" target="_blank" rel="noreferrer" style={{ color: '#FF6B35' }}>
                  Google Maps
                </a>{' '}
                (open Maps → long-press the store location → copy the numbers shown).
              </Typography>
            </Grid>

            <Grid item xs={6}>
              <TextField
                label="Delivery Radius (km) *" value={form.deliveryRadiusKm}
                onChange={(e) => setForm((p) => ({ ...p, deliveryRadiusKm: e.target.value }))}
                fullWidth size="small" type="number"
                helperText="Users within this radius can shop"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Phone" value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                fullWidth size="small"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Opens at" value={form.openTime} onChange={(e) => setForm((p) => ({ ...p, openTime: e.target.value }))} fullWidth size="small" type="time" InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Closes at" value={form.closeTime} onChange={(e) => setForm((p) => ({ ...p, closeTime: e.target.value }))} fullWidth size="small" type="time" InputLabelProps={{ shrink: true }} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : editItem ? 'Update Store' : 'Add Store'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminStores;