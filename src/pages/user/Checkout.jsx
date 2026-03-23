// ============================================================
// src/pages/user/Checkout.jsx
// ============================================================
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Typography, Button, Paper, Radio, RadioGroup,
  FormControlLabel, CircularProgress, Divider, Chip,
  IconButton, Alert, Collapse,
} from '@mui/material';
import { Add, ArrowBack, CheckCircle, Phone, HeadsetMic, LocationOn, ErrorOutline } from '@mui/icons-material';
// ✅ Removed: doc, getDoc, updateDoc — no longer doing client-side stock deduction.
// Stock is now managed exclusively by the validateAndProcessOrder Cloud Function.
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useStore } from '../../context/StoreContext';
import { initiateRazorpayPayment } from '../../utils/helpers';
import { ZAP_COLORS } from '../../theme';

const SHAKE_STYLE = `
@keyframes zapShake {
  0%,100% { transform: translateX(0); }
  15%      { transform: translateX(-8px); }
  30%      { transform: translateX(8px); }
  45%      { transform: translateX(-6px); }
  60%      { transform: translateX(6px); }
  75%      { transform: translateX(-3px); }
  90%      { transform: translateX(3px); }
}
`;

const Checkout = () => {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const { activeUserStore } = useStore();
  const { items, coupon, subtotal, discount, deliveryCharge, total, clearCart } = useCart();

  const [selectedAddress, setSelectedAddress] = useState(userProfile?.addresses?.[0]?.id || '');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [loading, setLoading] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(null);
  const [error, setError] = useState('');
  const [addressShake, setAddressShake] = useState(false);
  const [addressMissing, setAddressMissing] = useState(false);
  const addressRef = useRef(null);

  const address = userProfile?.addresses?.find((a) => a.id === selectedAddress);

  React.useEffect(() => {
    if (!document.getElementById('zap-shake-style')) {
      const style = document.createElement('style');
      style.id = 'zap-shake-style';
      style.textContent = SHAKE_STYLE;
      document.head.appendChild(style);
    }
  }, []);

  const highlightAddressSection = () => {
    setAddressMissing(true);
    setAddressShake(true);
    addressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setAddressShake(false), 700);
  };

  const placeOrder = async (paymentInfo = null) => {
    if (!address) {
      setError('Please select or add a delivery address to continue.');
      highlightAddressSection();
      return;
    }
    setLoading(true);
    setError('');
    setAddressMissing(false);
    try {
      const orderNumber = 'ZAP' + Date.now().toString().slice(-8);
      const orderData = {
        orderNumber,
        userId:        user.uid,
        storeId:       activeUserStore?.id   || null,
        storeName:     activeUserStore?.name || null,
        customerName:  userProfile?.displayName || user.displayName || '',
        customerEmail: user.email,
        customerPhone: address.phone || userProfile?.phone || '',
        items: items.map((i) => ({
          id:             i.id,
          name:           i.name,
          quantity:       i.quantity,
          mrp:            i.mrp,
          discountedPrice: i.discountedPrice || i.mrp,
          images:         i.images || [],
        })),
        address,
        subtotal,
        discount:      discount || 0,
        couponCode:    coupon?.code || null,
        deliveryCharge,
        total,
        paymentMethod,
        paymentStatus: paymentInfo ? 'paid' : 'pending',
        paymentInfo:   paymentInfo || null,
        status:        'placed',
        statusHistory: [{ status: 'placed', timestamp: new Date() }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const ref = await addDoc(collection(db, COLLECTIONS.ORDERS), orderData);

      // ✅ Stock deduction removed from client.
      // The validateAndProcessOrder Cloud Function triggers automatically
      // on order creation, re-validates the total server-side, and deducts
      // stock via a server-side batch write. No client-side stock updates needed.

      clearCart();
      setOrderPlaced({ ...orderData, id: ref.id });
    } catch (err) {
      setError('Failed to place order. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (!address) {
      setError('Please select or add a delivery address to continue.');
      highlightAddressSection();
      return;
    }
    if (paymentMethod === 'razorpay') {
      try {
        const paymentInfo = await initiateRazorpayPayment({
          amount: total,
          name:   userProfile?.displayName || user.displayName || '',
          email:  user.email,
          phone:  address.phone || userProfile?.phone || '',
        });
        await placeOrder(paymentInfo);
      } catch (err) {
        if (err.message !== 'Payment cancelled') {
          setError(err.message || 'Payment failed. Please try again.');
        }
      }
    } else {
      await placeOrder();
    }
  };

  if (orderPlaced) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <CheckCircle sx={{ fontSize: 72, color: ZAP_COLORS.accentGreen || '#06D6A0', mb: 2 }} />
        <Typography variant="h5" fontWeight={800} fontFamily="'Syne', sans-serif" mb={0.5}>
          Order Placed! 🎉
        </Typography>
        <Typography color="text.secondary" mb={0.5}>
          Your order <strong>#{orderPlaced.orderNumber}</strong> has been placed successfully.
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={4}>
          {paymentMethod === 'cod'
            ? 'Please keep cash ready at the time of delivery.'
            : 'Payment confirmed!'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="contained" onClick={() => navigate('/orders')}>Track Order</Button>
          <Button variant="outlined" onClick={() => navigate('/')}>Continue Shopping</Button>
        </Box>
        <Box sx={{ mt: 3, pt: 3, borderTop: `1px solid ${ZAP_COLORS.border}` }}>
          <Typography variant="caption" color="text.secondary" display="block" mb={1.5} textAlign="center">
            Need help with your order?
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button variant="outlined" size="small" startIcon={<Phone />}
              component="a" href="tel:+919876543210" sx={{ borderRadius: 10, fontSize: '0.8rem' }}>
              Call Support
            </Button>
            <Button variant="outlined" size="small" startIcon={<HeadsetMic />}
              onClick={() => navigate('/help')} sx={{ borderRadius: 10, fontSize: '0.8rem' }}>
              Help Center
            </Button>
          </Box>
        </Box>
      </Container>
    );
  }

  if (!items.length) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <Typography variant="h6" mb={2}>Your cart is empty</Typography>
        <Button variant="contained" onClick={() => navigate('/')}>Shop Now</Button>
      </Container>
    );
  }

  return (
    <Box sx={{ pb: { xs: 13, md: 3 }, pt: 1 }}>
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, px: { xs: 1, sm: 0 } }}>
          <IconButton onClick={() => navigate('/cart')} size="small"><ArrowBack /></IconButton>
          <Typography variant="h6" fontWeight={700}>Checkout</Typography>
        </Box>

        <Collapse in={!!error}>
          <Alert severity="error" icon={<ErrorOutline />} sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        </Collapse>

        <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
          {/* ── Address ── */}
          <Box sx={{ flex: 1 }}>
            <Paper
              ref={addressRef}
              elevation={0}
              sx={{
                border: `1.5px solid ${addressMissing && !address ? ZAP_COLORS.error || '#EF4444' : ZAP_COLORS.border}`,
                borderRadius: 3, p: 2.5, mb: 2,
                animation: addressShake ? 'zapShake 0.6s ease' : 'none',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <LocationOn fontSize="small" sx={{ color: ZAP_COLORS.primary }} /> Delivery Address
                </Typography>
                <Button size="small" startIcon={<Add />} onClick={() => navigate('/add-address?from=checkout')}>
                  Add New
                </Button>
              </Box>

              {!userProfile?.addresses?.length ? (
                <Box sx={{ textAlign: 'center', py: 2 }}>
                  <Typography variant="body2" color="text.secondary" mb={1.5}>No saved addresses</Typography>
                  <Button variant="outlined" size="small" startIcon={<Add />}
                    onClick={() => navigate('/add-address?from=checkout')}>
                    Add Address
                  </Button>
                </Box>
              ) : (
                <RadioGroup value={selectedAddress} onChange={(e) => setSelectedAddress(e.target.value)}>
                  {userProfile.addresses.map((addr) => (
                    <Paper
                      key={addr.id}
                      elevation={0}
                      onClick={() => setSelectedAddress(addr.id)}
                      sx={{
                        border: `1.5px solid ${selectedAddress === addr.id ? ZAP_COLORS.primary : ZAP_COLORS.border}`,
                        borderRadius: 2, p: 1.5, mb: 1, cursor: 'pointer',
                        background: selectedAddress === addr.id ? `${ZAP_COLORS.primary}06` : 'transparent',
                      }}
                    >
                      <FormControlLabel
                        value={addr.id}
                        control={<Radio size="small" sx={{ color: ZAP_COLORS.primary }} />}
                        label={
                          <Box>
                            <Typography variant="body2" fontWeight={600}>{addr.name} — {addr.phone}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}, {addr.city}
                              {addr.state ? `, ${addr.state}` : ''} — {addr.pincode}
                            </Typography>
                          </Box>
                        }
                        sx={{ m: 0, width: '100%' }}
                      />
                    </Paper>
                  ))}
                </RadioGroup>
              )}
            </Paper>

            {/* ── Payment Method ── */}
            <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5 }}>
              <Typography variant="subtitle1" fontWeight={700} mb={1.5}>Payment Method</Typography>
              <RadioGroup value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <Paper elevation={0} onClick={() => setPaymentMethod('cod')} sx={{
                  border: `1.5px solid ${paymentMethod === 'cod' ? ZAP_COLORS.primary : ZAP_COLORS.border}`,
                  borderRadius: 2, p: 1.5, mb: 1, cursor: 'pointer',
                  background: paymentMethod === 'cod' ? `${ZAP_COLORS.primary}06` : 'transparent',
                }}>
                  <FormControlLabel value="cod" control={<Radio size="small" />}
                    label={<Box><Typography variant="body2" fontWeight={600}>Cash on Delivery</Typography>
                    <Typography variant="caption" color="text.secondary">Pay when your order arrives</Typography></Box>}
                    sx={{ m: 0 }} />
                </Paper>
                <Paper elevation={0} onClick={() => setPaymentMethod('razorpay')} sx={{
                  border: `1.5px solid ${paymentMethod === 'razorpay' ? ZAP_COLORS.primary : ZAP_COLORS.border}`,
                  borderRadius: 2, p: 1.5, cursor: 'pointer',
                  background: paymentMethod === 'razorpay' ? `${ZAP_COLORS.primary}06` : 'transparent',
                }}>
                  <FormControlLabel value="razorpay" control={<Radio size="small" />}
                    label={<Box><Typography variant="body2" fontWeight={600}>Pay Online</Typography>
                    <Typography variant="caption" color="text.secondary">UPI, cards, netbanking via Razorpay</Typography></Box>}
                    sx={{ m: 0 }} />
                </Paper>
              </RadioGroup>
            </Paper>
          </Box>

          {/* ── Order Summary ── */}
          <Box sx={{ width: { xs: '100%', md: 320 }, flexShrink: 0 }}>
            <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5, position: { md: 'sticky' }, top: { md: 80 } }}>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>Order Summary</Typography>

              {items.map((item) => (
                <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1, pr: 1 }} noWrap>
                    {item.name} × {item.quantity}
                  </Typography>
                  <Typography variant="body2" fontWeight={500}>
                    ₹{(item.discountedPrice || item.mrp) * item.quantity}
                  </Typography>
                </Box>
              ))}

              <Divider sx={{ my: 1.5 }} />

              {coupon && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Chip label={coupon.code} size="small" color="success" sx={{ fontSize: '0.7rem', height: 20 }} />
                  <Typography variant="body2" color="success.main" fontWeight={600}>-₹{discount}</Typography>
                </Box>
              )}

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">Delivery</Typography>
                <Typography variant="body2" fontWeight={500}
                  color={deliveryCharge === 0 ? 'success.main' : 'text.primary'}>
                  {deliveryCharge === 0
                    ? <Typography component="span" sx={{ color: ZAP_COLORS.accentGreen || '#06D6A0', fontSize: '0.85rem', fontWeight: 600 }}>FREE</Typography>
                    : `₹${deliveryCharge}`}
                </Typography>
              </Box>

              <Divider sx={{ my: 1.5 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography fontWeight={700}>Total</Typography>
                <Typography fontWeight={700} fontSize="1.1rem">₹{total.toFixed(0)}</Typography>
              </Box>

              <Button fullWidth variant="contained" size="large" onClick={handleCheckout} disabled={loading}
                sx={{ borderRadius: 3, py: 1.5, fontWeight: 700 }}>
                {loading
                  ? <CircularProgress size={22} sx={{ color: '#fff' }} />
                  : paymentMethod === 'cod' ? 'Place Order' : `Pay ₹${total}`}
              </Button>
            </Paper>
          </Box>
        </Box>
      </Container>
    </Box>
  );
};

export default Checkout;