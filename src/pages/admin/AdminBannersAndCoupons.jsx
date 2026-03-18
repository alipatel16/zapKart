import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Switch, CircularProgress,
  Alert, Chip, Grid, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import { Add, Edit, Delete, CloudUpload } from '@mui/icons-material';
import {
  collection, query, orderBy, getDocs, doc, addDoc, updateDoc,
  deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, COLLECTIONS } from '../../firebase';
import { ZAP_COLORS } from '../../theme';

// ============================================================
// ADMIN BANNERS
// ============================================================
const EMPTY_BANNER = { title: '', subtitle: '', imageUrl: '', link: '', order: 0, active: true };

export const AdminBanners = () => {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_BANNER);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState('');
  const fileRef = useRef();

  const fetch = async () => {
    setLoading(true);
    const snap = await getDocs(query(collection(db, COLLECTIONS.BANNERS), orderBy('order')));
    setBanners(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const sRef = storageRef(storage, `banners/${Date.now()}_${file.name}`);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      setForm((p) => ({ ...p, imageUrl: url }));
    } finally { setUploading(false); }
  };

  const handleSave = async () => {
    if (!form.imageUrl) { alert('Please upload a banner image'); return; }
    setSaving(true);
    try {
      if (editItem) {
        await updateDoc(doc(db, COLLECTIONS.BANNERS, editItem.id), { ...form, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, COLLECTIONS.BANNERS), { ...form, createdAt: serverTimestamp() });
      }
      setDialog(false);
      fetch();
      setSuccess(editItem ? 'Banner updated!' : 'Banner added!');
      setTimeout(() => setSuccess(''), 3000);
    } finally { setSaving(false); }
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif" }}>Banners / Carousel</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => { setEditItem(null); setForm(EMPTY_BANNER); setDialog(true); }}>
          Add Banner
        </Button>
      </Box>
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {banners.map((banner) => (
          <Grid item xs={12} sm={6} md={4} key={banner.id}>
            <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, overflow: 'hidden' }}>
              <Box
                component="img"
                src={banner.imageUrl}
                alt={banner.title}
                sx={{ width: '100%', aspectRatio: '3/1', objectFit: 'cover', display: 'block' }}
              />
              <Box sx={{ p: 1.5 }}>
                <Typography variant="body2" fontWeight={600}>{banner.title || 'Untitled'}</Typography>
                {banner.subtitle && <Typography variant="caption" color="text.secondary">{banner.subtitle}</Typography>}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Order: {banner.order}</Typography>
                    <Switch
                      size="small" checked={!!banner.active}
                      onChange={() => updateDoc(doc(db, COLLECTIONS.BANNERS, banner.id), { active: !banner.active }).then(fetch)}
                    />
                  </Box>
                  <Box>
                    <IconButton size="small" onClick={() => { setEditItem(banner); setForm({ ...EMPTY_BANNER, ...banner }); setDialog(true); }}>
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={async () => { if (window.confirm('Delete banner?')) { await deleteDoc(doc(db, COLLECTIONS.BANNERS, banner.id)); fetch(); } }} sx={{ color: ZAP_COLORS.error }}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {loading && <CircularProgress />}

      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>{editItem ? 'Edit Banner' : 'Add Banner'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Box>
              {form.imageUrl && (
                <Box component="img" src={form.imageUrl} alt="" sx={{ width: '100%', aspectRatio: '3/1', objectFit: 'cover', borderRadius: 2, mb: 1 }} />
              )}
              <Button variant="outlined" startIcon={uploading ? <CircularProgress size={14} /> : <CloudUpload />}
                onClick={() => fileRef.current?.click()} disabled={uploading} fullWidth>
                {form.imageUrl ? 'Change Image' : 'Upload Banner Image *'}
              </Button>
              <input ref={fileRef} type="file" hidden accept="image/*" onChange={handleImageUpload} />
              <Typography variant="caption" color="text.secondary">Recommended ratio: 3:1 (e.g. 1200×400px)</Typography>
            </Box>
            <TextField label="Title (Optional)" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} size="small" fullWidth />
            <TextField label="Subtitle (Optional)" value={form.subtitle} onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))} size="small" fullWidth />
            <TextField label="Link URL (Optional)" value={form.link} onChange={(e) => setForm((p) => ({ ...p, link: e.target.value }))} size="small" fullWidth placeholder="/category/id or /products?filter=featured" />
            <TextField label="Display Order" value={form.order} onChange={(e) => setForm((p) => ({ ...p, order: parseInt(e.target.value) || 0 }))} size="small" type="number" />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : editItem ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// ============================================================
// ADMIN COUPONS
// ============================================================
const EMPTY_COUPON = { code: '', type: 'percent', value: '', maxDiscount: '', minOrder: '', active: true, expiresAt: '' };

export const AdminCoupons = () => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_COUPON);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  const fetch = async () => {
    setLoading(true);
    const snap = await getDocs(query(collection(db, COLLECTIONS.COUPONS), orderBy('createdAt', 'desc')));
    setCoupons(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    if (!form.code || !form.value) { alert('Code and value are required'); return; }
    setSaving(true);
    try {
      const data = {
        ...form,
        code: form.code.toUpperCase(),
        value: parseFloat(form.value),
        maxDiscount: form.maxDiscount ? parseFloat(form.maxDiscount) : null,
        minOrder: form.minOrder ? parseFloat(form.minOrder) : 0,
        updatedAt: serverTimestamp(),
      };
      if (editItem) {
        await updateDoc(doc(db, COLLECTIONS.COUPONS, editItem.id), data);
      } else {
        await addDoc(collection(db, COLLECTIONS.COUPONS), { ...data, createdAt: serverTimestamp() });
      }
      setDialog(false); fetch();
      setSuccess(editItem ? 'Coupon updated!' : 'Coupon added!');
      setTimeout(() => setSuccess(''), 3000);
    } finally { setSaving(false); }
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif" }}>Coupons</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => { setEditItem(null); setForm(EMPTY_COUPON); setDialog(true); }}>
          Add Coupon
        </Button>
      </Box>
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}

      <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ background: `${ZAP_COLORS.primary}08` }}>
              {['Code', 'Type', 'Value', 'Max Discount', 'Min Order', 'Active', 'Actions'].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.78rem', color: ZAP_COLORS.textSecondary }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={7} align="center"><CircularProgress size={28} sx={{ my: 3 }} /></TableCell></TableRow>
              : coupons.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Chip label={c.code} size="small" color="primary" sx={{ fontFamily: 'monospace', fontWeight: 700 }} />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>{c.type === 'percent' ? 'Percentage' : 'Fixed'}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', fontWeight: 700 }}>
                    {c.type === 'percent' ? `${c.value}%` : `₹${c.value}`}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>{c.maxDiscount ? `₹${c.maxDiscount}` : '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>₹{c.minOrder || 0}</TableCell>
                  <TableCell>
                    <Switch size="small" checked={!!c.active} onChange={() => updateDoc(doc(db, COLLECTIONS.COUPONS, c.id), { active: !c.active }).then(fetch)} />
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => { setEditItem(c); setForm({ ...EMPTY_COUPON, ...c }); setDialog(true); }}><Edit fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={async () => { if (window.confirm('Delete coupon?')) { await deleteDoc(doc(db, COLLECTIONS.COUPONS, c.id)); fetch(); } }} sx={{ color: ZAP_COLORS.error }}><Delete fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>{editItem ? 'Edit Coupon' : 'Add Coupon'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField label="Coupon Code *" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} size="small" fullWidth />
            <FormControl size="small" fullWidth>
              <InputLabel>Discount Type</InputLabel>
              <Select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} label="Discount Type">
                <MenuItem value="percent">Percentage (%)</MenuItem>
                <MenuItem value="fixed">Fixed Amount (₹)</MenuItem>
              </Select>
            </FormControl>
            <TextField label={`Discount Value *`} value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))} size="small" fullWidth type="number"
              InputProps={{ endAdornment: <Box sx={{ color: ZAP_COLORS.textMuted, pr: 1 }}>{form.type === 'percent' ? '%' : '₹'}</Box> }}
            />
            {form.type === 'percent' && (
              <TextField label="Max Discount Cap (₹)" value={form.maxDiscount} onChange={(e) => setForm((p) => ({ ...p, maxDiscount: e.target.value }))} size="small" fullWidth type="number" />
            )}
            <TextField label="Minimum Order Amount (₹)" value={form.minOrder} onChange={(e) => setForm((p) => ({ ...p, minOrder: e.target.value }))} size="small" fullWidth type="number" />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : editItem ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
