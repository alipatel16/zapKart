import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Select, MenuItem,
  FormControl, InputLabel, Switch, FormControlLabel, Chip,
  CircularProgress, Alert, InputAdornment, Grid, Avatar, Tabs, Tab,
} from '@mui/material';
import { Add, Edit, Delete, Search, CloudUpload } from '@mui/icons-material';
import {
  collection, query, orderBy, getDocs, doc, addDoc, updateDoc,
  deleteDoc, serverTimestamp, limit, startAfter, getCountFromServer, where,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, COLLECTIONS } from '../../firebase';
import { ZAP_COLORS } from '../../theme';
import { useStore } from '../../context/StoreContext';

const PAGE_SIZE = 15;

const EMPTY_PRODUCT = {
  name: '', categoryId: '', description: '', mrp: '', discountedPrice: '',
  unit: '', images: [], isFeatured: false, isExclusive: false,
  isNewArrival: false, active: true,
};

const AdminProducts = () => {
  const { adminStore } = useStore();
  const [categories, setCategories] = useState([]);
  const [selectedCategoryTab, setSelectedCategoryTab] = useState('all');
  const [products, setProducts] = useState([]);
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

  // Fetch categories once
  useEffect(() => {
    getDocs(query(collection(db, COLLECTIONS.CATEGORIES), orderBy('name')))
      .then((snap) => setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, []);

  const fetchProducts = useCallback(async (pageIndex = 0, categoryId = 'all') => {
    setLoading(true);
    try {
      const col = collection(db, COLLECTIONS.PRODUCTS);
      const constraints = [orderBy('name')];
      if (adminStore?.id) constraints.unshift(where('storeId', '==', adminStore.id));
      if (categoryId !== 'all') constraints.unshift(where('categoryId', '==', categoryId));

      const countSnap = await getCountFromServer(query(col, ...constraints));
      setTotalPages(Math.ceil(countSnap.data().count / PAGE_SIZE));

      const cursor = cursorsRef.current[pageIndex];
      const q = cursor
        ? query(col, ...constraints, limit(PAGE_SIZE), startAfter(cursor))
        : query(col, ...constraints, limit(PAGE_SIZE));

      const snap = await getDocs(q);
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPage(pageIndex);
      if (snap.docs.length > 0) cursorsRef.current[pageIndex + 1] = snap.docs[snap.docs.length - 1];
    } finally {
      setLoading(false);
    }
  }, [adminStore?.id]);

  // Refetch whenever store or category tab changes
  useEffect(() => {
    cursorsRef.current = [null];
    setSearch('');
    fetchProducts(0, selectedCategoryTab);
  }, [adminStore?.id, selectedCategoryTab]);

  const handleTabChange = (_, val) => {
    setSelectedCategoryTab(val);
    cursorsRef.current = [null];
  };

  const openAdd = () => {
    setEditProduct(null);
    setForm({
      ...EMPTY_PRODUCT,
      categoryId: selectedCategoryTab !== 'all' ? selectedCategoryTab : '',
    });
    setError('');
    setDialog(true);
  };

  const openEdit = (p) => {
    setEditProduct(p);
    const { stock, ...rest } = p;
    setForm({ ...EMPTY_PRODUCT, ...rest });
    setError('');
    setDialog(true);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setForm((prev) => ({ ...prev, images: [...(prev.images || []), url] }));
    } catch {
      setError('Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (idx) =>
    setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }));

  const handleSave = async () => {
    if (!form.name || !form.categoryId || !form.mrp) {
      setError('Please fill all required fields (Name, Category, MRP)');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = {
        ...form,
        storeId: adminStore?.id || null,
        mrp: parseFloat(form.mrp),
        discountedPrice: form.discountedPrice ? parseFloat(form.discountedPrice) : null,
        updatedAt: serverTimestamp(),
      };
      if (editProduct) {
        await updateDoc(doc(db, COLLECTIONS.PRODUCTS, editProduct.id), data);
        setSuccessMsg('Product updated!');
      } else {
        data.stock = 0;
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, COLLECTIONS.PRODUCTS), data);
        setSuccessMsg('Product added! Add stock via Purchases.');
      }
      setDialog(false);
      cursorsRef.current = [null];
      fetchProducts(0, selectedCategoryTab);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    try {
      for (const url of product.images || []) {
        try { await deleteObject(ref(storage, url)); } catch {}
      }
      await deleteDoc(doc(db, COLLECTIONS.PRODUCTS, product.id));
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      setSuccessMsg('Product deleted!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleActive = async (product) => {
    await updateDoc(doc(db, COLLECTIONS.PRODUCTS, product.id), {
      active: !product.active, updatedAt: serverTimestamp(),
    });
    setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, active: !p.active } : p));
  };

  const getCategoryName = (id) => categories.find((c) => c.id === id)?.name || '—';

  // Client-side search filter
  const filteredProducts = search
    ? products.filter((p) => p.name?.toLowerCase().includes(search.toLowerCase()))
    : products;

  // Group products by category when "All" tab is selected
  const groupedByCategory = selectedCategoryTab === 'all'
    ? categories.reduce((acc, cat) => {
        const catProducts = filteredProducts.filter((p) => p.categoryId === cat.id);
        if (catProducts.length > 0) acc.push({ category: cat, products: catProducts });
        return acc;
      }, [])
    : null;

  // Products with no matching category (orphans)
  const orphanProducts = selectedCategoryTab === 'all'
    ? filteredProducts.filter((p) => !categories.find((c) => c.id === p.categoryId))
    : [];

  const FLAGS = [
    { key: 'isFeatured', label: '⭐ Featured' },
    { key: 'isExclusive', label: '💛 Exclusive' },
    { key: 'isNewArrival', label: '🆕 New Arrival' },
  ];

  const ProductRow = ({ product }) => (
    <TableRow hover>
      <TableCell>
        <Avatar src={product.images?.[0]} variant="rounded"
          sx={{ width: 40, height: 40, background: `${ZAP_COLORS.primary}10` }}>
          {product.name?.[0]}
        </Avatar>
      </TableCell>
      <TableCell sx={{ maxWidth: 160 }}>
        <Typography variant="body2" noWrap fontWeight={600}>{product.name}</Typography>
        {product.unit && <Typography variant="caption" color="text.secondary">{product.unit}</Typography>}
      </TableCell>
      {selectedCategoryTab === 'all' && (
        <TableCell sx={{ fontSize: '0.78rem' }}>{getCategoryName(product.categoryId)}</TableCell>
      )}
      <TableCell sx={{ fontSize: '0.78rem' }}>₹{product.mrp}</TableCell>
      <TableCell sx={{ fontSize: '0.78rem', color: ZAP_COLORS.primary, fontWeight: 600 }}>
        {product.discountedPrice ? `₹${product.discountedPrice}` : '—'}
      </TableCell>
      <TableCell>
        <Chip label={product.stock ?? 0} size="small" sx={{
          fontSize: '0.72rem',
          background: (product.stock ?? 0) <= 0 ? `${ZAP_COLORS.error}18`
            : (product.stock ?? 0) <= 5 ? `${ZAP_COLORS.warning}18`
            : `${ZAP_COLORS.accentGreen}18`,
          color: (product.stock ?? 0) <= 0 ? ZAP_COLORS.error
            : (product.stock ?? 0) <= 5 ? ZAP_COLORS.warning
            : ZAP_COLORS.accentGreen,
        }} />
      </TableCell>
      <TableCell>
        <Box sx={{ display: 'flex', gap: 0.4, flexWrap: 'wrap' }}>
          {product.isFeatured && <Chip label="⭐" size="small" sx={{ fontSize: '0.6rem', height: 16 }} />}
          {product.isExclusive && <Chip label="💛" size="small" sx={{ fontSize: '0.6rem', height: 16 }} />}
          {product.isNewArrival && <Chip label="🆕" size="small" sx={{ fontSize: '0.6rem', height: 16 }} />}
        </Box>
      </TableCell>
      <TableCell>
        <Switch size="small" checked={!product.active} onChange={() => toggleActive(product)} />
      </TableCell>
      <TableCell>
        <Box sx={{ display: 'flex', gap: 0.3 }}>
          <IconButton size="small" onClick={() => openEdit(product)}><Edit fontSize="small" /></IconButton>
          <IconButton size="small" onClick={() => handleDelete(product)} sx={{ color: ZAP_COLORS.error }}>
            <Delete fontSize="small" />
          </IconButton>
        </Box>
      </TableCell>
    </TableRow>
  );

  const TableHeader = ({ showCategory }) => (
    <TableHead>
      <TableRow sx={{ background: `${ZAP_COLORS.primary}08` }}>
        {['Image', 'Name', ...(showCategory ? ['Category'] : []), 'MRP', 'Sale Price', 'Stock', 'Flags', 'Active', 'Actions'].map((h) => (
          <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.78rem', color: ZAP_COLORS.textSecondary }}>{h}</TableCell>
        ))}
      </TableRow>
    </TableHead>
  );

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif" }}>Products</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openAdd}>Add Product</Button>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{successMsg}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
        📦 Stock is managed automatically via <strong>Purchases</strong> (adds stock) and <strong>Orders</strong> (deducts/restores stock).
      </Alert>

      {/* Category tabs */}
      <Box sx={{ borderBottom: `1px solid ${ZAP_COLORS.border}`, mb: 2 }}>
        <Tabs
          value={selectedCategoryTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ '& .MuiTab-root': { fontSize: '0.78rem', minWidth: 'auto', px: 1.5 } }}
        >
          <Tab label={`All (${products.length})`} value="all" />
          {categories.map((cat) => {
            const count = products.filter((p) => p.categoryId === cat.id).length;
            return <Tab key={cat.id} label={`${cat.name}${count ? ` (${count})` : ''}`} value={cat.id} />;
          })}
        </Tabs>
      </Box>

      {/* Search */}
      <TextField
        placeholder="Search products..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small" sx={{ mb: 2, maxWidth: 320 }}
        InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : selectedCategoryTab === 'all' ? (
        // ── Grouped by category view ─────────────────────────────────────
        <Box>
          {groupedByCategory?.length === 0 && orphanProducts.length === 0 && (
            <Paper elevation={0} sx={{ border: `1px dashed ${ZAP_COLORS.border}`, borderRadius: 3, p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No products found. Add your first product!</Typography>
            </Paper>
          )}

          {groupedByCategory?.map(({ category, products: catProducts }) => (
            <Box key={category.id} sx={{ mb: 3 }}>
              {/* Category header */}
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, mb: 1,
                px: 1.5, py: 1, borderRadius: 2,
                background: `${ZAP_COLORS.primary}08`,
                border: `1px solid ${ZAP_COLORS.primary}15`,
              }}>
                {category.imageUrl && (
                  <Box component="img" src={category.imageUrl} alt=""
                    sx={{ width: 28, height: 28, borderRadius: 1, objectFit: 'cover' }} />
                )}
                <Typography variant="subtitle2" fontWeight={700} sx={{ color: ZAP_COLORS.primary }}>
                  {category.name}
                </Typography>
                <Chip label={`${catProducts.length} product${catProducts.length !== 1 ? 's' : ''}`}
                  size="small" sx={{ fontSize: '0.68rem', height: 18, background: `${ZAP_COLORS.primary}15`, color: ZAP_COLORS.primary }} />
                <Button size="small" startIcon={<Add sx={{ fontSize: '14px !important' }} />}
                  onClick={() => {
                    setForm({ ...EMPTY_PRODUCT, categoryId: category.id });
                    setEditProduct(null); setError(''); setDialog(true);
                  }}
                  sx={{ ml: 'auto', fontSize: '0.72rem' }}>
                  Add to {category.name}
                </Button>
              </Box>

              <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 2 }}>
                <Table size="small">
                  <TableHeader showCategory={false} />
                  <TableBody>
                    {catProducts.map((product) => <ProductRow key={product.id} product={product} />)}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ))}

          {/* Orphan products (no category match) */}
          {orphanProducts.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1, px: 1.5, py: 1, borderRadius: 2, background: `${ZAP_COLORS.warning}08`, border: `1px solid ${ZAP_COLORS.warning}20` }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ color: ZAP_COLORS.warning }}>⚠️ Uncategorised</Typography>
                <Chip label={orphanProducts.length} size="small" sx={{ fontSize: '0.68rem', height: 18 }} />
              </Box>
              <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 2 }}>
                <Table size="small">
                  <TableHeader showCategory={true} />
                  <TableBody>
                    {orphanProducts.map((product) => <ProductRow key={product.id} product={product} />)}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Box>
      ) : (
        // ── Single category filtered view with pagination ─────────────────
        <Box>
          {filteredProducts.length === 0 ? (
            <Paper elevation={0} sx={{ border: `1px dashed ${ZAP_COLORS.border}`, borderRadius: 3, p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary" mb={2}>No products in this category yet.</Typography>
              <Button variant="outlined" startIcon={<Add />} onClick={openAdd}>Add Product</Button>
            </Paper>
          ) : (
            <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3 }}>
              <Table size="small">
                <TableHeader showCategory={false} />
                <TableBody>
                  {filteredProducts.map((product) => <ProductRow key={product.id} product={product} />)}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Pagination for single-category view */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 3, alignItems: 'center' }}>
              <Button size="small" variant="outlined" disabled={page === 0}
                onClick={() => fetchProducts(page - 1, selectedCategoryTab)}>← Prev</Button>
              <Typography variant="body2">{page + 1} / {totalPages}</Typography>
              <Button size="small" variant="outlined" disabled={page >= totalPages - 1}
                onClick={() => fetchProducts(page + 1, selectedCategoryTab)}>Next →</Button>
            </Box>
          )}
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
                <Button variant="outlined" startIcon={uploading ? <CircularProgress size={14} /> : <CloudUpload />}
                  onClick={() => fileRef.current?.click()} disabled={uploading}
                  sx={{ height: 72, borderRadius: 2, borderStyle: 'dashed' }}>
                  {uploading ? 'Uploading...' : 'Upload'}
                </Button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
              </Box>
            </Grid>

            <Grid item xs={12} sm={8}>
              <TextField label="Product Name *" value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                size="small" fullWidth />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Unit (e.g. 500g, 1L)" value={form.unit}
                onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                size="small" fullWidth />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl size="small" fullWidth>
                <InputLabel>Category *</InputLabel>
                <Select value={form.categoryId}
                  onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))}
                  label="Category *">
                  {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField label="MRP (₹) *" type="number" value={form.mrp}
                onChange={(e) => setForm((p) => ({ ...p, mrp: e.target.value }))}
                size="small" fullWidth
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField label="Sale Price (₹)" type="number" value={form.discountedPrice}
                onChange={(e) => setForm((p) => ({ ...p, discountedPrice: e.target.value }))}
                size="small" fullWidth
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                helperText="Leave empty if no discount" />
            </Grid>

            <Grid item xs={12}>
              <Alert severity="info" sx={{ borderRadius: 2, py: 0.5 }}>
                Stock is managed by <strong>Purchases</strong> (adds stock) and <strong>Orders</strong> (deducts/restores). View stock on the <strong>Inventory</strong> page.
              </Alert>
            </Grid>

            <Grid item xs={12}>
              <TextField label="Description" value={form.description} multiline rows={2}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                size="small" fullWidth />
            </Grid>

            <Grid item xs={12}>
              <Typography variant="subtitle2" fontWeight={600} mb={1}>Product Tags</Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {FLAGS.map((flag) => (
                  <FormControlLabel key={flag.key}
                    control={<Switch size="small" checked={!!form[flag.key]}
                      onChange={(e) => setForm((p) => ({ ...p, [flag.key]: e.target.checked }))} />}
                    label={<Typography variant="body2">{flag.label}</Typography>} />
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