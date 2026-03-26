// ============================================================
// src/pages/admin/AdminPurchases.jsx
//
// Purchase management — store-scoped. Each purchase adds/updates
// storeInventory docs with per-store stock, MRP, and sell rate.
// Features: searchable product picker (with unit in dropdown),
//           date-range filter, category filter, search,
//           edit with delta stock, delete with stock reversal.
// ============================================================
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Chip, Autocomplete,
  CircularProgress, Alert, Grid, Tabs, Tab, InputAdornment,
} from '@mui/material';
import { Add, Edit, Delete, Search, FilterList } from '@mui/icons-material';
import {
  collection, query, orderBy, getDocs, doc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, limit, startAfter, where, getDoc, setDoc, getCountFromServer,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { ZAP_COLORS } from '../../theme';
import { useStore } from '../../context/StoreContext';
import { formatCurrency, formatDate } from '../../utils/helpers';

const PAGE_SIZE = 15;
const EMPTY_ITEM = { productId: '', productName: '', unit: '', quantity: '', costPrice: '', mrp: '', sellRate: '' };
const EMPTY_FORM = {
  items: [{ ...EMPTY_ITEM }],
  supplier: '', notes: '',
  date: new Date().toISOString().slice(0, 10),
};

// ── Helper: build storeInventory doc ID ──────────────────────────────────────
const siDocId = (storeId, productId) => `${storeId}__${productId}`;

const AdminPurchases = () => {
  const { adminStore } = useStore();
  const [purchases, setPurchases] = useState([]);
  const [allProducts, setAllProducts] = useState([]);    // global catalog
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [editPurchase, setEditPurchase] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const cursorsRef = useRef([null]);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // ── Load global products & categories ──────────────────────────────────────
  useEffect(() => {
    getDocs(query(collection(db, COLLECTIONS.PRODUCTS), orderBy('name')))
      .then((snap) => setAllProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    getDocs(query(collection(db, COLLECTIONS.CATEGORIES), orderBy('name')))
      .then((snap) => setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, []);

  // ── Fetch purchases (server-side paginated, store-scoped) ──────────────────
  const fetchPurchases = useCallback(async (pageIndex = 0) => {
    if (!adminStore?.id) return;
    setLoading(true);
    try {
      const col = collection(db, COLLECTIONS.PURCHASE);
      const constraints = [
        where('storeId', '==', adminStore.id),
        orderBy('createdAt', 'desc'),
      ];

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
    } finally {
      setLoading(false);
    }
  }, [adminStore?.id]);

  useEffect(() => {
    cursorsRef.current = [null];
    fetchPurchases(0);
  }, [adminStore?.id, fetchPurchases]);

  // ── Client-side filtering (date range, search, category) ───────────────────
  const filteredPurchases = useMemo(() => {
    let result = purchases;

    // Date range filter
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      result = result.filter((p) => {
        const d = p.date ? new Date(p.date) : p.createdAt?.toDate?.() ? p.createdAt.toDate() : null;
        return d && d >= from;
      });
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((p) => {
        const d = p.date ? new Date(p.date) : p.createdAt?.toDate?.() ? p.createdAt.toDate() : null;
        return d && d <= to;
      });
    }

    // Search filter (supplier or item names)
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter((p) =>
        (p.supplier || '').toLowerCase().includes(q) ||
        (p.items || []).some((i) => (i.productName || '').toLowerCase().includes(q))
      );
    }

    // Category filter
    if (selectedCategory !== 'all') {
      const catProductIds = new Set(allProducts.filter((p) => p.categoryId === selectedCategory).map((p) => p.id));
      result = result.filter((p) =>
        (p.items || []).some((i) => catProductIds.has(i.productId))
      );
    }

    return result;
  }, [purchases, dateFrom, dateTo, searchText, selectedCategory, allProducts]);

  // ── Form helpers ───────────────────────────────────────────────────────────
  const updateItem = (idx, field, value) => {
    setForm((prev) => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, items };
    });
  };

  const addItemRow = () => setForm((prev) => ({ ...prev, items: [...prev.items, { ...EMPTY_ITEM }] }));

  const removeItemRow = (idx) =>
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const handleProductSelect = (idx, product) => {
    if (!product) {
      updateItem(idx, 'productId', '');
      updateItem(idx, 'productName', '');
      updateItem(idx, 'unit', '');
      return;
    }
    setForm((prev) => {
      const items = [...prev.items];
      items[idx] = {
        ...items[idx],
        productId: product.id,
        productName: product.name,
        unit: product.unit || '',
      };
      return { ...prev, items };
    });
  };

  const openAdd = () => {
    setEditPurchase(null);
    setForm(EMPTY_FORM);
    setError('');
    setDialog(true);
  };

  const openEdit = (p) => {
    setEditPurchase(p);
    setForm({
      items: (p.items || []).map((i) => ({
        productId: i.productId || '',
        productName: i.productName || '',
        unit: i.unit || '',
        quantity: i.quantity || '',
        costPrice: i.costPrice || '',
        mrp: i.mrp || '',
        sellRate: i.sellRate || '',
      })),
      supplier: p.supplier || '',
      notes: p.notes || '',
      date: p.date || new Date().toISOString().slice(0, 10),
    });
    setError('');
    setDialog(true);
  };

  // ── Helper: update or create storeInventory doc ────────────────────────────
  const upsertStoreInventory = async (storeId, productId, stockDelta, pricingUpdate = null) => {
    const docRef = doc(db, COLLECTIONS.STORE_INVENTORY, siDocId(storeId, productId));
    const existing = await getDoc(docRef);

    if (existing.exists()) {
      const currentStock = existing.data().stock || 0;
      const updateData = {
        stock: Math.max(0, currentStock + stockDelta),
        updatedAt: serverTimestamp(),
      };
      if (pricingUpdate) {
        if (pricingUpdate.mrp) updateData.mrp = pricingUpdate.mrp;
        if (pricingUpdate.sellRate) updateData.sellRate = pricingUpdate.sellRate;
        if (pricingUpdate.costPrice) updateData.costPrice = pricingUpdate.costPrice;
      }
      await updateDoc(docRef, updateData);
    } else {
      // First purchase for this product in this store — create storeInventory doc
      const product = allProducts.find((p) => p.id === productId);
      if (!product) return;
      await setDoc(docRef, {
        storeId,
        productId,
        // Denormalized from global product catalog
        name: product.name,
        unit: product.unit || '',
        categoryId: product.categoryId || '',
        description: product.description || '',
        images: product.images || [],
        isFeatured: !!product.isFeatured,
        isExclusive: !!product.isExclusive,
        isNewArrival: !!product.isNewArrival,
        active: product.active !== false,
        // Store-specific
        stock: Math.max(0, stockDelta),
        mrp: pricingUpdate?.mrp || 0,
        sellRate: pricingUpdate?.sellRate || 0,
        costPrice: pricingUpdate?.costPrice || 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  };

  // ── Save purchase (add or edit) ────────────────────────────────────────────
  const handleSave = async () => {
    const newItems = form.items
      .filter((i) => i.productId && i.quantity > 0)
      .map((i) => ({
        productId: i.productId,
        productName: i.productName,
        unit: i.unit || '',
        quantity: parseInt(i.quantity),
        costPrice: parseFloat(i.costPrice) || 0,
        mrp: parseFloat(i.mrp) || 0,
        sellRate: parseFloat(i.sellRate) || 0,
      }));

    if (newItems.length === 0) {
      setError('Add at least one item with quantity');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const storeId = adminStore?.id;
      const totalCost = newItems.reduce((s, i) => s + i.costPrice * i.quantity, 0);

      if (editPurchase) {
        // ── EDIT: calculate delta per product and adjust storeInventory ──
        await updateDoc(doc(db, COLLECTIONS.PURCHASE, editPurchase.id), {
          ...form,
          items: newItems,
          totalCost,
          updatedAt: serverTimestamp(),
        });

        const oldItems = editPurchase.items || [];

        // Process new/changed items
        for (const newItem of newItems) {
          const oldItem = oldItems.find((o) => o.productId === newItem.productId);
          const oldQty = oldItem ? (parseInt(oldItem.quantity) || 0) : 0;
          const delta = newItem.quantity - oldQty;

          await upsertStoreInventory(storeId, newItem.productId, delta, {
            mrp: newItem.mrp,
            sellRate: newItem.sellRate,
            costPrice: newItem.costPrice,
          });
        }

        // Handle removed items (were in old but not in new)
        for (const oldItem of oldItems) {
          const stillExists = newItems.find((n) => n.productId === oldItem.productId);
          if (!stillExists) {
            await upsertStoreInventory(storeId, oldItem.productId, -(parseInt(oldItem.quantity) || 0));
          }
        }

        setSuccess('Purchase updated and inventory adjusted!');
      } else {
        // ── ADD: new purchase ──
        const purchaseData = {
          ...form,
          storeId,
          items: newItems,
          totalCost,
          createdAt: serverTimestamp(),
        };
        await addDoc(collection(db, COLLECTIONS.PURCHASE), purchaseData);

        // Add stock to storeInventory for each item
        for (const item of newItems) {
          await upsertStoreInventory(storeId, item.productId, item.quantity, {
            mrp: item.mrp,
            sellRate: item.sellRate,
            costPrice: item.costPrice,
          });
        }

        setSuccess('Purchase recorded and inventory updated!');
      }

      setDialog(false);
      setForm(EMPTY_FORM);
      cursorsRef.current = [null];
      fetchPurchases(0);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete purchase ────────────────────────────────────────────────────────
  const handleDelete = async (purchase) => {
    if (!window.confirm('Delete this purchase? Stock will be deducted accordingly.')) return;
    try {
      await deleteDoc(doc(db, COLLECTIONS.PURCHASE, purchase.id));

      for (const item of purchase.items || []) {
        await upsertStoreInventory(
          adminStore?.id,
          item.productId,
          -(parseInt(item.quantity) || 0)
        );
      }

      setPurchases((prev) => prev.filter((p) => p.id !== purchase.id));
      setSuccess('Purchase deleted and inventory adjusted!');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const getCategoryName = (id) => categories.find((c) => c.id === id)?.name || '';

  const getPurchaseDate = (p) => p.date || formatDate(p.createdAt);

  // ── Purchase row (mobile card) ─────────────────────────────────────────────
  const PurchaseCard = ({ purchase }) => (
    <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 2.5, p: 1.5, mb: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Box>
          <Typography variant="body2" fontWeight={700}>{purchase.supplier || 'No Supplier'}</Typography>
          <Typography variant="caption" color="text.secondary">{getPurchaseDate(purchase)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={() => openEdit(purchase)}><Edit fontSize="small" /></IconButton>
          <IconButton size="small" onClick={() => handleDelete(purchase)} sx={{ color: ZAP_COLORS.error }}>
            <Delete fontSize="small" />
          </IconButton>
        </Box>
      </Box>
      <Box sx={{ mb: 0.5 }}>
        {(purchase.items || []).map((i, idx) => (
          <Typography key={idx} variant="caption" display="block" color="text.secondary">
            {i.productName} {i.unit ? `(${i.unit})` : ''} ×{i.quantity}
            {i.mrp ? ` — MRP: ₹${i.mrp}` : ''}{i.sellRate ? ` / Sell: ₹${i.sellRate}` : ''}
          </Typography>
        ))}
      </Box>
      <Typography variant="body2" fontWeight={700} color={ZAP_COLORS.primary}>
        {formatCurrency(purchase.totalCost)}
      </Typography>
      {purchase.notes && <Typography variant="caption" color="text.secondary">{purchase.notes}</Typography>}
    </Paper>
  );

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif" }}>Purchases</Typography>
          <Typography variant="caption" color="text.secondary">
            {adminStore ? `Store: ${adminStore.name}` : 'Select a store'}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={openAdd}>Record Purchase</Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      {/* ── Filters bar ─────────────────────────────────────────────────────── */}
      <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 2.5, p: 1.5, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            placeholder="Search supplier / product..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            size="small" sx={{ flex: 1, minWidth: 180 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          />
          <TextField label="From" type="date" value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)} size="small"
            sx={{ width: 150 }} InputLabelProps={{ shrink: true }} />
          <TextField label="To" type="date" value={dateTo}
            onChange={(e) => setDateTo(e.target.value)} size="small"
            sx={{ width: 150 }} InputLabelProps={{ shrink: true }} />
          {(dateFrom || dateTo || searchText || selectedCategory !== 'all') && (
            <Button size="small" variant="outlined" onClick={() => {
              setDateFrom(''); setDateTo(''); setSearchText(''); setSelectedCategory('all');
            }}>Clear</Button>
          )}
        </Box>
      </Paper>

      {/* Category tabs */}
      <Box sx={{ borderBottom: `1px solid ${ZAP_COLORS.border}`, mb: 2 }}>
        <Tabs
          value={selectedCategory}
          onChange={(_, v) => setSelectedCategory(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ '& .MuiTab-root': { fontSize: '0.78rem', minWidth: 'auto', px: 1.5 } }}
        >
          <Tab label="All" value="all" />
          {categories.map((cat) => (
            <Tab key={cat.id} label={cat.name} value={cat.id} />
          ))}
        </Tabs>
      </Box>

      {/* ── Desktop table ───────────────────────────────────────────────────── */}
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
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
              {loading ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
              ) : filteredPurchases.length === 0 ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: ZAP_COLORS.textMuted }}>
                  No purchases found.
                </TableCell></TableRow>
              ) : filteredPurchases.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell sx={{ fontSize: '0.78rem' }}>{getPurchaseDate(p)}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>{p.supplier || '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', maxWidth: 280 }}>
                    {(p.items || []).map((i, idx) => (
                      <Box key={idx} component="span" sx={{ display: 'block' }}>
                        {i.productName} {i.unit ? <Typography component="span" variant="caption" color="text.secondary">({i.unit})</Typography> : ''} ×{i.quantity}
                        {i.mrp ? <Typography component="span" variant="caption" color="text.secondary"> MRP:₹{i.mrp}</Typography> : ''}
                        {i.sellRate ? <Typography component="span" variant="caption" sx={{ color: ZAP_COLORS.accentGreen }}> Sell:₹{i.sellRate}</Typography> : ''}
                      </Box>
                    ))}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', fontWeight: 600, color: ZAP_COLORS.primary }}>
                    {formatCurrency(p.totalCost)}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', color: ZAP_COLORS.textMuted }}>{p.notes || '—'}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => openEdit(p)} title="Edit"><Edit fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => handleDelete(p)} sx={{ color: ZAP_COLORS.error }} title="Delete">
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* ── Mobile cards ────────────────────────────────────────────────────── */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
        ) : filteredPurchases.length === 0 ? (
          <Paper elevation={0} sx={{ border: `1px dashed ${ZAP_COLORS.border}`, borderRadius: 3, p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">No purchases found.</Typography>
          </Paper>
        ) : filteredPurchases.map((p) => (
          <PurchaseCard key={p.id} purchase={p} />
        ))}
      </Box>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 3, alignItems: 'center' }}>
          <Button size="small" variant="outlined" disabled={page === 0} onClick={() => fetchPurchases(page - 1)}>← Prev</Button>
          <Typography variant="body2">{page + 1} / {totalPages}</Typography>
          <Button size="small" variant="outlined" disabled={page >= totalPages - 1} onClick={() => fetchPurchases(page + 1)}>Next →</Button>
        </Box>
      )}

      {/* ── Add/Edit Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={dialog} onClose={() => !saving && setDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle fontWeight={700}>{editPurchase ? 'Edit Purchase' : 'Record New Purchase'}</DialogTitle>
        <DialogContent dividers>
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
          {editPurchase && (
            <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
              Editing a purchase will adjust inventory by the <strong>difference</strong> in quantities.
            </Alert>
          )}

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={4}>
              <TextField label="Supplier Name" value={form.supplier}
                onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))}
                size="small" fullWidth />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Purchase Date" type="date" value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                size="small" fullWidth InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Notes" value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                size="small" fullWidth />
            </Grid>
          </Grid>

          <Typography variant="subtitle2" fontWeight={700} mb={1}>Items Purchased</Typography>

          {form.items.map((item, idx) => (
            <Paper key={idx} elevation={0}
              sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 2, p: 1.5, mb: 1.5 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>

                {/* ── Searchable product picker ─────────────────────────────── */}
                <Autocomplete
                  size="small"
                  sx={{ flex: 2, minWidth: 220 }}
                  options={allProducts}
                  value={allProducts.find((p) => p.id === item.productId) || null}
                  onChange={(_, newVal) => handleProductSelect(idx, newVal)}
                  getOptionLabel={(opt) => opt.name ? `${opt.name}${opt.unit ? ' — ' + opt.unit : ''}` : ''}
                  renderOption={(props, opt) => (
                    <Box component="li" {...props} key={opt.id}>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{opt.name}</Typography>
                        {opt.unit && (
                          <Typography variant="caption" color="text.secondary" sx={{
                            background: `${ZAP_COLORS.primary}10`, px: 0.8, py: 0.15,
                            borderRadius: 1, fontSize: '0.68rem', fontWeight: 600,
                          }}>
                            {opt.unit}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  )}
                  renderInput={(params) => (
                    <TextField {...params} label="Search Product *" placeholder="Type to search..." />
                  )}
                  filterOptions={(options, { inputValue }) => {
                    const q = inputValue.toLowerCase();
                    return options.filter((o) =>
                      o.name?.toLowerCase().includes(q) ||
                      o.unit?.toLowerCase().includes(q)
                    );
                  }}
                  isOptionEqualToValue={(opt, val) => opt.id === val.id}
                  noOptionsText="No products found"
                />

                <TextField
                  label="Qty *" type="number" value={item.quantity}
                  onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                  size="small" sx={{ width: 80 }}
                />
                <TextField
                  label="Cost/unit ₹" type="number" value={item.costPrice}
                  onChange={(e) => updateItem(idx, 'costPrice', e.target.value)}
                  size="small" sx={{ width: 100 }}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                />
                <TextField
                  label="MRP ₹ *" type="number" value={item.mrp}
                  onChange={(e) => updateItem(idx, 'mrp', e.target.value)}
                  size="small" sx={{ width: 100 }}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                />
                <TextField
                  label="Sell Rate ₹" type="number" value={item.sellRate}
                  onChange={(e) => updateItem(idx, 'sellRate', e.target.value)}
                  size="small" sx={{ width: 100 }}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                  helperText="Optional"
                />

                {form.items.length > 1 && (
                  <IconButton size="small" onClick={() => removeItemRow(idx)} sx={{ color: ZAP_COLORS.error, mt: 0.5 }}>
                    <Delete fontSize="small" />
                  </IconButton>
                )}
              </Box>

              {/* Show subtotal */}
              {item.quantity && item.costPrice && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  Subtotal: {formatCurrency(item.quantity * item.costPrice)}
                </Typography>
              )}
            </Paper>
          ))}

          <Button startIcon={<Add />} onClick={addItemRow} size="small" sx={{ mt: 0.5 }}>
            Add Another Item
          </Button>

          {/* Grand total */}
          <Box sx={{ mt: 2, p: 1.5, background: `${ZAP_COLORS.primary}08`, borderRadius: 2 }}>
            <Typography variant="subtitle2" fontWeight={700}>
              Grand Total: {formatCurrency(
                form.items.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.costPrice) || 0), 0)
              )}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : editPurchase ? 'Update Purchase' : 'Record Purchase'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminPurchases;