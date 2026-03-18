import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, CircularProgress, Alert, Select,
  MenuItem, FormControl, InputLabel, Chip, IconButton, Grid,
} from '@mui/material';
import { Add, Visibility } from '@mui/icons-material';
import {
  collection, query, orderBy, getDocs, doc, addDoc, updateDoc,
  serverTimestamp, limit, startAfter, getCountFromServer,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { formatDate, formatCurrency } from '../../utils/helpers';
import { ZAP_COLORS } from '../../theme';

const PAGE_SIZE = 15;

const AdminPurchases = () => {
  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const cursorsRef = useRef([null]);
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    items: [{ productId: '', productName: '', quantity: '', costPrice: '' }],
    supplier: '', notes: '', date: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    getDocs(query(collection(db, COLLECTIONS.PRODUCTS), orderBy('name')))
      .then((snap) => setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    fetchPurchases(0);
  }, []);

  const fetchPurchases = async (pageIndex = 0) => {
    setLoading(true);
    try {
      const col = collection(db, COLLECTIONS.PURCHASE);
      const constraints = [orderBy('createdAt', 'desc')];
      const countSnap = await getCountFromServer(query(col, ...constraints));
      setTotalPages(Math.ceil(countSnap.data().count / PAGE_SIZE));

      const cursor = cursorsRef.current[pageIndex];
      const q = cursor
        ? query(col, ...constraints, limit(PAGE_SIZE), startAfter(cursor))
        : query(col, ...constraints, limit(PAGE_SIZE));
      const snap = await getDocs(q);
      setPurchases(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPage(pageIndex);
      if (snap.docs.length > 0) cursorsRef.current[pageIndex + 1] = snap.docs[snap.docs.length - 1];
    } finally { setLoading(false); }
  };

  const addItem = () => setForm((p) => ({
    ...p, items: [...p.items, { productId: '', productName: '', quantity: '', costPrice: '' }],
  }));

  const removeItem = (idx) => setForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));

  const updateItem = (idx, field, value) => {
    const newItems = [...form.items];
    newItems[idx] = { ...newItems[idx], [field]: value };
    if (field === 'productId') {
      const product = products.find((p) => p.id === value);
      if (product) newItems[idx].productName = product.name;
    }
    setForm((p) => ({ ...p, items: newItems }));
  };

  const totalCost = form.items.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity || 0) * parseFloat(item.costPrice || 0));
  }, 0);

  const handleSave = async () => {
    if (form.items.some((i) => !i.productId || !i.quantity || !i.costPrice)) {
      alert('Please fill all item details');
      return;
    }
    setSaving(true);
    try {
      const purchaseData = {
        ...form,
        items: form.items.map((i) => ({ ...i, quantity: parseInt(i.quantity), costPrice: parseFloat(i.costPrice) })),
        totalCost,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, COLLECTIONS.PURCHASE), purchaseData);

      // Update inventory for each item
      for (const item of form.items) {
        const product = products.find((p) => p.id === item.productId);
        if (product) {
          await updateDoc(doc(db, COLLECTIONS.PRODUCTS, item.productId), {
            stock: (product.stock || 0) + parseInt(item.quantity),
            updatedAt: serverTimestamp(),
          });
          // Update local products state
          setProducts((prev) => prev.map((p) => p.id === item.productId
            ? { ...p, stock: (p.stock || 0) + parseInt(item.quantity) } : p));
        }
      }

      setDialog(false);
      setForm({ items: [{ productId: '', productName: '', quantity: '', costPrice: '' }], supplier: '', notes: '', date: new Date().toISOString().slice(0, 10) });
      cursorsRef.current = [null];
      fetchPurchases(0);
      setSuccess('Purchase recorded and inventory updated!');
      setTimeout(() => setSuccess(''), 4000);
    } finally { setSaving(false); }
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif" }}>Purchases</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDialog(true)}>
          Record Purchase
        </Button>
      </Box>
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}

      <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ background: `${ZAP_COLORS.primary}08` }}>
              {['Date', 'Supplier', 'Items', 'Total Cost', 'Notes'].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.78rem', color: ZAP_COLORS.textSecondary }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
              : purchases.length === 0
              ? <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: ZAP_COLORS.textMuted }}>No purchases recorded yet</TableCell></TableRow>
              : purchases.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell sx={{ fontSize: '0.78rem' }}>{p.date || formatDate(p.createdAt)?.split(',')[0]}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>{p.supplier || '—'}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.4, flexWrap: 'wrap' }}>
                      {p.items?.slice(0, 2).map((item, i) => (
                        <Chip key={i} label={`${item.productName} ×${item.quantity}`} size="small" sx={{ fontSize: '0.65rem', height: 18 }} />
                      ))}
                      {p.items?.length > 2 && <Chip label={`+${p.items.length - 2} more`} size="small" sx={{ fontSize: '0.65rem', height: 18 }} />}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', fontWeight: 700, color: ZAP_COLORS.primary }}>{formatCurrency(p.totalCost)}</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', color: ZAP_COLORS.textMuted }}>{p.notes || '—'}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>

      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 3 }}>
          <Button size="small" variant="outlined" disabled={page === 0} onClick={() => fetchPurchases(page - 1)}>← Prev</Button>
          <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', px: 1 }}>{page + 1} / {totalPages}</Typography>
          <Button size="small" variant="outlined" disabled={page >= totalPages - 1} onClick={() => fetchPurchases(page + 1)}>Next →</Button>
        </Box>
      )}

      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle fontWeight={700}>Record New Purchase</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={4}>
              <TextField label="Supplier Name" value={form.supplier} onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))} size="small" fullWidth />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Purchase Date" type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} size="small" fullWidth InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} size="small" fullWidth />
            </Grid>
          </Grid>

          <Typography variant="subtitle2" fontWeight={700} mb={1}>Items Purchased</Typography>
          {form.items.map((item, idx) => (
            <Box key={idx} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 1.5, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
              <FormControl size="small" sx={{ minWidth: 200, flex: 2 }}>
                <InputLabel>Product *</InputLabel>
                <Select value={item.productId} onChange={(e) => updateItem(idx, 'productId', e.target.value)} label="Product *">
                  {products.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField
                label="Qty *" type="number" value={item.quantity}
                onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                size="small" sx={{ width: 80 }}
              />
              <TextField
                label="Cost/unit (₹) *" type="number" value={item.costPrice}
                onChange={(e) => updateItem(idx, 'costPrice', e.target.value)}
                size="small" sx={{ width: 110 }}
              />
              <Typography variant="body2" fontWeight={600} sx={{ minWidth: 64 }}>
                ₹{((parseFloat(item.quantity || 0)) * (parseFloat(item.costPrice || 0))).toFixed(0)}
              </Typography>
              {form.items.length > 1 && (
                <IconButton size="small" onClick={() => removeItem(idx)} sx={{ color: ZAP_COLORS.error }}>×</IconButton>
              )}
            </Box>
          ))}
          <Button size="small" startIcon={<Add />} onClick={addItem} sx={{ mt: 0.5 }}>Add Item</Button>

          <Box sx={{ mt: 2, p: 1.5, background: `${ZAP_COLORS.primary}08`, borderRadius: 2, display: 'flex', justifyContent: 'space-between' }}>
            <Typography fontWeight={700}>Total Purchase Cost</Typography>
            <Typography fontWeight={800} color="primary">{formatCurrency(totalCost)}</Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Record Purchase & Update Stock'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminPurchases;
