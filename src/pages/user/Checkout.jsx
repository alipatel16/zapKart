import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Typography, Button, Paper, Radio, RadioGroup,
  FormControlLabel, CircularProgress, Divider, Chip,
  IconButton, Alert, Collapse,
} from '@mui/material';
import { Add, ArrowBack, CheckCircle, Phone, HeadsetMic, LocationOn, ErrorOutline } from '@mui/icons-material';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useStore } from '../../context/StoreContext';
import { initiateRazorpayPayment } from '../../utils/helpers';
import { ZAP_COLORS } from '../../theme';

/* Shake keyframes injected once */
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

  // Address-section error highlight
  const [addressShake, setAddressShake] = useState(false);
  const [addressMissing, setAddressMissing] = useState(false);
  const addressRef = useRef(null);

  const address = userProfile?.addresses?.find((a) => a.id === selectedAddress);

  // ── Inject shake CSS once ─────────────────────────────────────────────────
  React.useEffect(() => {
    if (!document.getElementById('zap-shake-style')) {
      const style = document.createElement('style');
      style.id = 'zap-shake-style';
      style.textContent = SHAKE_STYLE;
      document.head.appendChild(style);
    }
  }, []);

  // ── Highlight address section with shake ──────────────────────────────────
  const highlightAddressSection = () => {
    setAddressMissing(true);
    setAddressShake(true);
    addressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setAddressShake(false), 700);
  };

  // ── Place order ───────────────────────────────────────────────────────────
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
        userId: user.uid,
        storeId: activeUserStore?.id || null,
        storeName: activeUserStore?.name || null,
        customerName: userProfile?.displayName || user.displayName || '',
        customerEmail: user.email,
        customerPhone: address.phone || userProfile?.phone || '',
        items: items.map((i) => ({
          id: i.id, name: i.name, quantity: i.quantity,
          mrp: i.mrp, discountedPrice: i.discountedPrice || i.mrp,
          images: i.images || [],
        })),
        address,
        subtotal,
        discount: discount || 0,
        couponCode: coupon?.code || null,
        deliveryCharge,
        total,
        paymentMethod,
        paymentStatus: paymentInfo ? 'paid' : 'pending',
        paymentInfo: paymentInfo || null,
        status: 'placed',
        statusHistory: [{ status: 'placed', timestamp: new Date() }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, COLLECTIONS.ORDERS), orderData);
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
          name: userProfile?.displayName || user.displayName || '',
          email: user.email,
          phone: address.phone || userProfile?.phone || '',
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

  // ── Order success screen ──────────────────────────────────────────────────
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
              component="a" href="tel:+919876543210"
              sx={{ borderRadius: 10, fontSize: '0.8rem' }}>
              Call Support
            </Button>
            <Button variant="outlined" size="small" startIcon={<HeadsetMic />}
              onClick={() => navigate('/help')}
              sx={{ borderRadius: 10, fontSize: '0.8rem' }}>
              Help Center
            </Button>
          </Box>
        </Box>
      </Container>
    );
  }

  // ── Empty cart guard ──────────────────────────────────────────────────────
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
        {/* Page title */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, px: { xs: 1, sm: 0 } }}>
          <IconButton onClick={() => navigate('/cart')} size="small"><ArrowBack /></IconButton>
          <Typography variant="h6" fontWeight={700}>Checkout</Typography>
        </Box>

        {/* General error */}
        <Collapse in={!!error}>
          <Alert
            severity="error"
            icon={<ErrorOutline />}
            sx={{ mb: 2, borderRadius: 2 }}
            onClose={() => setError('')}
          >
            {error}
          </Alert>
        </Collapse>

        <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
          <Box sx={{ flex: 1 }}>

            {/* ── Address section ── */}
            <Paper
              ref={addressRef}
              elevation={0}
              sx={{
                border: `1.5px solid ${addressMissing && !address
                  ? ZAP_COLORS.error || '#EF4444'
                  : ZAP_COLORS.border}`,
                borderRadius: 3, p: 2.5, mb: 2,
                animation: addressShake ? 'zapShake 0.6s ease' : 'none',
                transition: 'border-color 0.3s',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" fontWeight={700} fontSize="1rem">
                  📍 Delivery Address
                </Typography>
                {(userProfile?.addresses?.length || 0) < 5 && (
                  <Button
                    size="small" startIcon={<Add />}
                    onClick={() => navigate('/add-address?from=checkout')}
                  >
                    Add New
                  </Button>
                )}
              </Box>

              {/* No addresses yet */}
              {!userProfile?.addresses?.length ? (
                <Box
                  onClick={() => navigate('/add-address?from=checkout')}
                  sx={{
                    py: 3, textAlign: 'center', cursor: 'pointer',
                    border: `2px dashed ${addressMissing ? ZAP_COLORS.error || '#EF4444' : ZAP_COLORS.border}`,
                    borderRadius: 2.5,
                    '&:hover': { borderColor: ZAP_COLORS.primary, background: `${ZAP_COLORS.primary}05` },
                    transition: 'all 0.2s',
                  }}
                >
                  <LocationOn sx={{ fontSize: 32, color: addressMissing ? ZAP_COLORS.error || '#EF4444' : ZAP_COLORS.textMuted, mb: 0.5 }} />
                  <Typography variant="body2" fontWeight={600} color={addressMissing ? 'error' : 'text.primary'}>
                    Add a delivery address
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Tap to pick your location on the map
                  </Typography>
                </Box>
              ) : (
                // Address list
                <RadioGroup
                  value={selectedAddress}
                  onChange={(e) => {
                    setSelectedAddress(e.target.value);
                    setAddressMissing(false);
                  }}
                >
                  {userProfile.addresses.map((addr) => (
                    <Box
                      key={addr.id}
                      sx={{
                        border: `1.5px solid ${selectedAddress === addr.id ? ZAP_COLORS.primary : ZAP_COLORS.border}`,
                        borderRadius: 2.5, p: 1.5, mb: 1.2,
                        background: selectedAddress === addr.id ? `${ZAP_COLORS.primary}06` : 'transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onClick={() => {
                        setSelectedAddress(addr.id);
                        setAddressMissing(false);
                      }}
                    >
                      <FormControlLabel
                        value={addr.id}
                        control={<Radio size="small" />}
                        label={
                          <Box>
                            <Box sx={{ display: 'flex', gap: 0.8, alignItems: 'center', mb: 0.3 }}>
                              <Chip label={addr.label} size="small" color="primary" sx={{ height: 18, fontSize: '0.65rem' }} />
                              <Typography variant="body2" fontWeight={700}>{addr.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{addr.phone}</Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                              {addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}, {addr.city}
                              {addr.state ? `, ${addr.state}` : ''}
                              {addr.pincode ? ` - ${addr.pincode}` : ''}
                            </Typography>
                          </Box>
                        }
                        sx={{ mx: 0, width: '100%', alignItems: 'flex-start' }}
                      />
                    </Box>
                  ))}
                </RadioGroup>
              )}

              {/* Inline error hint */}
              {addressMissing && !address && (
                <Typography
                  variant="caption"
                  sx={{ color: ZAP_COLORS.error || '#EF4444', fontWeight: 600, display: 'block', mt: 0.5 }}
                >
                  ↑ Please add or select a delivery address
                </Typography>
              )}
            </Paper>

            {/* ── Payment method ── */}
            <Paper
              elevation={0}
              sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5, mb: 2 }}
            >
              <Typography variant="h6" fontWeight={700} fontSize="1rem" mb={1.5}>
                💳 Payment Method
              </Typography>
              <RadioGroup value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <FormControlLabel
                  value="cod"
                  control={<Radio size="small" />}
                  label={<Typography variant="body2" fontWeight={500}>Cash on Delivery</Typography>}
                />
                <FormControlLabel
                  value="razorpay"
                  control={<Radio size="small" />}
                  label={<Typography variant="body2" fontWeight={500}>Pay Online (UPI / Card / Net Banking)</Typography>}
                />
              </RadioGroup>
            </Paper>
          </Box>

          {/* ── Order summary ── */}
          <Box sx={{ width: { md: 340 }, flexShrink: 0 }}>
            <Paper
              elevation={0}
              sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5, position: 'sticky', top: 80 }}
            >
              <Typography variant="h6" fontWeight={700} fontSize="1rem" mb={2}>🧾 Order Summary</Typography>

              {/* Items */}
              {items.map((item) => (
                <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1, mr: 1 }}>
                    {item.name}
                    <Typography component="span" variant="caption" color="text.secondary"> ×{item.quantity}</Typography>
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    ₹{((item.discountedPrice || item.mrp) * item.quantity).toFixed(0)}
                  </Typography>
                </Box>
              ))}

              <Divider sx={{ my: 1.5 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.8 }}>
                <Typography variant="body2" color="text.secondary">Subtotal</Typography>
                <Typography variant="body2">₹{subtotal.toFixed(0)}</Typography>
              </Box>
              {discount > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.8 }}>
                  <Typography variant="body2" color="text.secondary">Coupon Discount</Typography>
                  <Typography variant="body2" sx={{ color: ZAP_COLORS.accentGreen || '#06D6A0' }}>
                    −₹{discount.toFixed(0)}
                  </Typography>
                </Box>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.8 }}>
                <Typography variant="body2" color="text.secondary">Delivery</Typography>
                <Typography variant="body2">
                  {deliveryCharge === 0 ? (
                    <Typography component="span" sx={{ color: ZAP_COLORS.accentGreen || '#06D6A0', fontSize: '0.85rem', fontWeight: 600 }}>
                      FREE
                    </Typography>
                  ) : `₹${deliveryCharge}`}
                </Typography>
              </Box>

              <Divider sx={{ my: 1.5 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography fontWeight={700}>Total</Typography>
                <Typography fontWeight={700} fontSize="1.1rem">₹{total.toFixed(0)}</Typography>
              </Box>

              <Button
                fullWidth
                variant="contained"
                size="large"
                onClick={handleCheckout}
                disabled={loading}
                sx={{ borderRadius: 3, py: 1.5, fontWeight: 700 }}
              >
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