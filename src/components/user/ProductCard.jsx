import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, CardMedia, CardContent, Box, Typography,
  IconButton, Chip, Skeleton,
} from '@mui/material';
import { Add, Remove } from '@mui/icons-material';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { ZAP_COLORS } from '../../theme';

const ProductCard = ({ product, compact = false }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToCart, removeFromCart, updateQuantity, isInCart, getQuantity } = useCart();
  const [imgError, setImgError] = useState(false);

  const inCart = isInCart(product.id);
  const qty = getQuantity(product.id);
  const discount = product.mrp && product.discountedPrice
    ? Math.round(((product.mrp - product.discountedPrice) / product.mrp) * 100)
    : 0;

  const handleAdd = (e) => {
    e.stopPropagation();
    if (!user) {
      navigate('/login', { state: { from: { pathname: window.location.pathname } } });
      return;
    }
    addToCart(product);
  };

  const handleIncrease = (e) => {
    e.stopPropagation();
    updateQuantity(product.id, qty + 1);
  };

  const handleDecrease = (e) => {
    e.stopPropagation();
    if (qty <= 1) removeFromCart(product.id);
    else updateQuantity(product.id, qty - 1);
  };

  if (!product) return null;

  return (
    <Card
      onClick={() => navigate(`/product/${product.id}`)}
      sx={{
        cursor: 'pointer', height: '100%',
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'visible',
        borderRadius: compact ? 2 : 3,
      }}
    >
      {/* Discount badge */}
      {discount > 0 && (
        <Box sx={{
          position: 'absolute', top: 8, left: 8, zIndex: 1,
          background: `linear-gradient(135deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.primaryDark})`,
          color: '#fff', borderRadius: 1.5, px: 1, py: 0.2,
          fontSize: '0.7rem', fontWeight: 700, fontFamily: "'Syne', sans-serif",
        }}>
          {discount}% OFF
        </Box>
      )}

      {/* Labels */}
      {product.isExclusive && !discount && (
        <Box sx={{
          position: 'absolute', top: 8, left: 8, zIndex: 1,
          background: `linear-gradient(135deg, ${ZAP_COLORS.accent}, #F59E0B)`,
          color: ZAP_COLORS.secondary, borderRadius: 1.5, px: 1, py: 0.2,
          fontSize: '0.68rem', fontWeight: 700, fontFamily: "'Syne', sans-serif",
        }}>
          EXCLUSIVE
        </Box>
      )}
      {product.isNewArrival && !discount && !product.isExclusive && (
        <Box sx={{
          position: 'absolute', top: 8, left: 8, zIndex: 1,
          background: `linear-gradient(135deg, ${ZAP_COLORS.accentGreen}, #059669)`,
          color: '#fff', borderRadius: 1.5, px: 1, py: 0.2,
          fontSize: '0.68rem', fontWeight: 700, fontFamily: "'Syne', sans-serif",
        }}>
          NEW
        </Box>
      )}

      {/* Out of stock overlay */}
      {product.stock <= 0 && (
        <Box sx={{
          position: 'absolute', inset: 0, zIndex: 2,
          background: 'rgba(255,255,255,0.75)', borderRadius: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Typography sx={{ fontWeight: 700, color: ZAP_COLORS.textSecondary, fontSize: '0.85rem' }}>
            Out of Stock
          </Typography>
        </Box>
      )}

      {/* Image */}
      <Box sx={{
        position: 'relative', pt: compact ? '75%' : '85%',
        background: `${ZAP_COLORS.primary}06`, borderRadius: '16px 16px 0 0', overflow: 'hidden',
      }}>
        <CardMedia
          component="img"
          image={!imgError && product.images?.[0] ? product.images[0] : `https://via.placeholder.com/300x300/FFF8F5/FF6B35?text=${encodeURIComponent(product.name?.slice(0, 2) || 'P')}`}
          alt={product.name}
          onError={() => setImgError(true)}
          sx={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            objectFit: 'contain', p: compact ? 0.5 : 1,
          }}
        />
      </Box>

      <CardContent sx={{ p: compact ? 1 : 1.5, pb: '8px !important', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Typography
          variant="body2"
          fontWeight={600}
          sx={{ fontSize: compact ? '0.78rem' : '0.85rem', lineHeight: 1.3, mb: 0.5 }}
          noWrap={compact}
        >
          {product.name}
        </Typography>

        {product.unit && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            {product.unit}
          </Typography>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 'auto' }}>
          <Typography
            sx={{
              fontFamily: "'Syne', sans-serif", fontWeight: 700,
              color: ZAP_COLORS.textPrimary, fontSize: compact ? '0.9rem' : '1rem',
            }}
          >
            ₹{product.discountedPrice || product.mrp}
          </Typography>
          {product.discountedPrice && product.mrp > product.discountedPrice && (
            <Typography
              variant="caption"
              sx={{ textDecoration: 'line-through', color: ZAP_COLORS.textMuted, fontSize: '0.72rem' }}
            >
              ₹{product.mrp}
            </Typography>
          )}
        </Box>

        {/* Add to Cart */}
        <Box sx={{ mt: 1 }}>
          {!inCart ? (
            <Box
              onClick={handleAdd}
              sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                py: 0.8, borderRadius: 2,
                border: `1.5px solid ${ZAP_COLORS.primary}`,
                color: ZAP_COLORS.primary, cursor: 'pointer',
                fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: '0.78rem',
                transition: 'all 0.2s',
                '&:hover': { background: ZAP_COLORS.primary, color: '#fff' },
                '&:active': { transform: 'scale(0.96)' },
              }}
            >
              ADD
            </Box>
          ) : (
            <Box sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: ZAP_COLORS.primary, borderRadius: 2, overflow: 'hidden',
            }}>
              <IconButton size="small" onClick={handleDecrease} sx={{ color: '#fff', borderRadius: 0, p: 0.5 }}>
                <Remove fontSize="small" />
              </IconButton>
              <Typography sx={{ color: '#fff', fontWeight: 700, fontFamily: "'Syne', sans-serif", fontSize: '0.9rem' }}>
                {qty}
              </Typography>
              <IconButton size="small" onClick={handleIncrease} sx={{ color: '#fff', borderRadius: 0, p: 0.5 }}>
                <Add fontSize="small" />
              </IconButton>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export const ProductCardSkeleton = ({ compact = false }) => (
  <Card sx={{ borderRadius: 3 }}>
    <Skeleton variant="rectangular" height={compact ? 120 : 160} />
    <CardContent sx={{ p: 1.5 }}>
      <Skeleton width="80%" height={16} />
      <Skeleton width="40%" height={14} />
      <Skeleton width="60%" height={20} sx={{ mt: 0.5 }} />
      <Skeleton variant="rectangular" height={34} sx={{ mt: 1, borderRadius: 2 }} />
    </CardContent>
  </Card>
);

export default ProductCard;
