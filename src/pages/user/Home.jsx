import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Typography, Grid, Skeleton, Chip,
  useTheme, useMediaQuery,
} from '@mui/material';
import {
  collection, getDocs, query, where, orderBy, limit,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import BannerCarousel from '../../components/user/BannerCarousel';
import ProductCard, { ProductCardSkeleton } from '../../components/user/ProductCard';
import { ZAP_COLORS } from '../../theme';
import ActiveOrdersBar from '../../components/user/ActiveOrdersBar';
import { useStore } from '../../context/StoreContext';

const SectionHeader = ({ title, subtitle, onSeeAll, seeAllLabel = 'See all' }) => (
  <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', mb: 2 }}>
    <Box>
      <Typography variant="h6" sx={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, lineHeight: 1.2 }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
      )}
    </Box>
    {onSeeAll && (
      <Typography
        variant="caption"
        onClick={onSeeAll}
        sx={{ color: ZAP_COLORS.primary, fontWeight: 600, cursor: 'pointer', flexShrink: 0, ml: 1 }}
      >
        {seeAllLabel} →
      </Typography>
    )}
  </Box>
);

const CategoryScroll = ({ categories, loading }) => {
  const navigate = useNavigate();
  const emojis = ['🥦', '🍎', '🥛', '🛒', '🧴', '🍚', '🧃', '🧹', '🍪', '🥤'];

  return (
    <Box
      sx={{
        display: 'flex', gap: 1.5, overflowX: 'auto',
        pb: 1, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      {loading
        ? Array(8).fill(0).map((_, i) => (
          <Box key={i} sx={{ flexShrink: 0, textAlign: 'center' }}>
            <Skeleton variant="rounded" width={64} height={64} sx={{ borderRadius: 3, mb: 0.5 }} />
            <Skeleton width={56} height={12} sx={{ mx: 'auto' }} />
          </Box>
        ))
        : categories.map((cat, i) => (
          <Box
            key={cat.id}
            onClick={() => navigate(`/category/${cat.id}`)}
            sx={{ flexShrink: 0, textAlign: 'center', cursor: 'pointer', width: 72 }}
          >
            <Box sx={{
              width: 64, height: 64, borderRadius: 3, mx: 'auto', mb: 0.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${ZAP_COLORS.primary}${10 + (i % 5) * 3}`,
              border: `1px solid ${ZAP_COLORS.primary}20`,
              overflow: 'hidden', transition: 'transform 0.2s',
              '&:hover': { transform: 'scale(1.05)' },
              '&:active': { transform: 'scale(0.95)' },
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
        ))
      }
    </Box>
  );
};

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const storeId = activeUserStore?.id;
        const [bannersSnap, catsSnap, featuredSnap, exclusiveSnap, newArrivalSnap] = await Promise.all([
          getDocs(query(collection(db, COLLECTIONS.BANNERS), where('active', '==', true), orderBy('order'))),
          getDocs(query(collection(db, COLLECTIONS.CATEGORIES), where('active', '==', true), orderBy('order'))),
          getDocs(query(collection(db, COLLECTIONS.PRODUCTS), where('isFeatured', '==', true), where('active', '==', true), where('storeId', '==', storeId), limit(10))),
          getDocs(query(collection(db, COLLECTIONS.PRODUCTS), where('isExclusive', '==', true), where('active', '==', true), where('storeId', '==', storeId), limit(8))),
          getDocs(query(collection(db, COLLECTIONS.PRODUCTS), where('isNewArrival', '==', true), where('active', '==', true), where('storeId', '==', storeId), limit(8))),
        ]);
        setBanners(bannersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCategories(catsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setFeatured(featuredSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setExclusive(exclusiveSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setNewArrivals(newArrivalSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Home fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [activeUserStore?.id]);

  return (
    <Box sx={{ pb: { xs: 20, md: 3 } }}>
      <Container maxWidth="lg" sx={{ px: { xs: 1.5, sm: 2 } }}>

        {/* Delivery info strip */}
        <Box
          sx={{
            py: 1, px: 2, mb: 2, mt: 1.5,
            background: `linear-gradient(135deg, ${ZAP_COLORS.primary}15, ${ZAP_COLORS.accent}15)`,
            borderRadius: 2.5, border: `1px solid ${ZAP_COLORS.primary}20`,
            display: 'flex', alignItems: 'center', gap: 1.5, overflowX: 'auto',
            scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {[
            { icon: '⚡', text: 'Express Delivery' },
            { icon: '🏷️', text: 'Best Prices' },
            { icon: '✅', text: 'Fresh & Quality' },
            { icon: '🛵', text: '₹10 Delivery' },
          ].map((item) => (
            <Chip
              key={item.text}
              label={`${item.icon} ${item.text}`}
              size="small"
              sx={{
                background: '#fff', fontWeight: 500, fontSize: '0.72rem',
                border: `1px solid ${ZAP_COLORS.border}`, flexShrink: 0,
              }}
            />
          ))}
        </Box>

        {/* Active orders bar (desktop inline card; mobile rendered from UserLayout) */}
        <Box sx={{ display: { xs: 'none', md: 'block' } }}>
          <ActiveOrdersBar />
        </Box>

        {/* Banner Carousel */}
        <BannerCarousel banners={banners} loading={loading} />

        {/* Categories */}
        <Box sx={{ mt: 3 }}>
          <SectionHeader
            title="Shop by Category"
            onSeeAll={() => navigate('/categories')}
          />
          <CategoryScroll categories={categories} loading={loading} />
        </Box>

        {/* Featured Products */}
        <Box sx={{ mt: 4 }}>
          <SectionHeader
            title="⭐ Featured Products"
            subtitle="Handpicked just for you"
            onSeeAll={() => navigate('/products?filter=featured')}
          />
          <Grid container spacing={{ xs: 1.5, sm: 2 }}>
            {loading
              ? Array(isMobile ? 4 : 5).fill(0).map((_, i) => (
                <Grid item xs={6} sm={4} md={3} lg={2.4} key={i}>
                  <ProductCardSkeleton />
                </Grid>
              ))
              : featured.slice(0, isMobile ? 4 : 5).map((p) => (
                <Grid item xs={6} sm={4} md={3} lg={2.4} key={p.id}>
                  <ProductCard product={p} />
                </Grid>
              ))
            }
          </Grid>
        </Box>

        {/* Exclusive Products */}
        {(loading || exclusive.length > 0) && (
          <Box sx={{ mt: 4 }}>
            <Box
              sx={{
                borderRadius: 3, p: 2, mb: 2,
                background: `linear-gradient(135deg, ${ZAP_COLORS.secondary} 0%, #2A2A4E 100%)`,
              }}
            >
              <SectionHeader
                title={<span style={{ color: '#fff' }}>💛 Exclusive Deals</span>}
                subtitle={<span style={{ color: 'rgba(255,255,255,0.6)' }}>Only on ZAP</span>}
                onSeeAll={() => navigate('/products?filter=exclusive')}
                seeAllLabel={<span style={{ color: ZAP_COLORS.accent }}>See all</span>}
              />
              <Box
                sx={{
                  display: 'flex', gap: 1.5, overflowX: 'auto',
                  pb: 1, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
                }}
              >
                {loading
                  ? Array(4).fill(0).map((_, i) => (
                    <Box key={i} sx={{ flexShrink: 0, width: 140 }}>
                      <ProductCardSkeleton compact />
                    </Box>
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
            <SectionHeader
              title="🆕 New Arrivals"
              subtitle="Just landed in store"
              onSeeAll={() => navigate('/products?filter=new')}
            />
            <Grid container spacing={{ xs: 1.5, sm: 2 }}>
              {loading
                ? Array(4).fill(0).map((_, i) => (
                  <Grid item xs={6} sm={4} md={3} key={i}>
                    <ProductCardSkeleton />
                  </Grid>
                ))
                : newArrivals.slice(0, 4).map((p) => (
                  <Grid item xs={6} sm={4} md={3} key={p.id}>
                    <ProductCard product={p} />
                  </Grid>
                ))
              }
            </Grid>
          </Box>
        )}

      </Container>
    </Box>
  );
};

export default Home;