import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Box, Typography, IconButton, Chip, Skeleton } from '@mui/material';
import { Add, Remove } from '@mui/icons-material';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { ZAP_COLORS } from '../../theme';

const ProductCard = ({ product, compact = false }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToCart, removeFromCart, updateQuantity, isInCart, getQuantity } = useCart();
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const inCart = isInCart(product.id);
  const qty = getQuantity(product.id);
  const discount = product.mrp && product.discountedPrice
    ? Math.round(((product.mrp - product.discountedPrice) / product.mrp) * 100) : 0;

  const handleAdd = (e) => {
    e.stopPropagation();
    if (!user) {
      navigate('/login', { state: { from: { pathname: window.location.pathname } } });
      return;
    }
    addToCart(product);
  };

  const handleIncrease = (e) => { e.stopPropagation(); updateQuantity(product.id, qty + 1); };
  const handleDecrease = (e) => { e.stopPropagation(); if (qty <= 1) removeFromCart(product.id); else updateQuantity(product.id, qty - 1); };

  if (!product) return null;

  const imgSrc = !imgError && product.images?.[0]
    ? product.images[0]
    : `https://via.placeholder.com/300x300/FFF8F5/FF6B35?text=${encodeURIComponent(product.name?.slice(0, 2) || 'P')}`;

  return (
    <Card
      onClick={() => navigate(`/product/${product.id}`)}
      sx={{
        cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'visible',
        borderRadius: compact ? 2.5 : 3,
        border: `1px solid ${ZAP_COLORS.border}`,
        transition: 'all 0.22s cubic-bezier(0.4,0,0.2,1)',
        '&:hover': { transform: 'translateY(-3px)', boxShadow: `0 10px 28px ${ZAP_COLORS.primary}18`, borderColor: `${ZAP_COLORS.primary}40` },
      }}
    >
      {/* Discount badge */}
      {discount > 0 && (
        <Box sx={{ position: 'absolute', top: 8, left: 8, zIndex: 1, background: `linear-gradient(135deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.primaryDark})`, color: '#fff', borderRadius: 1.5, px: 0.9, py: 0.15, fontSize: '0.65rem', fontWeight: 800, fontFamily: "'Syne', sans-serif", letterSpacing: '0.02em' }}>
          {discount}% OFF
        </Box>
      )}
      {product.isExclusive && !discount && (
        <Box sx={{ position: 'absolute', top: 8, left: 8, zIndex: 1, background: `linear-gradient(135deg, ${ZAP_COLORS.accent}, #F59E0B)`, color: ZAP_COLORS.secondary, borderRadius: 1.5, px: 0.9, py: 0.15, fontSize: '0.65rem', fontWeight: 800, fontFamily: "'Syne', sans-serif" }}>
          EXCLUSIVE
        </Box>
      )}
      {product.isNewArrival && !discount && !product.isExclusive && (
        <Box sx={{ position: 'absolute', top: 8, left: 8, zIndex: 1, background: `linear-gradient(135deg, ${ZAP_COLORS.accentGreen}, #059669)`, color: '#fff', borderRadius: 1.5, px: 0.9, py: 0.15, fontSize: '0.65rem', fontWeight: 800, fontFamily: "'Syne', sans-serif" }}>
          NEW
        </Box>
      )}

      {/* Out of stock */}
      {product.stock <= 0 && (
        <Box sx={{ position: 'absolute', inset: 0, zIndex: 2, background: 'rgba(255,255,255,0.82)', borderRadius: compact ? 2.5 : 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ fontWeight: 700, color: ZAP_COLORS.textSecondary, fontSize: '0.82rem', background: '#fff', px: 1.5, py: 0.4, borderRadius: 10, border: `1px solid ${ZAP_COLORS.border}` }}>
            Out of Stock
          </Typography>
        </Box>
      )}

      {/* Image with lazy loading skeleton */}
      <Box sx={{ position: 'relative', pt: compact ? '80%' : '90%', background: `${ZAP_COLORS.primary}05`, borderRadius: `${compact ? 10 : 12}px ${compact ? 10 : 12}px 0 0`, overflow: 'hidden' }}>
        {!imgLoaded && (
          <Skeleton variant="rectangular" sx={{ position: 'absolute', inset: 0, transform: 'none', borderRadius: 0, background: `${ZAP_COLORS.primary}08` }} />
        )}
        <Box
          component="img"
          src={imgSrc}
          alt={product.name}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => { setImgError(true); setImgLoaded(true); }}
          sx={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            objectFit: 'contain', p: compact ? 0.8 : 1.2,
            opacity: imgLoaded ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        />
      </Box>

      <CardContent sx={{ p: compact ? 1.2 : 1.5, pb: '10px !important', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="body2" fontWeight={600} sx={{ fontSize: compact ? '0.78rem' : '0.85rem', lineHeight: 1.3, mb: 0.3 }} noWrap={compact}>
          {product.name}
        </Typography>
        {product.unit && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block', fontSize: '0.68rem' }}>{product.unit}</Typography>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mt: 'auto', mb: 1 }}>
          <Typography sx={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, color: ZAP_COLORS.textPrimary, fontSize: compact ? '0.95rem' : '1.05rem' }}>
            ₹{product.discountedPrice || product.mrp}
          </Typography>
          {product.discountedPrice && product.mrp > product.discountedPrice && (
            <Typography variant="caption" sx={{ textDecoration: 'line-through', color: ZAP_COLORS.textMuted, fontSize: '0.7rem' }}>
              ₹{product.mrp}
            </Typography>
          )}
        </Box>

        {/* ── Add to cart button ──────────────────────────────────────────── */}
        {!inCart ? (
          <Box
            onClick={handleAdd}
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
              py: compact ? 0.7 : 0.9, borderRadius: 2.5,
              background: `linear-gradient(135deg, ${ZAP_COLORS.primary} 0%, ${ZAP_COLORS.primaryDark} 100%)`,
              color: '#fff', cursor: 'pointer',
              fontFamily: "'Syne', sans-serif", fontWeight: 700,
              fontSize: compact ? '0.72rem' : '0.78rem',
              letterSpacing: '0.04em',
              boxShadow: `0 3px 10px ${ZAP_COLORS.primary}35`,
              transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
              '&:hover': { transform: 'scale(1.03)', boxShadow: `0 5px 16px ${ZAP_COLORS.primary}50` },
              '&:active': { transform: 'scale(0.96)' },
            }}
          >
            <Add sx={{ fontSize: compact ? 13 : 15 }} />
            ADD
          </Box>
        ) : (
          <Box sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderRadius: 2.5, overflow: 'hidden',
            background: `linear-gradient(135deg, ${ZAP_COLORS.primary} 0%, ${ZAP_COLORS.primaryDark} 100%)`,
            boxShadow: `0 3px 10px ${ZAP_COLORS.primary}35`,
          }}>
            <IconButton
              size="small" onClick={handleDecrease}
              sx={{ color: '#fff', borderRadius: 0, p: compact ? 0.5 : 0.7, '&:hover': { background: 'rgba(0,0,0,0.15)' } }}
            >
              <Remove sx={{ fontSize: compact ? 14 : 16 }} />
            </IconButton>
            <Typography sx={{ color: '#fff', fontWeight: 800, fontFamily: "'Syne', sans-serif", fontSize: compact ? '0.85rem' : '0.95rem', minWidth: 20, textAlign: 'center' }}>
              {qty}
            </Typography>
            <IconButton
              size="small" onClick={handleIncrease}
              sx={{ color: '#fff', borderRadius: 0, p: compact ? 0.5 : 0.7, '&:hover': { background: 'rgba(0,0,0,0.15)' } }}
            >
              <Add sx={{ fontSize: compact ? 14 : 16 }} />
            </IconButton>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export const ProductCardSkeleton = ({ compact = false }) => (
  <Card sx={{ borderRadius: compact ? 2.5 : 3, border: `1px solid ${ZAP_COLORS.border}` }}>
    <Skeleton variant="rectangular" height={compact ? 120 : 150} sx={{ transform: 'none' }} />
    <CardContent sx={{ p: 1.5 }}>
      <Skeleton width="75%" height={14} sx={{ mb: 0.5 }} />
      <Skeleton width="40%" height={12} sx={{ mb: 0.8 }} />
      <Skeleton width="50%" height={18} sx={{ mb: 1 }} />
      <Skeleton variant="rectangular" height={34} sx={{ borderRadius: 2.5 }} />
    </CardContent>
  </Card>
);

export default ProductCard;