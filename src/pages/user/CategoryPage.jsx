// ============================================================
// src/pages/user/CategoryPage.jsx
//
// UPDATED: Queries STORE_INVENTORY instead of PRODUCTS.
// sellRate → discountedPrice for backward compat with ProductCard.
// Price sort uses sellRate field instead of discountedPrice.
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Container, Typography, Grid, Select, MenuItem,
  IconButton, Breadcrumbs, Link,
  Drawer, Button, Slider, FormGroup, FormControlLabel, Checkbox,
} from '@mui/material';
import { ArrowBack, FilterList } from '@mui/icons-material';
import {
  collection, query, where, orderBy, getDocs, doc, getDoc,
  limit, startAfter, getCountFromServer,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import ProductCard, { ProductCardSkeleton } from '../../components/user/ProductCard';
import { useStore } from '../../context/StoreContext';
import { ZAP_COLORS } from '../../theme';

const PAGE_SIZE = 12;

// ── Map storeInventory doc → ProductCard shape ───────────────────────────────
const mapSI = (d) => {
  const data = d.data();
  return {
    id:              data.productId || d.id,
    productId:       data.productId || d.id,
    storeId:         data.storeId,
    name:            data.name || '',
    unit:            data.unit || '',
    categoryId:      data.categoryId || '',
    description:     data.description || '',
    images:          data.images || [],
    mrp:             data.mrp || 0,
    discountedPrice: data.sellRate || null,
    stock:           data.stock || 0,
    isFeatured:      data.isFeatured || false,
    isExclusive:     data.isExclusive || false,
    isNewArrival:    data.isNewArrival || false,
    active:          data.active !== false,
    createdAt:       data.createdAt,
  };
};

const CategoryPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterParam = searchParams.get('filter');
  const searchQuery = (searchParams.get('q') || '').trim();

  const { activeUserStore } = useStore();

  const [category, setCategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [cursors, setCursors] = useState([null]);
  const [sortBy, setSortBy] = useState('default');
  const [filterDrawer, setFilterDrawer] = useState(false);
  const [priceRange, setPriceRange] = useState([0, 2000]);
  const [onlyDiscount, setOnlyDiscount] = useState(false);

  // Fetch category name
  useEffect(() => {
    if (id) {
      getDoc(doc(db, COLLECTIONS.CATEGORIES, id))
        .then((snap) => { if (snap.exists()) setCategory({ id: snap.id, ...snap.data() }); });
    }
  }, [id]);

  const fetchProducts = useCallback(async (pageIndex = 0) => {
    setLoading(true);
    try {
      // ── Query STORE_INVENTORY instead of PRODUCTS ──────────────────────
      const col = collection(db, COLLECTIONS.STORE_INVENTORY);
      const constraints = [where('active', '==', true)];

      if (activeUserStore?.id) constraints.push(where('storeId', '==', activeUserStore.id));
      if (id) constraints.push(where('categoryId', '==', id));
      if (filterParam === 'featured')  constraints.push(where('isFeatured',   '==', true));
      if (filterParam === 'exclusive') constraints.push(where('isExclusive',  '==', true));
      if (filterParam === 'new')       constraints.push(where('isNewArrival', '==', true));

      switch (sortBy) {
        case 'price_asc':  constraints.push(orderBy('sellRate', 'asc'));  break;
        case 'price_desc': constraints.push(orderBy('sellRate', 'desc')); break;
        default:           constraints.push(orderBy('createdAt', 'desc'));
      }

      // For search: fetch broader set then filter client-side
      const fetchLimit = searchQuery ? PAGE_SIZE * 8 : PAGE_SIZE;

      const countQ = searchQuery
        ? query(col, ...constraints, limit(200))
        : query(col, ...constraints);

      const countSnap = await getCountFromServer(searchQuery ? query(col, where('active', '==', true)) : countQ);
      const cursor = cursors[pageIndex];
      const q = cursor
        ? query(col, ...constraints, limit(fetchLimit), startAfter(cursor))
        : query(col, ...constraints, limit(fetchLimit));

      const snap = await getDocs(q);
      let docs = snap.docs.map(mapSI);

      // Client-side search filter
      if (searchQuery) {
        const lower = searchQuery.toLowerCase();
        docs = docs.filter((p) =>
          p.name?.toLowerCase().includes(lower) ||
          p.description?.toLowerCase().includes(lower) ||
          p.unit?.toLowerCase().includes(lower)
        );
        setTotalPages(1);
      } else {
        setTotalPages(Math.ceil(countSnap.data().count / PAGE_SIZE));
        setPage(pageIndex);
        if (snap.docs.length > 0) {
          setCursors((prev) => {
            const updated = [...prev];
            updated[pageIndex + 1] = snap.docs[snap.docs.length - 1];
            return updated;
          });
        }
      }

      setProducts(docs);
    } finally {
      setLoading(false);
    }
  }, [id, filterParam, sortBy, activeUserStore?.id, searchQuery, cursors]);

  useEffect(() => {
    setCursors([null]);
    fetchProducts(0);
  }, [id, filterParam, sortBy, activeUserStore?.id, searchQuery]);

  // Client-side price + discount filter
  const filteredProducts = products.filter((p) => {
    const price = p.discountedPrice || p.mrp;
    if (price < priceRange[0] || price > priceRange[1]) return false;
    if (onlyDiscount && (!p.discountedPrice || p.discountedPrice >= p.mrp)) return false;
    return true;
  });

  const pageTitle = searchQuery
    ? `Results for "${searchQuery}"`
    : filterParam === 'featured'  ? '⭐ Featured'
    : filterParam === 'exclusive' ? '💛 Exclusive Deals'
    : filterParam === 'new'       ? '🆕 New Arrivals'
    : category?.name || 'All Products';

  return (
    <Box sx={{ pb: { xs: 13, md: 3 }, pt: 1 }}>
      <Container maxWidth="lg">

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, px: { xs: 1, sm: 0 } }}>
          <IconButton onClick={() => navigate(-1)} size="small"><ArrowBack /></IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" fontWeight={700}>{pageTitle}</Typography>
            <Breadcrumbs sx={{ '& .MuiBreadcrumbs-separator': { fontSize: '0.7rem' } }}>
              <Link underline="hover" color="text.secondary" onClick={() => navigate('/')} sx={{ cursor: 'pointer', fontSize: '0.75rem' }}>Home</Link>
              <Typography variant="caption" color="text.primary" fontWeight={500}>{pageTitle}</Typography>
            </Breadcrumbs>
          </Box>

          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} size="small" sx={{ fontSize: '0.8rem', borderRadius: 2, minWidth: 110 }}>
            <MenuItem value="default">Default</MenuItem>
            <MenuItem value="price_asc">Price ↑</MenuItem>
            <MenuItem value="price_desc">Price ↓</MenuItem>
          </Select>

          <IconButton onClick={() => setFilterDrawer(true)} size="small" sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 2 }}>
            <FilterList fontSize="small" />
          </IconButton>
        </Box>

        {/* Result count for search */}
        {searchQuery && !loading && (
          <Typography variant="body2" color="text.secondary" sx={{ px: { xs: 1, sm: 0 }, mb: 1.5 }}>
            {filteredProducts.length === 0
              ? 'No products found. Try a different word.'
              : `${filteredProducts.length} product${filteredProducts.length !== 1 ? 's' : ''} found`}
          </Typography>
        )}

        {/* Products Grid */}
        <Grid container spacing={{ xs: 1.5, sm: 2 }}>
          {loading
            ? Array(PAGE_SIZE).fill(0).map((_, i) => (
              <Grid item xs={6} sm={4} md={3} key={i}><ProductCardSkeleton /></Grid>
            ))
            : filteredProducts.length === 0
            ? (
              <Grid item xs={12}>
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Box sx={{ fontSize: '4rem', mb: 2 }}>🔍</Box>
                  <Typography variant="h6" fontWeight={600}>No products found</Typography>
                  <Typography color="text.secondary">
                    {searchQuery ? 'Try a different search term' : 'Check back later for new products'}
                  </Typography>
                </Box>
              </Grid>
            )
            : filteredProducts.map((p) => (
              <Grid item xs={6} sm={4} md={3} key={p.id}><ProductCard product={p} /></Grid>
            ))
          }
        </Grid>

        {/* Pagination */}
        {!searchQuery && totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 4, alignItems: 'center' }}>
            <Button variant="outlined" size="small" disabled={page === 0} onClick={() => fetchProducts(page - 1)}>← Prev</Button>
            <Typography variant="body2">{page + 1} / {totalPages}</Typography>
            <Button variant="outlined" size="small" disabled={page >= totalPages - 1} onClick={() => fetchProducts(page + 1)}>Next →</Button>
          </Box>
        )}

        {/* Filter Drawer */}
        <Drawer anchor="right" open={filterDrawer} onClose={() => setFilterDrawer(false)}
          PaperProps={{ sx: { width: 280, p: 3, borderRadius: '16px 0 0 16px' } }}>
          <Typography variant="h6" fontWeight={700} mb={3}>Filters</Typography>

          <Typography variant="subtitle2" fontWeight={600} mb={1}>Price Range</Typography>
          <Slider
            value={priceRange} onChange={(_, v) => setPriceRange(v)}
            min={0} max={2000} step={10}
            valueLabelDisplay="auto" valueLabelFormat={(v) => `₹${v}`}
            sx={{ color: ZAP_COLORS.primary }}
          />
          <Typography variant="caption" color="text.secondary" mb={3} display="block">
            ₹{priceRange[0]} — ₹{priceRange[1]}
          </Typography>

          <FormGroup>
            <FormControlLabel
              control={<Checkbox checked={onlyDiscount} onChange={(e) => setOnlyDiscount(e.target.checked)} />}
              label={<Typography variant="body2">Only discounted</Typography>}
            />
          </FormGroup>

          <Box sx={{ mt: 4, display: 'flex', gap: 1 }}>
            <Button variant="outlined" fullWidth onClick={() => { setPriceRange([0, 2000]); setOnlyDiscount(false); }}>
              Reset
            </Button>
            <Button variant="contained" fullWidth onClick={() => setFilterDrawer(false)}>Apply</Button>
          </Box>
        </Drawer>

      </Container>
    </Box>
  );
};

export default CategoryPage;