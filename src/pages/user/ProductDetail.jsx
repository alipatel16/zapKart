// ============================================================
// src/pages/user/ProductDetail.jsx
//
// UPDATED: Fetches product from storeInventory (has pricing/stock)
// with fallback to global products catalog.
// Related products also fetched from storeInventory.
// ============================================================
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Container, Typography, Button, Chip, Skeleton,
  IconButton, Divider, Grid, Alert,
} from '@mui/material';
import { Add, Remove, ArrowBack } from '@mui/icons-material';
import { doc, getDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import ProductCard from '../../components/user/ProductCard';
import { ZAP_COLORS } from '../../theme';

// ── Map storeInventory doc → product shape ───────────────────────────────────
const mapSIDoc = (d) => {
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
  };
};

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeUserStore } = useStore();
  const { addToCart, updateQuantity, removeFromCart, isInCart, getQuantity } = useCart();
  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);

  const inCart = product && isInCart(product.id);
  const qty = product ? getQuantity(product.id) : 0;

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      try {
        let data = null;
        const storeId = activeUserStore?.id;

        // ── Try storeInventory first (has pricing & stock for this store) ──
        if (storeId) {
          const siDocId = `${storeId}__${id}`;
          const siSnap = await getDoc(doc(db, COLLECTIONS.STORE_INVENTORY, siDocId));
          if (siSnap.exists()) {
            data = mapSIDoc(siSnap);
          }
        }

        // ── Fallback: global product catalog (no pricing/stock) ──
        if (!data) {
          const snap = await getDoc(doc(db, COLLECTIONS.PRODUCTS, id));
          if (snap.exists()) {
            const raw = snap.data();
            data = {
              id: snap.id,
              ...raw,
              mrp: raw.mrp || 0,
              discountedPrice: raw.discountedPrice || null,
              stock: 0, // global catalog has no stock
            };
          }
        }

        if (data) {
          setProduct(data);
          // ── Fetch related from storeInventory ──
          if (storeId && data.categoryId) {
            const relSnap = await getDocs(
              query(
                collection(db, COLLECTIONS.STORE_INVENTORY),
                where('storeId', '==', storeId),
                where('categoryId', '==', data.categoryId),
                where('active', '==', true),
                limit(5)
              )
            );
            setRelated(relSnap.docs.map(mapSIDoc).filter((p) => p.id !== id));
          }
        }
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [id, activeUserStore?.id]);

  const discount = product?.mrp && product?.discountedPrice
    ? Math.round(((product.mrp - product.discountedPrice) / product.mrp) * 100) : 0;

  const images = product?.images?.length ? product.images : ['https://via.placeholder.com/400x400/FFF8F5/FF6B35?text=Product'];

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ pt: 2, pb: 10 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={5}>
            <Skeleton variant="rectangular" sx={{ borderRadius: 3, aspectRatio: '1/1' }} />
          </Grid>
          <Grid item xs={12} md={7}>
            <Skeleton width="60%" height={32} />
            <Skeleton width="40%" height={24} sx={{ mt: 1 }} />
            <Skeleton width="30%" height={40} sx={{ mt: 2 }} />
            <Skeleton variant="rectangular" height={50} sx={{ borderRadius: 2, mt: 3 }} />
          </Grid>
        </Grid>
      </Container>
    );
  }

  if (!product) {
    return (
      <Container sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h6">Product not found</Typography>
        <Button onClick={() => navigate('/')} sx={{ mt: 2 }}>Go Home</Button>
      </Container>
    );
  }

  return (
    <Box sx={{ pb: { xs: 13, md: 3 } }}>
      <Container maxWidth="lg">
        {/* Back */}
        <Box sx={{ py: 1.5, px: { xs: 1, sm: 0 } }}>
          <IconButton onClick={() => navigate(-1)} size="small"><ArrowBack /></IconButton>
        </Box>

        <Grid container spacing={{ xs: 2, md: 4 }}>
          {/* Images */}
          <Grid item xs={12} md={5}>
            <Box sx={{
              borderRadius: 3, overflow: 'hidden',
              border: `1px solid ${ZAP_COLORS.border}`,
              background: `${ZAP_COLORS.primary}06`,
              aspectRatio: '1/1', display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
            }}>
              {discount > 0 && (
                <Box sx={{
                  position: 'absolute', top: 12, left: 12,
                  background: `linear-gradient(135deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.primaryDark})`,
                  color: '#fff', borderRadius: 2, px: 1.5, py: 0.4,
                  fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '0.85rem',
                }}>
                  {discount}% OFF
                </Box>
              )}
              <Box component="img" src={images[selectedImage]} alt={product.name}
                sx={{ width: '100%', height: '100%', objectFit: 'contain', p: 2 }} />
            </Box>

            {/* Thumbnails */}
            {images.length > 1 && (
              <Box sx={{ display: 'flex', gap: 1, mt: 1.5, overflowX: 'auto', pb: 0.5 }}>
                {images.map((img, i) => (
                  <Box key={i} onClick={() => setSelectedImage(i)}
                    sx={{
                      width: 56, height: 56, borderRadius: 2, overflow: 'hidden', flexShrink: 0,
                      border: `2px solid ${i === selectedImage ? ZAP_COLORS.primary : ZAP_COLORS.border}`,
                      cursor: 'pointer', opacity: i === selectedImage ? 1 : 0.6,
                      transition: 'all 0.2s',
                    }}>
                    <Box component="img" src={img} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </Box>
                ))}
              </Box>
            )}
          </Grid>

          {/* Details */}
          <Grid item xs={12} md={7}>
            <Box sx={{ display: 'flex', gap: 0.8, mb: 1, flexWrap: 'wrap' }}>
              {product.isFeatured && <Chip label="⭐ Featured" size="small" sx={{ fontWeight: 600, fontSize: '0.7rem' }} />}
              {product.isExclusive && <Chip label="💛 Exclusive" size="small" sx={{ fontWeight: 600, fontSize: '0.7rem' }} />}
              {product.isNewArrival && <Chip label="🆕 New" size="small" sx={{ fontWeight: 600, fontSize: '0.7rem' }} />}
            </Box>

            <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif", mb: 0.5 }}>
              {product.name}
            </Typography>
            {product.unit && (
              <Typography variant="body2" color="text.secondary" mb={2}>{product.unit}</Typography>
            )}

            {/* Price */}
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 2 }}>
              <Typography variant="h4" fontWeight={800} color="primary">
                ₹{product.discountedPrice || product.mrp}
              </Typography>
              {product.discountedPrice && product.mrp > product.discountedPrice && (
                <>
                  <Typography variant="h6" sx={{ textDecoration: 'line-through', color: 'text.secondary' }}>
                    ₹{product.mrp}
                  </Typography>
                  <Chip label={`Save ₹${product.mrp - product.discountedPrice}`} size="small"
                    sx={{ background: `${ZAP_COLORS.accentGreen}20`, color: ZAP_COLORS.accentGreen, fontWeight: 700 }} />
                </>
              )}
            </Box>

            {/* Stock status */}
            {product.stock <= 0 ? (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>Out of Stock</Alert>
            ) : product.stock <= 5 ? (
              <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>Only {product.stock} left in stock!</Alert>
            ) : null}

            {/* Add to cart */}
            <Box sx={{ mb: 3 }}>
              {!inCart ? (
                <Box
                  onClick={() => {
                    if (product.stock <= 0) return;
                    if (!user) { navigate('/login', { state: { from: { pathname: `/product/${id}` } } }); return; }
                    addToCart(product);
                  }}
                  sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
                    py: 1.7, borderRadius: 3, cursor: product.stock <= 0 ? 'not-allowed' : 'pointer',
                    background: product.stock <= 0 ? ZAP_COLORS.border : `linear-gradient(135deg, ${ZAP_COLORS.primary} 0%, ${ZAP_COLORS.primaryDark} 100%)`,
                    color: product.stock <= 0 ? ZAP_COLORS.textMuted : '#fff',
                    fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '1.05rem', letterSpacing: '0.04em',
                    boxShadow: product.stock <= 0 ? 'none' : `0 6px 20px ${ZAP_COLORS.primary}45`,
                    transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                    '&:hover': product.stock <= 0 ? {} : { transform: 'scale(1.015)', boxShadow: `0 8px 24px ${ZAP_COLORS.primary}55` },
                    '&:active': { transform: 'scale(0.97)' },
                  }}
                >
                  <Add sx={{ fontSize: 22 }} />
                  {product.stock <= 0 ? 'Out of Stock' : 'Add to Cart'}
                </Box>
              ) : (
                <Box sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${ZAP_COLORS.primary}`, borderRadius: 3, overflow: 'hidden',
                }}>
                  <IconButton onClick={() => qty <= 1 ? removeFromCart(product.id) : updateQuantity(product.id, qty - 1)}
                    sx={{ borderRadius: 0, py: 1.5, px: 3 }}>
                    <Remove />
                  </IconButton>
                  <Typography fontWeight={800} fontSize="1.2rem" sx={{ px: 3, minWidth: 48, textAlign: 'center' }}>
                    {qty}
                  </Typography>
                  <IconButton onClick={() => updateQuantity(product.id, qty + 1)}
                    sx={{ borderRadius: 0, py: 1.5, px: 3 }}>
                    <Add />
                  </IconButton>
                </Box>
              )}
            </Box>

            {/* Description */}
            {product.description && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" fontWeight={700} mb={0.5}>Description</Typography>
                <Typography variant="body2" color="text.secondary">{product.description}</Typography>
              </Box>
            )}

            <Divider sx={{ mb: 2 }} />

            {/* Delivery info */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">🛵</Typography>
              <Typography variant="body2" color="text.secondary">
                Free delivery on orders above ₹{process.env.REACT_APP_FREE_DELIVERY_ABOVE || 299}.
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {/* Related products */}
        {related.length > 0 && (
          <Box sx={{ mt: 5 }}>
            <Typography variant="h6" fontWeight={700} mb={2} sx={{ fontFamily: "'Syne', sans-serif" }}>
              You may also like
            </Typography>
            <Grid container spacing={{ xs: 1.5, sm: 2 }}>
              {related.slice(0, 4).map((p) => (
                <Grid item xs={6} sm={4} md={3} key={p.id}>
                  <ProductCard product={p} />
                </Grid>
              ))}
            </Grid>
          </Box>
        )}
      </Container>
    </Box>
  );
};

export default ProductDetail;