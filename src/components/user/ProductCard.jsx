import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Box, Typography, IconButton, Chip, Skeleton } from '@mui/material';
import { Add, Remove } from '@mui/icons-material';
import { useCart } from '../../context/CartContext';
import { ZAP_COLORS } from '../../theme';

const ProductCard = ({ product, compact = false }) => {
  const navigate = useNavigate();
  // Removed useAuth — cart no longer requires login to add items.
  // Login is enforced at checkout instead.
  const { addToCart, removeFromCart, updateQuantity, isInCart, getQuantity } = useCart();
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const inCart = isInCart(product.id);
  const qty = getQuantity(product.id);
  const discount = product.mrp && product.discountedPrice
    ? Math.round(((product.mrp - product.discountedPrice) / product.mrp) * 100) : 0;

  // No login check here — user can add to cart as guest.
  // Login is required only when proceeding to checkout.
  const handleAdd = (e) => {
    e.stopPropagation();
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
        boxShadow: 'none',
        transition: 'all 0.2s',
        '&:hover': { boxShadow: `0 4px 16px ${ZAP_COLORS.primary}18`, borderColor: `${ZAP_COLORS.primary}30` },
        '&:active': { transform: 'scale(0.98)' },
      }}
    >
      {/* Discount badge */}
      {discount > 0 && (
        <Chip
          label={`${discount}% off`}
          size="small"
          sx={{
            position: 'absolute', top: 8, left: 8, zIndex: 1,
            background: ZAP_COLORS.primary, color: '#fff',
            fontSize: '0.62rem', height: 18, fontWeight: 700,
          }}
        />
      )}

      {/* Image */}
      <Box sx={{
        position: 'relative', overflow: 'hidden',
        borderRadius: compact ? '10px 10px 0 0' : '12px 12px 0 0',
        background: `${ZAP_COLORS.primary}08`,
        height: compact ? 110 : 140,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!imgLoaded && !imgError && (
          <Skeleton variant="rectangular" sx={{ position: 'absolute', inset: 0, borderRadius: 0 }} />
        )}
        <Box
          component="img"
          src={imgSrc}
          alt={product.name}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          sx={{
            width: '100%', height: '100%', objectFit: 'cover',
            opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.3s',
          }}
        />
      </Box>

      <CardContent sx={{ p: compact ? 1.2 : 1.5, pt: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Typography
          variant="body2"
          fontWeight={600}
          sx={{ fontSize: compact ? '0.75rem' : '0.82rem', lineHeight: 1.3, mb: 0.5, flex: 1 }}
          style={{
            display: '-webkit-box', WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2, overflow: 'hidden',
          }}
        >
          {product.name}
        </Typography>
        {product.unit && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', mb: 0.5 }}>{product.unit}</Typography>
        )}

        {/* Price + Add button */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 'auto' }}>
          <Box>
            <Typography variant="body2" fontWeight={800} color="text.primary" sx={{ fontSize: compact ? '0.82rem' : '0.9rem', lineHeight: 1 }}>
              ₹{product.discountedPrice || product.mrp}
            </Typography>
            {product.discountedPrice && product.mrp > product.discountedPrice && (
              <Typography variant="caption" sx={{ textDecoration: 'line-through', color: 'text.secondary', fontSize: '0.68rem' }}>
                ₹{product.mrp}
              </Typography>
            )}
          </Box>

          {product.stock <= 0 ? (
            <Typography variant="caption" sx={{ color: ZAP_COLORS.error, fontWeight: 600, fontSize: '0.65rem' }}>
              Out of Stock
            </Typography>
          ) : !inCart ? (
            <IconButton
              size="small"
              onClick={handleAdd}
              sx={{
                background: ZAP_COLORS.primary, color: '#fff', borderRadius: 1.5,
                width: 28, height: 28,
                '&:hover': { background: ZAP_COLORS.primaryDark },
                '&:active': { transform: 'scale(0.9)' },
              }}
            >
              <Add sx={{ fontSize: 16 }} />
            </IconButton>
          ) : (
            <Box sx={{
              display: 'flex', alignItems: 'center',
              background: ZAP_COLORS.primary, borderRadius: 1.5, overflow: 'hidden',
            }}>
              <IconButton size="small" onClick={handleDecrease} sx={{ color: '#fff', p: 0.3, borderRadius: 0 }}>
                <Remove sx={{ fontSize: 14 }} />
              </IconButton>
              <Typography sx={{ color: '#fff', fontWeight: 700, px: 0.7, fontSize: '0.8rem', minWidth: 20, textAlign: 'center' }}>
                {qty}
              </Typography>
              <IconButton size="small" onClick={handleIncrease} sx={{ color: '#fff', p: 0.3, borderRadius: 0 }}>
                <Add sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export const ProductCardSkeleton = ({ compact = false }) => (
  <Card sx={{ borderRadius: compact ? 2.5 : 3, border: `1px solid ${ZAP_COLORS.border}`, boxShadow: 'none' }}>
    <Skeleton variant="rectangular" height={compact ? 110 : 140} sx={{ borderRadius: compact ? '10px 10px 0 0' : '12px 12px 0 0' }} />
    <CardContent sx={{ p: compact ? 1.2 : 1.5, pt: 1 }}>
      <Skeleton height={16} sx={{ mb: 0.5 }} />
      <Skeleton width="60%" height={12} sx={{ mb: 1 }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width={40} height={20} />
        <Skeleton variant="rounded" width={28} height={28} />
      </Box>
    </CardContent>
  </Card>
);

export default ProductCard;