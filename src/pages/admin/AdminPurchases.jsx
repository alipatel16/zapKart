import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Select, MenuItem,
  FormControl, InputLabel, CircularProgress, Alert, Grid,
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import {
  collection, query, orderBy, getDocs, doc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, limit, startAfter, where, getDoc,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { ZAP_COLORS } from '../../theme';
import { useStore } from '../../context/StoreContext';
import { formatCurrency, formatDate } from '../../utils/helpers';

const PAGE_SIZE = 15;
const EMPTY_FORM = {
  items: [{ productId: '', productName: '', quantity: '', costPrice: '' }],
  supplier: '', notes: '',
  date: new Date().toISOString().slice(0, 10),
};

const AdminPurchases = () => {
  const { adminStore } = useStore();
  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [editPurchase, setEditPurchase] = useState(null); // purchase being edited
  const [form, setForm] = useState(EMPTY_FORM);
  const [success, setSuccess] = useState('');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const cursorsRef = useRef([null]);

  useEffect(() => {
    const col = adminStore?.id
      ? query(collection(db, COLLECTIONS.PRODUCTS), where('storeId', '==', adminStore.id), orderBy('name'))
      : query(collection(db, COLLECTIONS.PRODUCTS), orderBy('name'));
    getDocs(col).then((snap) => setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [adminStore?.id]);

  const fetchPurchases = useCallback(async (pageIndex = 0) => {
    setLoading(true);
    try {
      const col = collection(db, COLLECTIONS.PURCHASE);
      const constraints = [orderBy('createdAt', 'desc')];
      if (adminStore?.id) constraints.unshift(where('storeId', '==', adminStore.id));

      const cursor = cursorsRef.current[pageIndex];
      const q = cursor
        ? query(col, ...constraints, limit(PAGE_SIZE), startAfter(cursor))
        : query(col, ...constraints, limit(PAGE_SIZE));
      const snap = await getDocs(q);
      setPurchases(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPage(pageIndex);
      if (snap.docs.length > 0) cursorsRef.current[pageIndex + 1] = snap.docs[snap.docs.length - 1];
    } finally { setLoading(false); }
  }, [adminStore?.id]);

  useEffect(() => { cursorsRef.current = [null]; fetchPurchases(0); }, [adminStore?.id]);

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

  const openAdd = () => {
    setEditPurchase(null);
    setForm(EMPTY_FORM);
    setDialog(true);
  };

  const openEdit = (purchase) => {
    setEditPurchase(purchase);
    setForm({
      items: purchase.items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        quantity: String(i.quantity),
        costPrice: String(i.costPrice),
      })),
      supplier: purchase.supplier || '',
      notes: purchase.notes || '',
      date: purchase.date || new Date().toISOString().slice(0, 10),
    });
    setDialog(true);
  };

  const handleSave = async () => {
    if (form.items.some((i) => !i.productId || !i.quantity || !i.costPrice)) {
      alert('Please fill all item details');
      return;
    }
    setSaving(true);
    try {
      const newItems = form.items.map((i) => ({
        ...i,
        quantity: parseInt(i.quantity),
        costPrice: parseFloat(i.costPrice),
      }));

      if (editPurchase) {
        // ── EDIT: adjust stock by the DELTA only ──
        const purchaseData = {
          ...form,
          items: newItems,
          totalCost,
          updatedAt: serverTimestamp(),
        };
        await updateDoc(doc(db, COLLECTIONS.PURCHASE, editPurchase.id), purchaseData);

        // For each item, calculate the difference from old quantity
        for (const newItem of newItems) {
          const oldItem = editPurchase.items.find((o) => o.productId === newItem.productId);
          const oldQty = oldItem ? oldItem.quantity : 0;
          const delta = newItem.quantity - oldQty;

          if (delta !== 0) {
            const productSnap = await getDoc(doc(db, COLLECTIONS.PRODUCTS, newItem.productId));
            if (productSnap.exists()) {
              const currentStock = productSnap.data().stock || 0;
              await updateDoc(doc(db, COLLECTIONS.PRODUCTS, newItem.productId), {
                stock: Math.max(0, currentStock + delta),
                updatedAt: serverTimestamp(),
              });
              setProducts((prev) => prev.map((p) => p.id === newItem.productId
                ? { ...p, stock: Math.max(0, (p.stock || 0) + delta) } : p));
            }
          }
        }

        // Handle items that were in old purchase but removed in new edit
        for (const oldItem of editPurchase.items) {
          const stillExists = newItems.find((n) => n.productId === oldItem.productId);
          if (!stillExists) {
            const productSnap = await getDoc(doc(db, COLLECTIONS.PRODUCTS, oldItem.productId));
            if (productSnap.exists()) {
              const currentStock = productSnap.data().stock || 0;
              await updateDoc(doc(db, COLLECTIONS.PRODUCTS, oldItem.productId), {
                stock: Math.max(0, currentStock - oldItem.quantity),
                updatedAt: serverTimestamp(),
              });
              setProducts((prev) => prev.map((p) => p.id === oldItem.productId
                ? { ...p, stock: Math.max(0, (p.stock || 0) - oldItem.quantity) } : p));
            }
          }
        }

        setSuccess('Purchase updated and inventory adjusted!');
      } else {
        // ── ADD: new purchase, add full quantities to stock ──
        const purchaseData = {
          ...form,
          storeId: adminStore?.id || null,
          items: newItems,
          totalCost,
          createdAt: serverTimestamp(),
        };
        await addDoc(collection(db, COLLECTIONS.PURCHASE), purchaseData);

        for (const item of newItems) {
          const productSnap = await getDoc(doc(db, COLLECTIONS.PRODUCTS, item.productId));
          if (productSnap.exists()) {
            const currentStock = productSnap.data().stock || 0;
            await updateDoc(doc(db, COLLECTIONS.PRODUCTS, item.productId), {
              stock: currentStock + item.quantity,
              updatedAt: serverTimestamp(),
            });
            setProducts((prev) => prev.map((p) => p.id === item.productId
              ? { ...p, stock: (p.stock || 0) + item.quantity } : p));
          }
        }
        setSuccess('Purchase recorded and inventory updated!');
      }

      setDialog(false);
      setForm(EMPTY_FORM);
      cursorsRef.current = [null];
      fetchPurchases(0);
      setTimeout(() => setSuccess(''), 4000);
    } finally { setSaving(false); }
  };

  const handleDelete = async (purchase) => {
    if (!window.confirm('Delete this purchase? Stock will be deducted accordingly.')) return;
    try {
      await deleteDoc(doc(db, COLLECTIONS.PURCHASE, purchase.id));

      // Deduct stock for all items in this purchase
      for (const item of purchase.items) {
        const productSnap = await getDoc(doc(db, COLLECTIONS.PRODUCTS, item.productId));
        if (productSnap.exists()) {
          const currentStock = productSnap.data().stock || 0;
          await updateDoc(doc(db, COLLECTIONS.PRODUCTS, item.productId), {
            stock: Math.max(0, currentStock - item.quantity),
            updatedAt: serverTimestamp(),
          });
          setProducts((prev) => prev.map((p) => p.id === item.productId
            ? { ...p, stock: Math.max(0, (p.stock || 0) - item.quantity) } : p));
        }
      }

      setPurchases((prev) => prev.filter((p) => p.id !== purchase.id));
      setSuccess('Purchase deleted and inventory adjusted!');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif" }}>Purchases</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openAdd}>
          Record Purchase
        </Button>
      </Box>
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}

      <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ background: `${ZAP_COLORS.primary}08` }}>
              {['Date', 'Supplier', 'Items', 'Total Cost', 'Notes', 'Actions'].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.78rem', color: ZAP_COLORS.textSecondary }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
              : purchases.length === 0
              ? <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: ZAP_COLORS.textMuted }}>No purchases recorded yet.</TableCell></TableRow>
              : purchases.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell sx={{ fontSize: '0.78rem' }}>{p.date || formatDate(p.createdAt)}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>{p.supplier || '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>
                    {p.items?.map((i) => `${i.productName} ×${i.quantity}`).join(', ')}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', fontWeight: 600, color: ZAP_COLORS.primary }}>
                    {formatCurrency(p.totalCost)}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', color: ZAP_COLORS.textMuted }}>{p.notes || '—'}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => openEdit(p)} title="Edit purchase">
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleDelete(p)} sx={{ color: ZAP_COLORS.error }} title="Delete purchase">
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </TableContainer>

      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 3, alignItems: 'center' }}>
          <Button size="small" variant="outlined" disabled={page === 0} onClick={() => fetchPurchases(page - 1)}>← Prev</Button>
          <Typography variant="body2">{page + 1} / {totalPages}</Typography>
          <Button size="small" variant="outlined" disabled={page >= totalPages - 1} onClick={() => fetchPurchases(page + 1)}>Next →</Button>
        </Box>
      )}

      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle fontWeight={700}>{editPurchase ? 'Edit Purchase' : 'Record New Purchase'}</DialogTitle>
        <DialogContent dividers>
          {editPurchase && (
            <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
              Editing a purchase will adjust inventory by the <strong>difference</strong> in quantities. Only the change in stock will be applied.
            </Alert>
          )}
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
            {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : editPurchase ? 'Update Purchase' : 'Record Purchase & Update Stock'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminPurchases;