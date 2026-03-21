import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Typography, Button, IconButton, Divider,
  Paper, Chip, TextField, Alert, CircularProgress,
} from '@mui/material';
import { Add, Remove, Delete, ShoppingBag, ArrowBack } from '@mui/icons-material';
import {
  collection, query, where, getDocs,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { ZAP_COLORS } from '../../theme';

const Cart = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    items, coupon, setCoupon, updateQuantity, removeFromCart,
    subtotal, discount, deliveryCharge, total, savings,
    FREE_DELIVERY_ABOVE,
  } = useCart();
  const [couponInput, setCouponInput] = React.useState('');
  const [couponError, setCouponError] = React.useState('');
  const [couponLoading, setCouponLoading] = React.useState(false);

  const handleCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const snap = await getDocs(
        query(
          collection(db, COLLECTIONS.COUPONS),
          where('code', '==', code),
          where('active', '==', true),
        )
      );
      if (snap.empty) {
        setCouponError('Invalid or expired coupon code.');
        return;
      }
      const data = snap.docs[0].data();

      // Check expiry
      if (data.expiresAt) {
        const expiry = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
        if (expiry < new Date()) {
          setCouponError('This coupon has expired.');
          return;
        }
      }

      // Check minimum order
      if (data.minOrder && subtotal < data.minOrder) {
        setCouponError(`Minimum order ₹${data.minOrder} required for this coupon.`);
        return;
      }

      setCoupon({ code: data.code, type: data.type, value: data.value, maxDiscount: data.maxDiscount });
      setCouponInput('');
    } catch (err) {
      setCouponError('Failed to validate coupon. Please try again.');
    } finally {
      setCouponLoading(false);
    }
  };

  if (!items.length) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <Box sx={{ fontSize: '5rem', mb: 2 }}>🛒</Box>
        <Typography variant="h5" fontWeight={700} mb={1}>Your cart is empty</Typography>
        <Typography color="text.secondary" mb={3}>Add some products to get started!</Typography>
        <Button variant="contained" size="large" onClick={() => navigate('/')}>
          Browse Products
        </Button>
      </Container>
    );
  }

  return (
    <Box sx={{ pb: { xs: 13, md: 3 }, pt: 1 }}>
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, px: { xs: 1, sm: 0 } }}>
          <IconButton onClick={() => navigate(-1)} size="small">
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" fontWeight={700}>
            My Cart <Typography component="span" variant="body2" color="text.secondary">({items.length} items)</Typography>
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
          {/* Items list */}
          <Box sx={{ flex: 1 }}>
            {/* Savings strip */}
            {(savings + discount) > 0 && (
              <Alert icon="🎉" severity="success" sx={{ mb: 2, borderRadius: 2 }}>
                You're saving <strong>₹{savings + discount}</strong> on this order!
              </Alert>
            )}

            {/* Delivery progress */}
            {subtotal < FREE_DELIVERY_ABOVE && (
              <Box sx={{
                mb: 2, p: 1.5, borderRadius: 2,
                background: `${ZAP_COLORS.primary}10`,
                border: `1px solid ${ZAP_COLORS.primary}20`,
              }}>
                <Typography variant="caption" sx={{ color: ZAP_COLORS.primary, fontWeight: 600 }}>
                  Add ₹{FREE_DELIVERY_ABOVE - subtotal} more for FREE delivery!
                </Typography>
                <Box sx={{
                  mt: 0.8, height: 5, borderRadius: 3,
                  background: `${ZAP_COLORS.primary}20`,
                  overflow: 'hidden',
                }}>
                  <Box sx={{
                    height: '100%', borderRadius: 3,
                    width: `${Math.min((subtotal / FREE_DELIVERY_ABOVE) * 100, 100)}%`,
                    background: `linear-gradient(90deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.accent})`,
                    transition: 'width 0.4s',
                  }} />
                </Box>
              </Box>
            )}

            <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, overflow: 'hidden' }}>
              {items.map((item, idx) => (
                <React.Fragment key={item.id}>
                  <Box sx={{ p: 2, display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <Box
                      component="img"
                      src={item.images?.[0] || `https://via.placeholder.com/80x80/FFF8F5/FF6B35?text=${item.name?.[0]}`}
                      alt={item.name}
                      sx={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 2, flexShrink: 0, background: `${ZAP_COLORS.primary}06` }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>{item.name}</Typography>
                      {item.unit && <Typography variant="caption" color="text.secondary">{item.unit}</Typography>}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mt: 0.5 }}>
                        <Typography fontWeight={700} color="primary" fontSize="0.95rem">
                          ₹{item.discountedPrice || item.mrp}
                        </Typography>
                        {item.discountedPrice && item.mrp > item.discountedPrice && (
                          <Typography variant="caption" sx={{ textDecoration: 'line-through', color: ZAP_COLORS.textMuted }}>
                            ₹{item.mrp}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                      <IconButton size="small" onClick={() => removeFromCart(item.id)} sx={{ color: ZAP_COLORS.textMuted, p: 0.3 }}>
                        <Delete fontSize="small" />
                      </IconButton>
                      <Box sx={{
                        display: 'flex', alignItems: 'center',
                        background: ZAP_COLORS.primary, borderRadius: 1.5, overflow: 'hidden',
                      }}>
                        <IconButton size="small" onClick={() => updateQuantity(item.id, item.quantity - 1)} sx={{ color: '#fff', p: 0.4, borderRadius: 0 }}>
                          <Remove sx={{ fontSize: 14 }} />
                        </IconButton>
                        <Typography sx={{ color: '#fff', fontWeight: 700, px: 1, fontSize: '0.85rem', minWidth: 24, textAlign: 'center' }}>
                          {item.quantity}
                        </Typography>
                        <IconButton size="small" onClick={() => updateQuantity(item.id, item.quantity + 1)} sx={{ color: '#fff', p: 0.4, borderRadius: 0 }}>
                          <Add sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Box>
                      <Typography variant="caption" fontWeight={600} color="text.secondary">
                        ₹{((item.discountedPrice || item.mrp) * item.quantity).toFixed(0)}
                      </Typography>
                    </Box>
                  </Box>
                  {idx < items.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </Paper>
          </Box>

          {/* Order Summary */}
          <Box sx={{ width: { xs: '100%', md: 340 }, flexShrink: 0 }}>
            <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5, position: { md: 'sticky' }, top: { md: 80 } }}>
              <Typography variant="h6" fontWeight={700} mb={2}>Order Summary</Typography>

              {/* Coupon */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  placeholder="Enter coupon code"
                  value={couponInput}
                  onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
                  size="small"
                  error={!!couponError}
                  helperText={couponError}
                  sx={{ flex: 1 }}
                />
                <Button variant="outlined" size="small" onClick={handleCoupon} disabled={couponLoading} sx={{ flexShrink: 0 }}>
                  {couponLoading ? <CircularProgress size={14} /> : 'Apply'}
                </Button>
              </Box>
              {coupon && (
                <Chip
                  label={`${coupon.code} applied - ₹${discount} off`}
                  color="success" size="small" onDelete={() => setCoupon(null)}
                  sx={{ mb: 2, width: '100%' }}
                />
              )}

              <Divider sx={{ mb: 2 }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Subtotal</Typography>
                  <Typography variant="body2" fontWeight={500}>₹{subtotal}</Typography>
                </Box>
                {discount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="success.main">Coupon Discount</Typography>
                    <Typography variant="body2" color="success.main" fontWeight={600}>-₹{discount}</Typography>
                  </Box>
                )}
                {savings > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="success.main">Product Savings</Typography>
                    <Typography variant="body2" color="success.main" fontWeight={600}>-₹{savings}</Typography>
                  </Box>
                )}
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Delivery</Typography>
                  <Typography variant="body2" fontWeight={500} color={deliveryCharge === 0 ? 'success.main' : 'text.primary'}>
                    {deliveryCharge === 0 ? 'FREE' : `₹${deliveryCharge}`}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2.5 }}>
                <Typography fontWeight={700}>Total</Typography>
                <Typography fontWeight={800} fontSize="1.2rem" color="primary">₹{total}</Typography>
              </Box>

              <Button
                fullWidth variant="contained" size="large"
                startIcon={<ShoppingBag />}
                onClick={() => {
                  if (!user) {
                    navigate('/login', { state: { from: { pathname: '/checkout' } } });
                  } else {
                    navigate('/checkout');
                  }
                }}
              >
                Proceed to Checkout
              </Button>

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1.5 }}>
                🔒 Secure checkout
              </Typography>
            </Paper>
          </Box>
        </Box>
      </Container>
    </Box>
  );
};

export default Cart;