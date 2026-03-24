// ============================================================
// src/pages/user/Cart.jsx
//
// Reconciliation is now handled globally by CartReconciler
// (mounted in App.js). This file only reads the already-
// reconciled items and renders the UI.
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Typography, Button, IconButton, Divider,
  Paper, TextField, Alert, CircularProgress, Chip,
} from '@mui/material';
import { Add, Remove, Delete, ShoppingBag, ArrowBack, InfoOutlined } from '@mui/icons-material';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { ZAP_COLORS } from '../../theme';

const Cart = () => {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { activeUserStore } = useStore();
  const {
    items, coupon, setCoupon, updateQuantity, removeFromCart,
    mrpTotal, subtotal, discount, deliveryCharge, total, savings,
    FREE_DELIVERY_ABOVE,
  } = useCart();

  const [couponInput,   setCouponInput]   = useState('');
  const [couponError,   setCouponError]   = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  // CartReconciler (in App.js) already set _unavailable flags
  const unavailableItems = items.filter((i) =>  i._unavailable);
  const availableItems   = items.filter((i) => !i._unavailable);

  const handleCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.COUPONS), where('code', '==', code), where('active', '==', true))
      );
      if (snap.empty) { setCouponError('Invalid or expired coupon code.'); return; }
      const data = snap.docs[0].data();
      if (data.expiresAt) {
        const expiry = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
        if (expiry < new Date()) { setCouponError('This coupon has expired.'); return; }
      }
      if (data.minOrder && subtotal < data.minOrder) {
        setCouponError(`Minimum order ₹${data.minOrder} required for this coupon.`);
        return;
      }
      setCoupon({ code: data.code, type: data.type, value: data.value, maxDiscount: data.maxDiscount });
      setCouponInput('');
    } catch {
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
        <Button variant="contained" size="large" onClick={() => navigate('/')}>Browse Products</Button>
      </Container>
    );
  }

  return (
    <Box sx={{ pb: { xs: 13, md: 3 }, pt: 1 }}>
      <Container maxWidth="lg">
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, px: { xs: 1, sm: 0 } }}>
          <IconButton onClick={() => navigate(-1)} size="small"><ArrowBack /></IconButton>
          <Typography variant="h6" fontWeight={700}>
            My Cart{' '}
            <Typography component="span" variant="body2" color="text.secondary">
              ({items.length} item{items.length !== 1 ? 's' : ''})
            </Typography>
          </Typography>
        </Box>

        {/* Unavailable items section */}
        {unavailableItems.length > 0 && (
          <Paper
            elevation={0}
            sx={{
              border: `1.5px solid ${ZAP_COLORS.error || '#EF4444'}35`,
              borderRadius: 3, mb: 2, overflow: 'hidden',
              background: `${ZAP_COLORS.error || '#EF4444'}03`,
            }}
          >
            <Box sx={{
              px: 2, py: 1.2,
              background: `${ZAP_COLORS.error || '#EF4444'}10`,
              borderBottom: `1px solid ${ZAP_COLORS.error || '#EF4444'}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                <InfoOutlined sx={{ fontSize: 16, color: ZAP_COLORS.error || '#EF4444' }} />
                <Typography variant="body2" fontWeight={700} sx={{ color: ZAP_COLORS.error || '#EF4444' }}>
                  Not available at {activeUserStore?.name}
                </Typography>
              </Box>
              <Button
                size="small" color="error" variant="outlined"
                sx={{ fontSize: '0.72rem', py: 0.3, px: 1 }}
                onClick={() => unavailableItems.forEach((i) => removeFromCart(i.id))}
              >
                Remove All
              </Button>
            </Box>

            {unavailableItems.map((item, idx) => (
              <Box key={item.id}>
                {idx > 0 && <Divider />}
                <Box sx={{ display: 'flex', gap: 1.5, p: 1.5, alignItems: 'center', opacity: 0.6 }}>
                  <Box
                    component="img" src={item.images?.[0] || '/placeholder.png'} alt={item.name}
                    sx={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 1.5, flexShrink: 0, filter: 'grayscale(0.5)' }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>{item.name}</Typography>
                    {item.unit && <Typography variant="caption" color="text.secondary">{item.unit}</Typography>}
                    <Chip
                      label="Not available here" size="small"
                      sx={{
                        mt: 0.3, fontSize: '0.62rem', height: 18,
                        background: `${ZAP_COLORS.error || '#EF4444'}15`,
                        color: ZAP_COLORS.error || '#EF4444',
                        border: `1px solid ${ZAP_COLORS.error || '#EF4444'}30`,
                      }}
                    />
                  </Box>
                  <IconButton size="small" onClick={() => removeFromCart(item.id)} sx={{ color: ZAP_COLORS.error || '#EF4444' }}>
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            ))}
          </Paper>
        )}

        <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
          {/* Available items */}
          <Box sx={{ flex: 1 }}>
            {(savings + discount) > 0 && (
              <Alert icon="🎉" severity="success" sx={{ mb: 2, borderRadius: 2 }}>
                You're saving <strong>₹{savings + discount}</strong> on this order!
              </Alert>
            )}

            {subtotal < FREE_DELIVERY_ABOVE && availableItems.length > 0 && (
              <Box sx={{
                mb: 2, p: 1.5, borderRadius: 2,
                background: `${ZAP_COLORS.primary}10`, border: `1px solid ${ZAP_COLORS.primary}20`,
              }}>
                <Typography variant="caption" sx={{ color: ZAP_COLORS.primary, fontWeight: 600 }}>
                  Add ₹{FREE_DELIVERY_ABOVE - subtotal} more for FREE delivery!
                </Typography>
                <Box sx={{ mt: 0.8, height: 4, borderRadius: 4, background: `${ZAP_COLORS.primary}20`, overflow: 'hidden' }}>
                  <Box sx={{
                    height: '100%',
                    width: `${Math.min((subtotal / FREE_DELIVERY_ABOVE) * 100, 100)}%`,
                    background: ZAP_COLORS.primary, borderRadius: 4, transition: 'width 0.4s',
                  }} />
                </Box>
              </Box>
            )}

            {availableItems.length === 0 ? (
              <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  None of your items are available at <strong>{activeUserStore?.name}</strong>.
                  Remove unavailable items above or change your delivery location.
                </Typography>
              </Paper>
            ) : (
              <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, overflow: 'hidden' }}>
                {availableItems.map((item, index) => (
                  <Box key={item.id}>
                    {index > 0 && <Divider />}
                    <Box sx={{ display: 'flex', gap: 1.5, p: 2, alignItems: 'center' }}>
                      <Box
                        component="img" src={item.images?.[0] || '/placeholder.png'} alt={item.name}
                        sx={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{item.name}</Typography>
                        {item.unit && <Typography variant="caption" color="text.secondary">{item.unit}</Typography>}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                          <Typography variant="body2" fontWeight={700} color="primary">
                            ₹{item.discountedPrice || item.mrp}
                          </Typography>
                          {item.discountedPrice && item.discountedPrice < item.mrp && (
                            <Typography variant="caption" sx={{ textDecoration: 'line-through', color: 'text.secondary' }}>
                              ₹{item.mrp}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <IconButton
                          size="small"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          sx={{ border: `1px solid ${ZAP_COLORS.border}`, width: 28, height: 28 }}
                        >
                          {item.quantity === 1
                            ? <Delete fontSize="small" sx={{ color: ZAP_COLORS.error, fontSize: 14 }} />
                            : <Remove fontSize="small" sx={{ fontSize: 14 }} />}
                        </IconButton>
                        <Typography variant="body2" fontWeight={700} sx={{ minWidth: 24, textAlign: 'center' }}>
                          {item.quantity}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          sx={{
                            border: `1px solid ${ZAP_COLORS.border}`,
                            background: ZAP_COLORS.primary, width: 28, height: 28,
                            '&:hover': { background: ZAP_COLORS.primary },
                          }}
                        >
                          <Add fontSize="small" sx={{ color: '#fff', fontSize: 14 }} />
                        </IconButton>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Paper>
            )}
          </Box>

          {/* Order Summary */}
          <Box sx={{ width: { xs: '100%', md: 340 }, flexShrink: 0 }}>
            <Paper elevation={0} sx={{
              border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5,
              position: { md: 'sticky' }, top: { md: 80 },
            }}>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>Order Summary</Typography>

              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  size="small" placeholder="Coupon code"
                  value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleCoupon()}
                  sx={{ flex: 1 }} disabled={!!coupon}
                />
                {coupon ? (
                  <Button size="small" variant="outlined" color="error" onClick={() => setCoupon(null)}>Remove</Button>
                ) : (
                  <Button size="small" variant="outlined" onClick={handleCoupon} disabled={couponLoading || !couponInput}>
                    {couponLoading ? <CircularProgress size={14} /> : 'Apply'}
                  </Button>
                )}
              </Box>
              {couponError && <Typography variant="caption" color="error" display="block" mb={1}>{couponError}</Typography>}
              {coupon && (
                <Alert severity="success" sx={{ mb: 2, py: 0.5, borderRadius: 2, fontSize: '0.8rem' }}>
                  🎉 "{coupon.code}" applied!
                </Alert>
              )}

              <Divider sx={{ mb: 2 }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">MRP Total</Typography>
                  <Typography variant="body2">₹{mrpTotal}</Typography>
                </Box>
                {savings > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="success.main">Product Savings</Typography>
                    <Typography variant="body2" color="success.main">-₹{savings}</Typography>
                  </Box>
                )}
                {discount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="success.main">Coupon Discount</Typography>
                    <Typography variant="body2" color="success.main">-₹{discount}</Typography>
                  </Box>
                )}
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Delivery</Typography>
                  <Typography variant="body2" color={deliveryCharge === 0 ? 'success.main' : 'text.primary'}>
                    {deliveryCharge === 0 ? 'FREE' : `₹${deliveryCharge}`}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2.5 }}>
                <Typography fontWeight={700}>Total</Typography>
                <Typography fontWeight={800} fontSize="1.2rem" color="primary">₹{total}</Typography>
              </Box>

              {unavailableItems.length > 0 ? (
                <Box>
                  <Button fullWidth variant="contained" size="large" startIcon={<ShoppingBag />} disabled sx={{ mb: 1.5 }}>
                    Proceed to Checkout
                  </Button>
                  <Alert severity="warning" sx={{ borderRadius: 2, fontSize: '0.75rem', py: 0.5 }}>
                    Remove the <strong>{unavailableItems.length} unavailable
                    item{unavailableItems.length !== 1 ? 's' : ''}</strong> above to continue.
                  </Alert>
                </Box>
              ) : availableItems.length === 0 ? (
                <Button fullWidth variant="outlined" size="large" onClick={() => navigate('/')}>
                  Browse Products
                </Button>
              ) : (
                <Button
                  fullWidth variant="contained" size="large" startIcon={<ShoppingBag />}
                  onClick={() => {
                    if (!user) navigate('/login', { state: { from: { pathname: '/checkout' } } });
                    else navigate('/checkout');
                  }}
                >
                  Proceed to Checkout
                </Button>
              )}

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