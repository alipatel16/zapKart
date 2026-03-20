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
import ProductCard from '../../components/user/ProductCard';
import { ZAP_COLORS } from '../../theme';

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToCart, updateQuantity, removeFromCart, isInCart, getQuantity } = useCart();
  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);

  const inCart = product && isInCart(product.id);
  const qty = product ? getQuantity(product.id) : 0;

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, COLLECTIONS.PRODUCTS, id));
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() };
          setProduct(data);
          // Fetch related
          const relSnap = await getDocs(
            query(collection(db, COLLECTIONS.PRODUCTS),
              where('categoryId', '==', data.categoryId),
              where('active', '==', true),
              limit(5))
          );
          setRelated(relSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.id !== id));
        }
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id]);

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
            {/* Main image */}
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
              <Box
                component="img"
                src={images[selectedImage]}
                alt={product.name}
                sx={{ width: '85%', height: '85%', objectFit: 'contain' }}
              />
            </Box>

            {/* Thumbnail row */}
            {images.length > 1 && (
              <Box sx={{ display: 'flex', gap: 1, mt: 1.5, overflowX: 'auto' }}>
                {images.map((img, i) => (
                  <Box
                    key={i}
                    component="img"
                    src={img}
                    alt=""
                    onClick={() => setSelectedImage(i)}
                    sx={{
                      width: 60, height: 60, borderRadius: 2, objectFit: 'cover',
                      cursor: 'pointer', flexShrink: 0,
                      border: `2px solid ${selectedImage === i ? ZAP_COLORS.primary : ZAP_COLORS.border}`,
                      background: `${ZAP_COLORS.primary}06`,
                      transition: 'border-color 0.2s',
                    }}
                  />
                ))}
              </Box>
            )}
          </Grid>

          {/* Info */}
          <Grid item xs={12} md={7}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
              {product.isExclusive && <Chip label="EXCLUSIVE" size="small" sx={{ background: `${ZAP_COLORS.accent}20`, color: '#B45309', fontWeight: 700, fontSize: '0.68rem' }} />}
              {product.isNewArrival && <Chip label="NEW ARRIVAL" size="small" color="success" sx={{ fontWeight: 700, fontSize: '0.68rem' }} />}
              {product.isFeatured && <Chip label="FEATURED" size="small" color="primary" sx={{ fontWeight: 700, fontSize: '0.68rem' }} />}
            </Box>

            <Typography variant="h5" fontWeight={700} sx={{ fontFamily: "'Syne', sans-serif", lineHeight: 1.3, mb: 0.5 }}>
              {product.name}
            </Typography>

            {product.unit && (
              <Typography variant="body2" color="text.secondary" mb={1}>{product.unit}</Typography>
            )}

            {/* Price */}
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 2 }}>
              <Typography sx={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '2rem', color: ZAP_COLORS.textPrimary }}>
                ₹{product.discountedPrice || product.mrp}
              </Typography>
              {product.discountedPrice && product.mrp > product.discountedPrice && (
                <>
                  <Typography sx={{ textDecoration: 'line-through', color: ZAP_COLORS.textMuted, fontSize: '1.1rem' }}>
                    ₹{product.mrp}
                  </Typography>
                  <Chip
                    label={`${discount}% off`}
                    size="small"
                    sx={{ background: `${ZAP_COLORS.primary}15`, color: ZAP_COLORS.primary, fontWeight: 700 }}
                  />
                </>
              )}
            </Box>

            {/* Stock */}
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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{
                    display: 'flex', alignItems: 'center', flex: 1,
                    background: `linear-gradient(135deg, ${ZAP_COLORS.primary} 0%, ${ZAP_COLORS.primaryDark} 100%)`,
                    borderRadius: 3, overflow: 'hidden', boxShadow: `0 4px 14px ${ZAP_COLORS.primary}40`,
                  }}>
                    <IconButton onClick={() => { if (qty <= 1) removeFromCart(product.id); else updateQuantity(product.id, qty - 1); }} sx={{ color: '#fff', p: 1.3, '&:hover': { background: 'rgba(0,0,0,0.15)' } }}>
                      <Remove />
                    </IconButton>
                    <Typography sx={{ color: '#fff', fontWeight: 800, flex: 1, textAlign: 'center', fontSize: '1.1rem', fontFamily: "'Syne', sans-serif" }}>
                      {qty}
                    </Typography>
                    <IconButton onClick={() => updateQuantity(product.id, qty + 1)} sx={{ color: '#fff', p: 1.3, '&:hover': { background: 'rgba(0,0,0,0.15)' } }}>
                      <Add />
                    </IconButton>
                  </Box>
                  <Button variant="contained" size="large" onClick={() => navigate('/cart')} sx={{ borderRadius: 3, px: 3 }}>
                    Go to Cart
                  </Button>
                </Box>
              )}
            </Box>

            <Divider sx={{ mb: 2 }} />

            {/* Description */}
            {product.description && (
              <Box mb={2}>
                <Typography variant="subtitle2" fontWeight={700} mb={0.5}>About this product</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                  {product.description}
                </Typography>
              </Box>
            )}

            {/* Delivery info */}
            <Box sx={{
              p: 2, borderRadius: 2,
              background: `${ZAP_COLORS.primary}08`,
              border: `1px solid ${ZAP_COLORS.primary}20`,
            }}>
              <Typography variant="body2" fontWeight={600} mb={0.5}>🛵 Delivery Info</Typography>
              <Typography variant="caption" color="text.secondary">
                Delivery charge: ₹{process.env.REACT_APP_DELIVERY_CHARGE || 10} per order.
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