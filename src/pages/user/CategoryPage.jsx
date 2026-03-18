import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Container, Typography, Grid, Select, MenuItem, FormControl,
  InputLabel, IconButton, Chip, Skeleton, Breadcrumbs, Link,
  Drawer, Button, Slider, FormGroup, FormControlLabel, Checkbox,
} from '@mui/material';
import {
  ArrowBack, FilterList, Sort,
} from '@mui/icons-material';
import {
  collection, query, where, orderBy, getDocs, doc, getDoc,
  limit, startAfter, getCountFromServer,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import ProductCard, { ProductCardSkeleton } from '../../components/user/ProductCard';
import { ZAP_COLORS } from '../../theme';

const PAGE_SIZE = 12;

const CategoryPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterParam = searchParams.get('filter');

  const [category, setCategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [cursors, setCursors] = useState([null]);
  const [sortBy, setSortBy] = useState('default');
  const [filterDrawer, setFilterDrawer] = useState(false);
  const [priceRange, setPriceRange] = useState([0, 1000]);
  const [onlyDiscount, setOnlyDiscount] = useState(false);

  useEffect(() => {
    if (id) {
      const fetchCategory = async () => {
        const snap = await getDoc(doc(db, COLLECTIONS.CATEGORIES, id));
        if (snap.exists()) setCategory({ id: snap.id, ...snap.data() });
      };
      fetchCategory();
    }
  }, [id]);

  const buildConstraints = useCallback(() => {
    const c = [where('active', '==', true)];
    if (id) c.push(where('categoryId', '==', id));
    if (filterParam === 'featured') c.push(where('isFeatured', '==', true));
    if (filterParam === 'exclusive') c.push(where('isExclusive', '==', true));
    if (filterParam === 'new') c.push(where('isNewArrival', '==', true));

    switch (sortBy) {
      case 'price_asc': c.push(orderBy('discountedPrice', 'asc')); break;
      case 'price_desc': c.push(orderBy('discountedPrice', 'desc')); break;
      case 'newest': c.push(orderBy('createdAt', 'desc')); break;
      default: c.push(orderBy('createdAt', 'desc'));
    }
    return c;
  }, [id, filterParam, sortBy]);

  const fetchProducts = useCallback(async (pageIndex = 0) => {
    setLoading(true);
    try {
      const col = collection(db, COLLECTIONS.PRODUCTS);
      const constraints = buildConstraints();

      const countSnap = await getCountFromServer(query(col, ...constraints));
      setTotalPages(Math.ceil(countSnap.data().count / PAGE_SIZE));

      const cursor = cursors[pageIndex];
      const q = cursor
        ? query(col, ...constraints, limit(PAGE_SIZE), startAfter(cursor))
        : query(col, ...constraints, limit(PAGE_SIZE));

      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProducts(docs);
      setPage(pageIndex);

      if (snap.docs.length > 0) {
        setCursors((prev) => {
          const updated = [...prev];
          updated[pageIndex + 1] = snap.docs[snap.docs.length - 1];
          return updated;
        });
      }
    } finally {
      setLoading(false);
    }
  }, [buildConstraints, cursors]);

  useEffect(() => {
    setCursors([null]);
    fetchProducts(0);
  }, [id, filterParam, sortBy]);

  const filteredProducts = products.filter((p) => {
    const price = p.discountedPrice || p.mrp;
    if (price < priceRange[0] || price > priceRange[1]) return false;
    if (onlyDiscount && (!p.discountedPrice || p.discountedPrice >= p.mrp)) return false;
    return true;
  });

  const filterTitle = filterParam === 'featured' ? '⭐ Featured' :
    filterParam === 'exclusive' ? '💛 Exclusive' :
    filterParam === 'new' ? '🆕 New Arrivals' :
    category?.name || 'All Products';

  return (
    <Box sx={{ pb: { xs: 10, md: 3 }, pt: 1 }}>
      <Container maxWidth="lg">
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, px: { xs: 1, sm: 0 } }}>
          <IconButton onClick={() => navigate(-1)} size="small"><ArrowBack /></IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" fontWeight={700}>{filterTitle}</Typography>
            <Breadcrumbs sx={{ '& .MuiBreadcrumbs-separator': { fontSize: '0.7rem' } }}>
              <Link underline="hover" color="text.secondary" onClick={() => navigate('/')} sx={{ cursor: 'pointer', fontSize: '0.75rem' }}>
                Home
              </Link>
              <Typography variant="caption" color="text.primary" fontWeight={500}>{filterTitle}</Typography>
            </Breadcrumbs>
          </Box>

          <FormControl size="small" sx={{ minWidth: 110 }}>
            <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} displayEmpty sx={{ fontSize: '0.8rem', borderRadius: 2 }}>
              <MenuItem value="default">Default</MenuItem>
              <MenuItem value="newest">Newest</MenuItem>
              <MenuItem value="price_asc">Price: Low to High</MenuItem>
              <MenuItem value="price_desc">Price: High to Low</MenuItem>
            </Select>
          </FormControl>

          <IconButton onClick={() => setFilterDrawer(true)} size="small"
            sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 2 }}>
            <FilterList fontSize="small" />
          </IconButton>
        </Box>

        {/* Products Grid */}
        <Grid container spacing={{ xs: 1.5, sm: 2 }}>
          {loading
            ? Array(PAGE_SIZE).fill(0).map((_, i) => (
              <Grid item xs={6} sm={4} md={3} key={i}>
                <ProductCardSkeleton />
              </Grid>
            ))
            : filteredProducts.length === 0 ? (
              <Grid item xs={12}>
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Box sx={{ fontSize: '4rem', mb: 2 }}>🔍</Box>
                  <Typography variant="h6" fontWeight={600}>No products found</Typography>
                  <Typography color="text.secondary">Try adjusting your filters</Typography>
                </Box>
              </Grid>
            )
            : filteredProducts.map((p) => (
              <Grid item xs={6} sm={4} md={3} key={p.id}>
                <ProductCard product={p} />
              </Grid>
            ))
          }
        </Grid>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 4, flexWrap: 'wrap' }}>
            <Button size="small" variant="outlined" disabled={page === 0} onClick={() => fetchProducts(page - 1)}>
              ← Previous
            </Button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const pageNum = Math.max(0, Math.min(page - 3, totalPages - 7)) + i;
              return (
                <Button
                  key={pageNum} size="small"
                  variant={pageNum === page ? 'contained' : 'outlined'}
                  onClick={() => fetchProducts(pageNum)}
                  sx={{ minWidth: 36 }}
                >
                  {pageNum + 1}
                </Button>
              );
            })}
            <Button size="small" variant="outlined" disabled={page >= totalPages - 1} onClick={() => fetchProducts(page + 1)}>
              Next →
            </Button>
          </Box>
        )}
      </Container>

      {/* Filter Drawer */}
      <Drawer anchor="right" open={filterDrawer} onClose={() => setFilterDrawer(false)}
        PaperProps={{ sx: { width: 280, p: 3 } }}
      >
        <Typography variant="h6" fontWeight={700} mb={3}>Filters</Typography>

        <Typography variant="subtitle2" fontWeight={600} mb={1}>Price Range</Typography>
        <Slider
          value={priceRange} onChange={(_, v) => setPriceRange(v)}
          min={0} max={1000} step={10} valueLabelDisplay="auto"
          valueLabelFormat={(v) => `₹${v}`}
          sx={{ color: ZAP_COLORS.primary }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="caption">₹{priceRange[0]}</Typography>
          <Typography variant="caption">₹{priceRange[1]}</Typography>
        </Box>

        <Box sx={{ mt: 3 }}>
          <FormGroup>
            <FormControlLabel
              control={<Checkbox checked={onlyDiscount} onChange={(e) => setOnlyDiscount(e.target.checked)} sx={{ '&.Mui-checked': { color: ZAP_COLORS.primary } }} />}
              label={<Typography variant="body2">Discounted Items Only</Typography>}
            />
          </FormGroup>
        </Box>

        <Box sx={{ mt: 3, display: 'flex', gap: 1.5 }}>
          <Button fullWidth variant="outlined" onClick={() => { setPriceRange([0, 1000]); setOnlyDiscount(false); setFilterDrawer(false); }}>
            Clear
          </Button>
          <Button fullWidth variant="contained" onClick={() => setFilterDrawer(false)}>
            Apply
          </Button>
        </Box>
      </Drawer>
    </Box>
  );
};

export default CategoryPage;
