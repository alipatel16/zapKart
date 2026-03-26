// ============================================================
// src/pages/admin/AdminOtherPages.jsx
//
// Contains: AdminCategories, AdminInventory, AdminSalesReport
// AdminInventory now reads from storeInventory collection.
// ============================================================

// ============================================================
// ADMIN CATEGORIES (unchanged structure)
// ============================================================
import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Switch, CircularProgress,
  Alert, Avatar, Grid, Chip, InputAdornment,
} from '@mui/material';
import { Add, Edit, Delete, CloudUpload, Search } from '@mui/icons-material';
import {
  collection, query, orderBy, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp,
  where,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, COLLECTIONS } from '../../firebase';
import { ZAP_COLORS } from '../../theme';
import { useStore } from '../../context/StoreContext';

// ============================================================
// ADMIN INVENTORY
// ============================================================
import { Inventory2 } from '@mui/icons-material';

// ============================================================
// ADMIN SALES REPORT
// ============================================================
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import { Timestamp } from 'firebase/firestore';
import { formatCurrency } from '../../utils/helpers';

// ────────────────────────────────────────────────────────────────────────────
// ADMIN CATEGORIES
// ────────────────────────────────────────────────────────────────────────────
const EMPTY_CAT = { name: '', description: '', imageUrl: '', order: 0, active: true };

export const AdminCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [editCat, setEditCat] = useState(null);
  const [form, setForm] = useState(EMPTY_CAT);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState('');
  const fileRef = useRef();

  const fetch = async () => {
    setLoading(true);
    const snap = await getDocs(query(collection(db, COLLECTIONS.CATEGORIES), orderBy('order', 'asc')));
    setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const sRef = storageRef(storage, `categories/${Date.now()}_${file.name}`);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      setForm((p) => ({ ...p, imageUrl: url }));
    } finally { setUploading(false); }
  };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const data = { ...form, order: parseInt(form.order) || 0, updatedAt: serverTimestamp() };
      if (editCat) {
        await updateDoc(doc(db, COLLECTIONS.CATEGORIES, editCat.id), data);
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, COLLECTIONS.CATEGORIES), data);
      }
      setDialog(false);
      setSuccess(editCat ? 'Category updated!' : 'Category added!');
      setTimeout(() => setSuccess(''), 3000);
      fetch();
    } finally { setSaving(false); }
  };

  const handleDelete = async (cat) => {
    if (!window.confirm(`Delete "${cat.name}"?`)) return;
    await deleteDoc(doc(db, COLLECTIONS.CATEGORIES, cat.id));
    setCategories((prev) => prev.filter((c) => c.id !== cat.id));
    setSuccess('Category deleted!');
    setTimeout(() => setSuccess(''), 3000);
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif" }}>Categories</Typography>
        <Button variant="contained" startIcon={<Add />}
          onClick={() => { setEditCat(null); setForm(EMPTY_CAT); setDialog(true); }}>
          Add Category
        </Button>
      </Box>
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}

      <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ background: `${ZAP_COLORS.primary}08` }}>
              {['', 'Name', 'Description', 'Order', 'Active', 'Actions'].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.78rem', color: ZAP_COLORS.textSecondary }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
              : categories.map((cat) => (
                <TableRow key={cat.id} hover>
                  <TableCell><Avatar src={cat.imageUrl} variant="rounded" sx={{ width: 36, height: 36 }} /></TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{cat.name}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', color: ZAP_COLORS.textMuted }}>{cat.description || '—'}</TableCell>
                  <TableCell>{cat.order}</TableCell>
                  <TableCell><Switch size="small" checked={cat.active !== false} onChange={async () => {
                    await updateDoc(doc(db, COLLECTIONS.CATEGORIES, cat.id), { active: !cat.active });
                    setCategories((prev) => prev.map((c) => c.id === cat.id ? { ...c, active: !c.active } : c));
                  }} /></TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => { setEditCat(cat); setForm(cat); setDialog(true); }}>
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(cat)} sx={{ color: ZAP_COLORS.error }}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>{editCat ? 'Edit Category' : 'Add Category'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Avatar src={form.imageUrl} variant="rounded" sx={{ width: 64, height: 64 }} />
                <Button variant="outlined" startIcon={uploading ? <CircularProgress size={14} /> : <CloudUpload />}
                  onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? 'Uploading...' : 'Upload Image'}
                </Button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
              </Box>
            </Grid>
            <Grid item xs={12} sm={8}>
              <TextField label="Category Name *" value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} size="small" fullWidth />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Sort Order" type="number" value={form.order}
                onChange={(e) => setForm((p) => ({ ...p, order: e.target.value }))} size="small" fullWidth />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Description" value={form.description} multiline rows={2}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} size="small" fullWidth />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : editCat ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// ADMIN INVENTORY — reads from storeInventory collection
// ────────────────────────────────────────────────────────────────────────────
export const AdminInventory = () => {
  const { adminStore } = useStore();
  const [inventory, setInventory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [newStock, setNewStock] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    getDocs(query(collection(db, COLLECTIONS.CATEGORIES), orderBy('name')))
      .then((snap) => setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, []);

  useEffect(() => {
    const fetchInventory = async () => {
      if (!adminStore?.id) { setInventory([]); setLoading(false); return; }
      setLoading(true);
      const q = query(
        collection(db, COLLECTIONS.STORE_INVENTORY),
        where('storeId', '==', adminStore.id),
        orderBy('name')
      );
      const snap = await getDocs(q);
      setInventory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    };
    fetchInventory();
  }, [adminStore?.id]);

  const handleUpdateStock = async (item) => {
    const stockVal = parseInt(newStock);
    if (isNaN(stockVal) || stockVal < 0) return;
    await updateDoc(doc(db, COLLECTIONS.STORE_INVENTORY, item.id), {
      stock: stockVal,
      updatedAt: serverTimestamp(),
    });
    setInventory((prev) => prev.map((p) => p.id === item.id ? { ...p, stock: stockVal } : p));
    setEditId(null);
    setSuccess(`Stock for "${item.name}" updated to ${stockVal}`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const getCategoryName = (id) => categories.find((c) => c.id === id)?.name || '—';

  const filteredInventory = search
    ? inventory.filter((p) => p.name?.toLowerCase().includes(search.toLowerCase()))
    : inventory;

  // ── Mobile card ──
  const InventoryCard = ({ item }) => (
    <Paper elevation={0} sx={{
      border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 2.5, p: 1.5, mb: 1.5,
      background: item.stock <= 0 ? `${ZAP_COLORS.error}06` : item.stock <= 5 ? `${ZAP_COLORS.warning}06` : 'transparent',
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700} noWrap>{item.name}</Typography>
          <Typography variant="caption" color="text.secondary">{item.unit || '—'}</Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="body2" fontWeight={700}>
            Stock: <Typography component="span" sx={{
              color: item.stock <= 0 ? ZAP_COLORS.error : item.stock <= 5 ? ZAP_COLORS.warning : ZAP_COLORS.accentGreen,
              fontWeight: 800,
            }}>{item.stock ?? 0}</Typography>
          </Typography>
          {item.stock <= 0 ? (
            <Chip label="OUT OF STOCK" size="small" sx={{ height: 18, fontSize: '0.65rem', background: `${ZAP_COLORS.error}15`, color: ZAP_COLORS.error }} />
          ) : item.stock <= 5 ? (
            <Chip label="LOW STOCK" size="small" sx={{ height: 18, fontSize: '0.65rem', background: `${ZAP_COLORS.warning}15`, color: ZAP_COLORS.warning }} />
          ) : (
            <Chip label="IN STOCK" size="small" sx={{ height: 18, fontSize: '0.65rem', background: `${ZAP_COLORS.accentGreen}15`, color: ZAP_COLORS.accentGreen }} />
          )}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip label={getCategoryName(item.categoryId)} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.68rem' }} />
        <Typography variant="caption" color="text.secondary">MRP: ₹{item.mrp || 0}</Typography>
        {item.sellRate ? <Typography variant="caption" sx={{ color: ZAP_COLORS.primary }}>Sell: ₹{item.sellRate}</Typography> : null}
      </Box>
      <Box sx={{ mt: 1 }}>
        {editId === item.id ? (
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <TextField value={newStock} onChange={(e) => setNewStock(e.target.value)} size="small" type="number" sx={{ width: 80 }} />
            <Button size="small" variant="contained" onClick={() => handleUpdateStock(item)}>Save</Button>
            <Button size="small" onClick={() => setEditId(null)}>×</Button>
          </Box>
        ) : (
          <Button size="small" variant="outlined" onClick={() => { setEditId(item.id); setNewStock(item.stock ?? 0); }}>
            Edit Stock
          </Button>
        )}
      </Box>
    </Paper>
  );

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif" }}>Inventory</Typography>
          <Typography variant="caption" color="text.secondary">
            {adminStore ? `Store: ${adminStore.name}` : 'Select a store'} — Stock managed via Purchases &amp; Orders
          </Typography>
        </Box>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}

      <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
        📦 Stock is auto-managed: <strong>Purchases</strong> add stock, <strong>Delivered orders</strong> deduct stock,
        <strong> Cancelled orders</strong> restore stock. Manual override available below.
      </Alert>

      <TextField
        placeholder="Search products..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small" sx={{ mb: 2, maxWidth: 320 }}
        InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
      />

      {/* Desktop table */}
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ background: `${ZAP_COLORS.primary}08` }}>
                {['Product', 'Unit', 'Category', 'MRP', 'Sell Rate', 'Cost Price', 'Stock', 'Status', 'Update Stock'].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.78rem', color: ZAP_COLORS.textSecondary }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
              ) : filteredInventory.length === 0 ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4, color: ZAP_COLORS.textMuted }}>
                  No inventory found. Record a purchase to add stock.
                </TableCell></TableRow>
              ) : filteredInventory.map((item) => (
                <TableRow key={item.id} hover sx={{
                  background: item.stock <= 0 ? `${ZAP_COLORS.error}06` : item.stock <= 5 ? `${ZAP_COLORS.warning}06` : 'transparent',
                }}>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.82rem' }}>{item.name}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>{item.unit || '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>{getCategoryName(item.categoryId)}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>₹{item.mrp || 0}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', color: ZAP_COLORS.primary, fontWeight: 600 }}>
                    {item.sellRate ? `₹${item.sellRate}` : '—'}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', color: ZAP_COLORS.textMuted }}>
                    {item.costPrice ? `₹${item.costPrice}` : '—'}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.82rem' }}>{item.stock ?? 0}</TableCell>
                  <TableCell>
                    {item.stock <= 0
                      ? <Typography variant="caption" sx={{ color: ZAP_COLORS.error, fontWeight: 700 }}>OUT OF STOCK</Typography>
                      : item.stock <= 5
                      ? <Typography variant="caption" sx={{ color: ZAP_COLORS.warning, fontWeight: 700 }}>LOW STOCK</Typography>
                      : <Typography variant="caption" sx={{ color: ZAP_COLORS.accentGreen, fontWeight: 700 }}>IN STOCK</Typography>
                    }
                  </TableCell>
                  <TableCell>
                    {editId === item.id ? (
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        <TextField value={newStock} onChange={(e) => setNewStock(e.target.value)} size="small" type="number" sx={{ width: 80 }} />
                        <Button size="small" variant="contained" onClick={() => handleUpdateStock(item)}>Save</Button>
                        <Button size="small" onClick={() => setEditId(null)}>×</Button>
                      </Box>
                    ) : (
                      <Button size="small" variant="outlined" onClick={() => { setEditId(item.id); setNewStock(item.stock ?? 0); }}>
                        Edit
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Mobile cards */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
        ) : filteredInventory.length === 0 ? (
          <Paper elevation={0} sx={{ border: `1px dashed ${ZAP_COLORS.border}`, borderRadius: 3, p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">No inventory found. Record a purchase to add stock.</Typography>
          </Paper>
        ) : filteredInventory.map((item) => (
          <InventoryCard key={item.id} item={item} />
        ))}
      </Box>
    </Box>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// ADMIN SALES REPORT (unchanged — already store-scoped)
// ────────────────────────────────────────────────────────────────────────────
export const AdminSalesReport = () => {
  const { adminStore } = useStore();
  const [startDate, setStartDate] = useState(dayjs().startOf('month'));
  const [endDate, setEndDate] = useState(dayjs());
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, count: 0, avg: 0, cod: 0, online: 0 });

  const fetchReport = async () => {
    setLoading(true);
    try {
      const start = Timestamp.fromDate(startDate.toDate());
      const end = Timestamp.fromDate(endDate.endOf('day').toDate());
      const orderConstraints = [
        where('createdAt', '>=', start),
        where('createdAt', '<=', end),
        orderBy('createdAt', 'desc'),
      ];
      if (adminStore?.id) orderConstraints.unshift(where('storeId', '==', adminStore.id));
      const snap = await getDocs(query(collection(db, COLLECTIONS.ORDERS), ...orderConstraints));
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders(docs);
      const total = docs.reduce((s, o) => s + (o.total || 0), 0);
      const cod = docs.filter((o) => o.paymentMethod === 'cod').reduce((s, o) => s + (o.total || 0), 0);
      const online = docs.filter((o) => o.paymentMethod !== 'cod').reduce((s, o) => s + (o.total || 0), 0);
      setStats({ total, count: docs.length, avg: docs.length ? total / docs.length : 0, cod, online });
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchReport(); }, [adminStore?.id]);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif", mb: 3 }}>Sales Report</Typography>

      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          <DatePicker label="From" value={startDate} onChange={setStartDate} slotProps={{ textField: { size: 'small' } }} />
          <DatePicker label="To" value={endDate} onChange={setEndDate} slotProps={{ textField: { size: 'small' } }} />
          <Button variant="contained" onClick={fetchReport} disabled={loading}>
            {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Generate'}
          </Button>
        </Box>
      </LocalizationProvider>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Revenue', value: formatCurrency(stats.total), color: ZAP_COLORS.primary },
          { label: 'Orders', value: stats.count, color: ZAP_COLORS.info },
          { label: 'Avg Order', value: formatCurrency(stats.avg), color: ZAP_COLORS.accentGreen },
          { label: 'COD', value: formatCurrency(stats.cod), color: ZAP_COLORS.warning },
          { label: 'Online', value: formatCurrency(stats.online), color: '#8B5CF6' },
        ].map((s) => (
          <Grid item xs={6} sm={4} md={2.4} key={s.label}>
            <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, border: `1px solid ${ZAP_COLORS.border}`, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">{s.label}</Typography>
              <Typography variant="h6" fontWeight={800} sx={{ color: s.color }}>{s.value}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ background: `${ZAP_COLORS.primary}08` }}>
              {['Order #', 'Customer', 'Total', 'Payment', 'Status', 'Date'].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.78rem', color: ZAP_COLORS.textSecondary }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
            ) : orders.length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: ZAP_COLORS.textMuted }}>No orders in this range.</TableCell></TableRow>
            ) : orders.map((o) => (
              <TableRow key={o.id} hover>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem' }}>#{o.orderNumber}</TableCell>
                <TableCell sx={{ fontSize: '0.78rem' }}>{o.customerName || '—'}</TableCell>
                <TableCell sx={{ fontWeight: 600, color: ZAP_COLORS.primary, fontSize: '0.78rem' }}>{formatCurrency(o.total)}</TableCell>
                <TableCell>
                  <Chip label={o.paymentMethod === 'cod' ? 'COD' : 'Online'} size="small"
                    sx={{ height: 20, fontSize: '0.68rem', background: o.paymentMethod === 'cod' ? `${ZAP_COLORS.warning}15` : `${ZAP_COLORS.accentGreen}15` }} />
                </TableCell>
                <TableCell>
                  <Chip label={o.status} size="small" sx={{ height: 20, fontSize: '0.68rem', textTransform: 'capitalize' }} />
                </TableCell>
                <TableCell sx={{ fontSize: '0.78rem' }}>
                  {o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString() : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};