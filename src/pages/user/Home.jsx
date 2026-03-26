// ============================================================
// src/pages/user/Home.jsx
//
// UPDATED: All product queries now hit STORE_INVENTORY instead
// of PRODUCTS. The storeInventory docs have the same shape
// (name, unit, images, mrp, etc.) plus store-specific pricing.
// sellRate maps to discountedPrice for backward compatibility.
// ============================================================
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Typography, Grid, Button, Chip,
  useTheme, useMediaQuery, Skeleton,
} from '@mui/material';
import {
  collection, query, where, orderBy, getDocs, limit, doc, getDoc,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { useStore } from '../../context/StoreContext';
import ProductCard, { ProductCardSkeleton } from '../../components/user/ProductCard';
import BannerCarousel from '../../components/user/BannerCarousel';
import ActiveOrdersBar from '../../components/user/ActiveOrdersBar';
import { ZAP_COLORS } from '../../theme';

// ── Helper: map storeInventory doc → product shape for ProductCard ───────────
const mapSI = (d) => {
  const data = d.data ? d.data() : d;
  const id   = d.id    || data.productId;
  return {
    id:              data.productId || id,
    productId:       data.productId || id,
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

// ── Reusable section header ──────────────────────────────────────────────────
const SectionHeader = ({ title, subtitle, onSeeAll, seeAllLabel }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 1.5 }}>
    <Box>
      <Typography variant="subtitle1" fontWeight={700} lineHeight={1.3}>{title}</Typography>
      {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
    </Box>
    {onSeeAll && (
      <Typography variant="caption" fontWeight={600} sx={{ color: ZAP_COLORS.primary, cursor: 'pointer' }}
        onClick={onSeeAll}>{seeAllLabel || 'See all →'}</Typography>
    )}
  </Box>
);

// ── Category horizontal scroll ───────────────────────────────────────────────
const CategoryScroll = ({ categories, loading }) => {
  const navigate = useNavigate();
  const emojis = ['🛒', '🥦', '🧴', '🍞', '🥤', '🧹', '🍪', '🍖'];
  if (loading) return (
    <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 1 }}>
      {Array(6).fill(0).map((_, i) => <Skeleton key={i} variant="rounded" width={72} height={80} sx={{ borderRadius: 2, flexShrink: 0 }} />)}
    </Box>
  );
  return (
    <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 1, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
      {categories.map((cat, i) => (
        <Box key={cat.id} onClick={() => navigate(`/category/${cat.id}`)}
          sx={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
            cursor: 'pointer', flexShrink: 0, width: 72,
            '&:active': { transform: 'scale(0.95)' },
          }}>
          <Box sx={{
            width: 56, height: 56, borderRadius: 2.5, overflow: 'hidden',
            border: `2px solid ${ZAP_COLORS.border}`, background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {cat.imageUrl
              ? <Box component="img" src={cat.imageUrl} alt={cat.name} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <Box sx={{ fontSize: '1.6rem' }}>{emojis[i % emojis.length]}</Box>
            }
          </Box>
          <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.68rem', lineHeight: 1.2, display: 'block' }} noWrap>
            {cat.name}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

// ── Top Picks section — queries STORE_INVENTORY ──────────────────────────────
const TopPicksSection = ({ categoryConfig, storeId, isMobile }) => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const constraints = [
          where('active', '==', true),
          where('categoryId', '==', categoryConfig.categoryId),
        ];
        if (storeId) constraints.push(where('storeId', '==', storeId));
        constraints.push(orderBy('createdAt', 'desc'));
        constraints.push(limit(isMobile ? 4 : 6));

        const snap = await getDocs(query(collection(db, COLLECTIONS.STORE_INVENTORY), ...constraints));
        setProducts(snap.docs.map(mapSI));
      } finally { setLoading(false); }
    };
    fetchProducts();
  }, [categoryConfig.categoryId, storeId, isMobile]);

  if (!loading && products.length === 0) return null;

  return (
    <Box sx={{ mt: 4 }}>
      <SectionHeader
        title={categoryConfig.label || 'Top Picks'}
        subtitle={categoryConfig.subtitle || ''}
        onSeeAll={() => navigate(`/category/${categoryConfig.categoryId}`)}
      />
      <Grid container spacing={{ xs: 1.5, sm: 2 }}>
        {loading
          ? Array(isMobile ? 4 : 6).fill(0).map((_, i) => (
            <Grid item xs={6} sm={4} md={2} key={i}><ProductCardSkeleton /></Grid>
          ))
          : products.map((p) => (
            <Grid item xs={6} sm={4} md={2} key={p.id}><ProductCard product={p} /></Grid>
          ))
        }
      </Grid>
    </Box>
  );
};

// ── Main Home page ───────────────────────────────────────────────────────────
const Home = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { activeUserStore } = useStore();

  const [banners, setBanners] = useState([]);
  const [categories, setCategories] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [exclusive, setExclusive] = useState([]);
  const [newArrivals, setNewArrivals] = useState([]);
  const [topPicksConfig, setTopPicksConfig] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const storeId = activeUserStore?.id;
        // Store constraint for storeInventory queries
        const sc = storeId ? [where('storeId', '==', storeId)] : [];

        const [bannersSnap, catsSnap, featuredSnap, exclusiveSnap, newArrivalSnap, topPicksSnap] = await Promise.all([
          // Banners are global
          getDocs(query(collection(db, COLLECTIONS.BANNERS), where('active', '==', true), orderBy('order'))),
          getDocs(query(collection(db, COLLECTIONS.CATEGORIES), where('active', '==', true), orderBy('order'))),
          // ── Products from STORE_INVENTORY ──
          getDocs(query(collection(db, COLLECTIONS.STORE_INVENTORY), ...sc, where('isFeatured', '==', true), where('active', '==', true), limit(isMobile ? 4 : 5))),
          getDocs(query(collection(db, COLLECTIONS.STORE_INVENTORY), ...sc, where('isExclusive', '==', true), where('active', '==', true), limit(8))),
          getDocs(query(collection(db, COLLECTIONS.STORE_INVENTORY), ...sc, where('isNewArrival', '==', true), where('active', '==', true), orderBy('createdAt', 'desc'), limit(4))),
          getDoc(doc(db, 'settings', 'topPicksConfig')),
        ]);

        setBanners(bannersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCategories(catsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setFeatured(featuredSnap.docs.map(mapSI));
        setExclusive(exclusiveSnap.docs.map(mapSI));
        setNewArrivals(newArrivalSnap.docs.map(mapSI));

        if (topPicksSnap.exists()) {
          const config = topPicksSnap.data().categories || [];
          setTopPicksConfig(
            config
              .filter((c) => c.active)
              .sort((a, b) => (a.order || 0) - (b.order || 0))
              .slice(0, 6)
          );
        }
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [activeUserStore?.id, isMobile]);

  return (
    <Box sx={{ pb: { xs: 13, md: 3 }, pt: 1 }}>
      <Container maxWidth="lg">

        {/* Feature highlights strip */}
        <Box sx={{
          display: 'flex', gap: 1, overflowX: 'auto', mb: 2, px: { xs: 1, sm: 0 },
          scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
        }}>
          {[
            { icon: '⚡', text: 'Express Delivery' },
            { icon: '🏷️', text: 'Best Prices' },
            { icon: '✅', text: 'Fresh & Quality' },
            { icon: '🛵', text: '₹10 Delivery' },
          ].map((item) => (
            <Chip key={item.text} label={`${item.icon} ${item.text}`} size="small"
              sx={{ background: '#fff', fontWeight: 500, fontSize: '0.72rem', border: `1px solid ${ZAP_COLORS.border}`, flexShrink: 0 }} />
          ))}
        </Box>

        {/* Active orders bar (desktop) */}
        <Box sx={{ display: { xs: 'none', md: 'block' } }}>
          <ActiveOrdersBar />
        </Box>

        {/* Banner Carousel */}
        <BannerCarousel banners={banners} loading={loading} />

        {/* Categories */}
        <Box sx={{ mt: 3 }}>
          <SectionHeader title="Shop by Category" onSeeAll={() => navigate('/categories')} />
          <CategoryScroll categories={categories} loading={loading} />
        </Box>

        {/* Featured Products */}
        <Box sx={{ mt: 4 }}>
          <SectionHeader title="⭐ Featured Products" subtitle="Handpicked just for you"
            onSeeAll={() => navigate('/products?filter=featured')} />
          <Grid container spacing={{ xs: 1.5, sm: 2 }}>
            {loading
              ? Array(isMobile ? 4 : 5).fill(0).map((_, i) => (
                <Grid item xs={6} sm={4} md={3} lg={2.4} key={i}><ProductCardSkeleton /></Grid>
              ))
              : featured.slice(0, isMobile ? 4 : 5).map((p) => (
                <Grid item xs={6} sm={4} md={3} lg={2.4} key={p.id}><ProductCard product={p} /></Grid>
              ))
            }
          </Grid>
        </Box>

        {/* Exclusive Products */}
        {(loading || exclusive.length > 0) && (
          <Box sx={{ mt: 4 }}>
            <Box sx={{
              borderRadius: 3, p: 2, mb: 2,
              background: `linear-gradient(135deg, ${ZAP_COLORS.secondary} 0%, #2A2A4E 100%)`,
            }}>
              <SectionHeader
                title={<span style={{ color: '#fff' }}>💛 Exclusive Deals</span>}
                subtitle={<span style={{ color: 'rgba(255,255,255,0.6)' }}>Only on ZAP</span>}
                onSeeAll={() => navigate('/products?filter=exclusive')}
                seeAllLabel={<span style={{ color: ZAP_COLORS.accent }}>See all</span>}
              />
              <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 1, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
                {loading
                  ? Array(4).fill(0).map((_, i) => (
                    <Box key={i} sx={{ flexShrink: 0, width: 140 }}><ProductCardSkeleton compact /></Box>
                  ))
                  : exclusive.map((p) => (
                    <Box key={p.id} sx={{ flexShrink: 0, width: { xs: 140, sm: 160 } }}>
                      <ProductCard product={p} compact />
                    </Box>
                  ))
                }
              </Box>
            </Box>
          </Box>
        )}

        {/* New Arrivals */}
        {(loading || newArrivals.length > 0) && (
          <Box sx={{ mt: 4 }}>
            <SectionHeader title="🆕 New Arrivals" subtitle="Just landed in store"
              onSeeAll={() => navigate('/products?filter=new')} />
            <Grid container spacing={{ xs: 1.5, sm: 2 }}>
              {loading
                ? Array(4).fill(0).map((_, i) => (
                  <Grid item xs={6} sm={4} md={3} key={i}><ProductCardSkeleton /></Grid>
                ))
                : newArrivals.slice(0, 4).map((p) => (
                  <Grid item xs={6} sm={4} md={3} key={p.id}><ProductCard product={p} /></Grid>
                ))
              }
            </Grid>
          </Box>
        )}

        {/* Top Picks by Category */}
        {topPicksConfig.map((catConfig) => (
          <TopPicksSection
            key={catConfig.categoryId}
            categoryConfig={catConfig}
            storeId={activeUserStore?.id}
            isMobile={isMobile}
          />
        ))}

        {/* Bottom CTA */}
        {!loading && topPicksConfig.length === 0 && (
          <Box sx={{ mt: 4, p: 3, borderRadius: 3, textAlign: 'center', background: `${ZAP_COLORS.primary}08`, border: `1px solid ${ZAP_COLORS.primary}15` }}>
            <Typography variant="h6" fontWeight={700} mb={0.5}>Browse All Products</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>Explore our full catalogue</Typography>
            <Button variant="contained" onClick={() => navigate('/categories')}>Shop Now</Button>
          </Box>
        )}

      </Container>
    </Box>
  );
};

export default Home;