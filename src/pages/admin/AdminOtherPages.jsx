// ============================================================
// ADMIN CATEGORIES
// ============================================================
import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Switch, CircularProgress,
  Alert, Avatar, Grid,
} from '@mui/material';
import { Add, Edit, Delete, CloudUpload } from '@mui/icons-material';
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
    const snap = await getDocs(query(collection(db, COLLECTIONS.CATEGORIES), orderBy('order')));
    setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const openAdd = () => { setEditCat(null); setForm(EMPTY_CAT); setDialog(true); };
  const openEdit = (c) => { setEditCat(c); setForm({ ...EMPTY_CAT, ...c }); setDialog(true); };

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
    setSaving(true);
    try {
      if (editCat) {
        await updateDoc(doc(db, COLLECTIONS.CATEGORIES, editCat.id), { ...form, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, COLLECTIONS.CATEGORIES), { ...form, createdAt: serverTimestamp() });
      }
      setDialog(false); fetch();
      setSuccess(editCat ? 'Category updated!' : 'Category added!');
      setTimeout(() => setSuccess(''), 3000);
    } finally { setSaving(false); }
  };

  const handleDelete = async (cat) => {
    if (!window.confirm(`Delete "${cat.name}"?`)) return;
    await deleteDoc(doc(db, COLLECTIONS.CATEGORIES, cat.id));
    fetch();
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif" }}>Categories</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openAdd}>Add Category</Button>
      </Box>
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}
      <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ background: `${ZAP_COLORS.primary}08` }}>
              {['Image', 'Name', 'Order', 'Active', 'Actions'].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.78rem', color: ZAP_COLORS.textSecondary }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
              : categories.map((cat) => (
                <TableRow key={cat.id} hover>
                  <TableCell><Avatar src={cat.imageUrl} variant="rounded" sx={{ width: 36, height: 36, background: `${ZAP_COLORS.primary}10` }}>{cat.name?.[0]}</Avatar></TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{cat.name}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{cat.order}</TableCell>
                  <TableCell>
                    <Switch size="small" checked={!!cat.active} onChange={() => updateDoc(doc(db, COLLECTIONS.CATEGORIES, cat.id), { active: !cat.active }).then(fetch)} />
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => openEdit(cat)}><Edit fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => handleDelete(cat)} sx={{ color: ZAP_COLORS.error }}><Delete fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>{editCat ? 'Edit Category' : 'Add Category'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar src={form.imageUrl} variant="rounded" sx={{ width: 64, height: 64 }}>{form.name?.[0]}</Avatar>
              <Button variant="outlined" size="small" startIcon={uploading ? <CircularProgress size={14} /> : <CloudUpload />} onClick={() => fileRef.current?.click()} disabled={uploading}>
                Upload Image
              </Button>
              <input ref={fileRef} type="file" hidden accept="image/*" onChange={handleImageUpload} />
            </Box>
            <TextField label="Category Name *" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} size="small" fullWidth required />
            <TextField label="Description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} size="small" fullWidth />
            <TextField label="Display Order" value={form.order} onChange={(e) => setForm((p) => ({ ...p, order: parseInt(e.target.value) || 0 }))} size="small" type="number" />
          </Box>
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

export const AdminInventory = () => {
  const { adminStore } = useStore();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [newStock, setNewStock] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const q = adminStore?.id
        ? query(collection(db, COLLECTIONS.PRODUCTS), where('storeId', '==', adminStore.id), orderBy('name'))
        : query(collection(db, COLLECTIONS.PRODUCTS), orderBy('name'));
      const snap = await getDocs(q);
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    };
    fetch();
  }, []);

  const handleUpdateStock = async (product) => {
    await updateDoc(doc(db, COLLECTIONS.PRODUCTS, product.id), { stock: parseInt(newStock), updatedAt: serverTimestamp() });
    setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, stock: parseInt(newStock) } : p));
    setEditId(null);
    setSuccess(`Stock for "${product.name}" updated to ${newStock}`);
    setTimeout(() => setSuccess(''), 3000);
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif", mb: 3 }}>Inventory</Typography>
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}
      <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ background: `${ZAP_COLORS.primary}08` }}>
              {['Product', 'Category', 'MRP', 'Sale Price', 'Stock', 'Status', 'Update Stock'].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.78rem', color: ZAP_COLORS.textSecondary }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
              : products.map((p) => (
                <TableRow key={p.id} hover sx={{ background: p.stock <= 0 ? `${ZAP_COLORS.error}06` : p.stock <= 5 ? `${ZAP_COLORS.warning}06` : 'transparent' }}>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.82rem' }}>{p.name}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>{p.unit || '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>₹{p.mrp}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', color: ZAP_COLORS.primary, fontWeight: 600 }}>{p.discountedPrice ? `₹${p.discountedPrice}` : '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.82rem', fontWeight: 700 }}>{p.stock}</TableCell>
                  <TableCell>
                    {p.stock <= 0
                      ? <Typography variant="caption" sx={{ color: ZAP_COLORS.error, fontWeight: 700 }}>OUT OF STOCK</Typography>
                      : p.stock <= 5
                      ? <Typography variant="caption" sx={{ color: ZAP_COLORS.warning, fontWeight: 700 }}>LOW STOCK</Typography>
                      : <Typography variant="caption" sx={{ color: ZAP_COLORS.accentGreen, fontWeight: 700 }}>IN STOCK</Typography>
                    }
                  </TableCell>
                  <TableCell>
                    {editId === p.id ? (
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        <TextField value={newStock} onChange={(e) => setNewStock(e.target.value)} size="small" type="number" sx={{ width: 80 }} />
                        <Button size="small" variant="contained" onClick={() => handleUpdateStock(p)}>Save</Button>
                        <Button size="small" onClick={() => setEditId(null)}>×</Button>
                      </Box>
                    ) : (
                      <Button size="small" variant="outlined" onClick={() => { setEditId(p.id); setNewStock(p.stock); }}>
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
  );
};

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

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif", mb: 3 }}>Sales Report</Typography>

        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <DatePicker label="Start Date" value={startDate} onChange={setStartDate} slotProps={{ textField: { size: 'small' } }} />
          <DatePicker label="End Date" value={endDate} onChange={setEndDate} slotProps={{ textField: { size: 'small' } }} />
          <Button variant="contained" onClick={fetchReport} disabled={loading}>
            {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Generate Report'}
          </Button>
        </Box>

        {orders.length > 0 && (
          <>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {[
                { label: 'Total Revenue', value: formatCurrency(stats.total), color: ZAP_COLORS.primary },
                { label: 'Total Orders', value: stats.count, color: ZAP_COLORS.info },
                { label: 'Avg Order Value', value: formatCurrency(stats.avg), color: ZAP_COLORS.accentGreen },
                { label: 'COD Revenue', value: formatCurrency(stats.cod), color: ZAP_COLORS.warning },
                { label: 'Online Revenue', value: formatCurrency(stats.online), color: '#8B5CF6' },
              ].map((s) => (
                <Grid item xs={6} sm={4} md={2.4} key={s.label}>
                  <Paper elevation={0} sx={{ p: 2, border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                    <Typography variant="h6" fontWeight={800} sx={{ color: s.color, fontFamily: "'Syne', sans-serif" }}>{s.value}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ background: `${ZAP_COLORS.primary}08` }}>
                    {['Order #', 'Customer', 'Items', 'Payment', 'Status', 'Total', 'Date'].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.78rem', color: ZAP_COLORS.textSecondary }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id} hover>
                      <TableCell sx={{ fontSize: '0.78rem', fontWeight: 700 }}>#{o.orderNumber}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem' }}>{o.customerName}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem' }}>{o.items?.length}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem' }}>{o.paymentMethod === 'cod' ? 'COD' : 'Online'}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem' }}>{o.status}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', fontWeight: 700, color: ZAP_COLORS.primary }}>₹{o.total}</TableCell>
                      <TableCell sx={{ fontSize: '0.72rem', color: ZAP_COLORS.textMuted }}>
                        {o.createdAt?.toDate?.().toLocaleDateString('en-IN') || ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {orders.length === 0 && !loading && (
          <Box sx={{ textAlign: 'center', py: 8, color: ZAP_COLORS.textMuted }}>
            <Typography variant="h6">Select a date range and generate report</Typography>
          </Box>
        )}
      </Box>
    </LocalizationProvider>
  );
};
