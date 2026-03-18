import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Select, MenuItem,
  FormControl, InputLabel, Switch, FormControlLabel, Chip,
  CircularProgress, Alert, InputAdornment, Grid, Avatar,
} from '@mui/material';
import { Add, Edit, Delete, Search, CloudUpload } from '@mui/icons-material';
import {
  collection, query, orderBy, getDocs, doc, addDoc, updateDoc,
  deleteDoc, serverTimestamp, limit, startAfter, getCountFromServer, where,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, COLLECTIONS } from '../../firebase';
import { ZAP_COLORS } from '../../theme';

const PAGE_SIZE = 15;
const EMPTY_PRODUCT = {
  name: '', categoryId: '', description: '', mrp: '', discountedPrice: '',
  unit: '', stock: '', images: [], isFeatured: false, isExclusive: false,
  isNewArrival: false, active: true,
};

const AdminProducts = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const cursorsRef = useRef([null]);
  const [dialog, setDialog] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const fileRef = useRef();

  useEffect(() => {
    getDocs(query(collection(db, COLLECTIONS.CATEGORIES), orderBy('name')))
      .then((snap) => setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, []);

  const fetchProducts = useCallback(async (pageIndex = 0) => {
    setLoading(true);
    try {
      const col = collection(db, COLLECTIONS.PRODUCTS);
      const constraints = [orderBy('createdAt', 'desc')];

      const countSnap = await getCountFromServer(query(col, ...constraints));
      setTotalPages(Math.ceil(countSnap.data().count / PAGE_SIZE));

      const cursor = cursorsRef.current[pageIndex];
      const q = cursor
        ? query(col, ...constraints, limit(PAGE_SIZE), startAfter(cursor))
        : query(col, ...constraints, limit(PAGE_SIZE));

      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProducts(docs);
      setPage(pageIndex);
      if (snap.docs.length > 0) cursorsRef.current[pageIndex + 1] = snap.docs[snap.docs.length - 1];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProducts(0); }, []);

  const openAdd = () => { setEditProduct(null); setForm(EMPTY_PRODUCT); setError(''); setDialog(true); };
  const openEdit = (p) => { setEditProduct(p); setForm({ ...EMPTY_PRODUCT, ...p }); setError(''); setDialog(true); };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setForm((prev) => ({ ...prev, images: [...(prev.images || []), url] }));
    } catch (err) {
      setError('Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (idx) => {
    setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    if (!form.name || !form.categoryId || !form.mrp || form.stock === '') {
      setError('Please fill all required fields (Name, Category, MRP, Stock)');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = {
        ...form,
        mrp: parseFloat(form.mrp),
        discountedPrice: form.discountedPrice ? parseFloat(form.discountedPrice) : null,
        stock: parseInt(form.stock),
        updatedAt: serverTimestamp(),
      };
      if (editProduct) {
        await updateDoc(doc(db, COLLECTIONS.PRODUCTS, editProduct.id), data);
        setProducts((prev) => prev.map((p) => p.id === editProduct.id ? { ...p, ...data } : p));
        setSuccessMsg('Product updated!');
      } else {
        data.createdAt = serverTimestamp();
        const ref = await addDoc(collection(db, COLLECTIONS.PRODUCTS), data);
        setProducts((prev) => [{ id: ref.id, ...data }, ...prev]);
        setSuccessMsg('Product added!');
      }
      setDialog(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    await deleteDoc(doc(db, COLLECTIONS.PRODUCTS, product.id));
    setProducts((prev) => prev.filter((p) => p.id !== product.id));
    setSuccessMsg('Product deleted');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const toggleActive = async (product) => {
    await updateDoc(doc(db, COLLECTIONS.PRODUCTS, product.id), { active: !product.active });
    setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, active: !p.active } : p));
  };

  const filteredProducts = products.filter((p) =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif" }}>
          Products
        </Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openAdd}>Add Product</Button>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{successMsg}</Alert>}

      <TextField
        placeholder="Search products..."
        value={search} onChange={(e) => setSearch(e.target.value)}
        size="small" sx={{ mb: 2, maxWidth: 360 }}
        InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
      />

      <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ background: `${ZAP_COLORS.primary}08` }}>
              {['Image', 'Name', 'Category', 'MRP', 'Price', 'Stock', 'Tags', 'Active', 'Actions'].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.78rem', color: ZAP_COLORS.textSecondary, whiteSpace: 'nowrap' }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
            ) : filteredProducts.map((product) => (
              <TableRow key={product.id} hover>
                <TableCell>
                  <Avatar
                    src={product.images?.[0]}
                    variant="rounded"
                    sx={{ width: 40, height: 40, background: `${ZAP_COLORS.primary}10` }}
                  >
                    {product.name?.[0]}
                  </Avatar>
                </TableCell>
                <TableCell sx={{ fontSize: '0.8rem', fontWeight: 500, maxWidth: 150 }}>
                  <Typography variant="body2" noWrap fontWeight={600}>{product.name}</Typography>
                  {product.unit && <Typography variant="caption" color="text.secondary">{product.unit}</Typography>}
                </TableCell>
                <TableCell sx={{ fontSize: '0.78rem' }}>
                  {categories.find((c) => c.id === product.categoryId)?.name || '—'}
                </TableCell>
                <TableCell sx={{ fontSize: '0.78rem' }}>₹{product.mrp}</TableCell>
                <TableCell sx={{ fontSize: '0.78rem', color: ZAP_COLORS.primary, fontWeight: 600 }}>
                  {product.discountedPrice ? `₹${product.discountedPrice}` : '—'}
                </TableCell>
                <TableCell>
                  <Chip
                    label={product.stock}
                    size="small"
                    sx={{
                      fontSize: '0.72rem',
                      background: product.stock <= 0 ? `${ZAP_COLORS.error}18`
                        : product.stock <= 5 ? `${ZAP_COLORS.warning}18`
                        : `${ZAP_COLORS.accentGreen}18`,
                      color: product.stock <= 0 ? ZAP_COLORS.error
                        : product.stock <= 5 ? ZAP_COLORS.warning
                        : ZAP_COLORS.accentGreen,
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.4, flexWrap: 'wrap' }}>
                    {product.isFeatured && <Chip label="⭐" size="small" sx={{ fontSize: '0.6rem', height: 16 }} />}
                    {product.isExclusive && <Chip label="💛" size="small" sx={{ fontSize: '0.6rem', height: 16 }} />}
                    {product.isNewArrival && <Chip label="🆕" size="small" sx={{ fontSize: '0.6rem', height: 16 }} />}
                  </Box>
                </TableCell>
                <TableCell>
                  <Switch
                    size="small" checked={!!product.active}
                    onChange={() => toggleActive(product)}
                    sx={{ '& .Mui-checked': { color: ZAP_COLORS.primary } }}
                  />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.3 }}>
                    <IconButton size="small" onClick={() => openEdit(product)}><Edit fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => handleDelete(product)} sx={{ color: ZAP_COLORS.error }}><Delete fontSize="small" /></IconButton>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 3 }}>
          <Button size="small" variant="outlined" disabled={page === 0} onClick={() => fetchProducts(page - 1)}>← Prev</Button>
          <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', px: 1 }}>{page + 1} / {totalPages}</Typography>
          <Button size="small" variant="outlined" disabled={page >= totalPages - 1} onClick={() => fetchProducts(page + 1)}>Next →</Button>
        </Box>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle fontWeight={700}>{editProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
        <DialogContent dividers>
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
          <Grid container spacing={2}>
            {/* Images */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" fontWeight={600} mb={1}>Product Images</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                {form.images?.map((img, i) => (
                  <Box key={i} sx={{ position: 'relative' }}>
                    <Box component="img" src={img} alt="" sx={{ width: 72, height: 72, borderRadius: 2, objectFit: 'cover', border: `1px solid ${ZAP_COLORS.border}` }} />
                    <IconButton size="small" onClick={() => removeImage(i)}
                      sx={{ position: 'absolute', top: -6, right: -6, background: ZAP_COLORS.error, color: '#fff', width: 18, height: 18 }}>
                      ×
                    </IconButton>
                  </Box>
                ))}
                <Button
                  variant="outlined" startIcon={uploading ? <CircularProgress size={14} /> : <CloudUpload />}
                  onClick={() => fileRef.current?.click()} disabled={uploading} size="small"
                  sx={{ height: 72, minWidth: 72, flexDirection: 'column', gap: 0.3, fontSize: '0.7rem' }}
                >
                  Upload
                </Button>
                <input ref={fileRef} type="file" hidden accept="image/*" onChange={handleImageUpload} />
              </Box>
            </Grid>

            <Grid item xs={12} sm={8}>
              <TextField label="Product Name *" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} fullWidth size="small" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Unit (e.g. 500g, 1L)" value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} fullWidth size="small" />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Category *</InputLabel>
                <Select value={form.categoryId} onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))} label="Category *">
                  {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField label="MRP (₹) *" value={form.mrp} onChange={(e) => setForm((p) => ({ ...p, mrp: e.target.value }))} fullWidth size="small" type="number" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField label="Sale Price (₹)" value={form.discountedPrice} onChange={(e) => setForm((p) => ({ ...p, discountedPrice: e.target.value }))} fullWidth size="small" type="number" />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField label="Stock Quantity *" value={form.stock} onChange={(e) => setForm((p) => ({ ...p, stock: e.target.value }))} fullWidth size="small" type="number" />
            </Grid>

            <Grid item xs={12}>
              <TextField label="Description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} fullWidth size="small" multiline rows={3} />
            </Grid>

            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {[
                  { key: 'isFeatured', label: '⭐ Featured' },
                  { key: 'isExclusive', label: '💛 Exclusive' },
                  { key: 'isNewArrival', label: '🆕 New Arrival' },
                  { key: 'active', label: '✅ Active' },
                ].map((flag) => (
                  <FormControlLabel
                    key={flag.key}
                    control={<Switch size="small" checked={!!form[flag.key]} onChange={(e) => setForm((p) => ({ ...p, [flag.key]: e.target.checked }))} />}
                    label={<Typography variant="body2">{flag.label}</Typography>}
                  />
                ))}
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : editProduct ? 'Update' : 'Add Product'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminProducts;
