// ============================================================
// src/pages/user/Checkout.jsx
// ============================================================
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Typography, Button, Paper, Radio, RadioGroup,
  FormControlLabel, CircularProgress, Divider, Chip, IconButton, Alert,
} from '@mui/material';
import {
  Add, ArrowBack, CheckCircle, Phone, HeadsetMic, LocationOn,
} from '@mui/icons-material';
import {
  collection, addDoc, serverTimestamp,
  getDocs, query, where,               // ← added for COD abuse check
} from 'firebase/firestore';
import { getFunctions, httpsCallable }          from 'firebase/functions';
import { db, COLLECTIONS }                       from '../../firebase';
import { useAuth }                               from '../../context/AuthContext';
import { useCart }                               from '../../context/CartContext';
import { useStore, getDistanceKm }               from '../../context/StoreContext';
import { initiateRazorpayPayment }               from '../../utils/helpers';
import { ZAP_COLORS }                            from '../../theme';

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

const generateOrderNumber = () =>
  'ZAP' + Math.random().toString(36).slice(2, 8).toUpperCase();

// ─────────────────────────────────────────────────────────────────────────────
// Returns true if a saved address falls within the active store's service area.
// Addresses without lat/lng are treated as "unverified" — shown with a badge
// but still selectable (we can't validate them).
// ─────────────────────────────────────────────────────────────────────────────
const isAddressServiceable = (addr, store, SERVICE_RADIUS_KM) => {
  if (!store) return true;
  if (!addr.lat || !addr.lng) return true;
  const radius = store.deliveryRadiusKm || SERVICE_RADIUS_KM;
  const dist   = getDistanceKm(
    parseFloat(addr.lat), parseFloat(addr.lng),
    store.lat, store.lng,
  );
  return dist <= radius;
};

// ─────────────────────────────────────────────────────────────────────────────
const Checkout = () => {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const { activeUserStore, SERVICE_RADIUS_KM } = useStore();
  const { items, coupon, subtotal, discount, deliveryCharge, total, clearCart } = useCart();

  const [selectedAddress, setSelectedAddress] = useState('');
  const [paymentMethod,   setPaymentMethod]   = useState('cod');
  const [loading,         setLoading]         = useState(false);
  const [orderPlaced,     setOrderPlaced]     = useState(null);
  const [error,           setError]           = useState('');
  const [addressShake,    setAddressShake]    = useState(false);
  const [addressMissing,  setAddressMissing]  = useState(false);
  const addressRef = useRef(null);

  // ── Items flagged unavailable by Cart.jsx reconciliation ─────────────────
  const unavailableCartItems = items.filter((i) =>  i._unavailable);
  const availableCartItems   = items.filter((i) => !i._unavailable);
  const hasUnavailable       = unavailableCartItems.length > 0;

  // ── Filter: only addresses serviceable by the current active store ────────
  const serviceableAddresses = useMemo(() => {
    if (!userProfile?.addresses?.length) return [];
    return userProfile.addresses.filter((addr) =>
      isAddressServiceable(addr, activeUserStore, SERVICE_RADIUS_KM),
    );
  }, [userProfile?.addresses, activeUserStore?.id, SERVICE_RADIUS_KM]);

  const nonServiceableAddresses = useMemo(() => {
    if (!userProfile?.addresses?.length) return [];
    return userProfile.addresses.filter((addr) =>
      !isAddressServiceable(addr, activeUserStore, SERVICE_RADIUS_KM),
    );
  }, [userProfile?.addresses, activeUserStore?.id, SERVICE_RADIUS_KM]);

  // ── Auto-select first serviceable address on load / store change ─────────
  useEffect(() => {
    if (!serviceableAddresses.length) { setSelectedAddress(''); return; }
    const stillValid = serviceableAddresses.find((a) => a.id === selectedAddress);
    if (!stillValid) setSelectedAddress(serviceableAddresses[0].id);
  }, [serviceableAddresses]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!document.getElementById('zap-shake-style')) {
      const style = document.createElement('style');
      style.id = 'zap-shake-style';
      style.textContent = SHAKE_STYLE;
      document.head.appendChild(style);
    }
  }, []);

  const address = serviceableAddresses.find((a) => a.id === selectedAddress);

  const highlightAddressSection = () => {
    setAddressMissing(true);
    setAddressShake(true);
    addressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setAddressShake(false), 700);
  };

  // ── Place order ───────────────────────────────────────────────────────────
  const placeOrder = async (razorpayResponse = null) => {
    if (!address) {
      setError('Please add or select a delivery address to continue.');
      highlightAddressSection();
      return;
    }
    if (hasUnavailable) {
      setError('Your cart has unavailable items. Please go back to Cart and remove them first.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const orderNumber = generateOrderNumber();
      const orderData = {
        orderNumber,
        userId:        user.uid,
        storeId:       activeUserStore?.id   || null,
        storeName:     activeUserStore?.name || null,
        customerName:  userProfile?.displayName || user.displayName || '',
        customerEmail: user.email,
        customerPhone: address.phone || userProfile?.phone || '',
        items: availableCartItems.map((i) => ({
          id:              i.id,
          name:            i.name,
          unit:            i.unit || '',
          quantity:        i.quantity,
          mrp:             i.mrp,
          discountedPrice: i.discountedPrice || i.mrp,
          images:          i.images || [],
        })),
        address,
        subtotal,
        discount:      discount || 0,
        couponCode:    coupon?.code || null,
        deliveryCharge,
        total,
        paymentMethod,
        paymentStatus: 'pending',
        paymentInfo:   null,
        status:        'placed',
        statusHistory: [{ status: 'placed', timestamp: new Date() }],
        createdAt:     serverTimestamp(),
        updatedAt:     serverTimestamp(),
      };

      const ref = await addDoc(collection(db, COLLECTIONS.ORDERS), orderData);

      if (razorpayResponse) {
        try {
          const functions = getFunctions();
          const verify    = httpsCallable(functions, 'verifyRazorpayPayment');
          await verify({
            razorpay_order_id:   razorpayResponse.razorpay_order_id,
            razorpay_payment_id: razorpayResponse.razorpay_payment_id,
            razorpay_signature:  razorpayResponse.razorpay_signature,
            orderId:             ref.id,
          });
        } catch (verifyErr) {
          console.error('[Razorpay] Verification failed:', verifyErr);
          setError(
            'Payment received but verification failed. Please contact support with your order number: ' +
            orderNumber,
          );
          setLoading(false);
          return;
        }
      }

      clearCart();
      setOrderPlaced({ ...orderData, id: ref.id });
    } catch (err) {
      setError('Failed to place order. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── Checkout handler ──────────────────────────────────────────────────────
  const handleCheckout = async () => {
    if (!address) {
      setError('Please add or select a delivery address to continue.');
      highlightAddressSection();
      return;
    }
    if (hasUnavailable) {
      setError('Your cart has unavailable items. Go back to Cart and remove them first.');
      return;
    }

    // ✅ COD ABUSE FIX: Prevent users from stacking more than 2 unpaid COD
    // orders. This client-side check gives a clear error immediately. The
    // Cloud Function also enforces this server-side so it can't be bypassed.
    if (paymentMethod === 'cod') {
      try {
        const activeCodSnap = await getDocs(
          query(
            collection(db, COLLECTIONS.ORDERS),
            where('userId',        '==', user.uid),
            where('paymentMethod', '==', 'cod'),
            where('paymentStatus', '==', 'pending'),
          ),
        );
        const activeCount = activeCodSnap.docs.filter((d) => {
          const s = d.data().status;
          return s !== 'cancelled' && s !== 'delivered';
        }).length;

        if (activeCount >= 2) {
          setError(
            'You already have 2 active COD orders. Please wait for them to be delivered or ' +
            'cancel them before placing a new one.',
          );
          return;
        }
      } catch (err) {
        // Non-fatal — proceed and let the Cloud Function enforce server-side.
        console.warn('[COD Check] Could not verify active COD orders:', err.message);
      }
    }

    if (paymentMethod === 'razorpay') {
      try {
        const razorpayResponse = await initiateRazorpayPayment({
          amount: total,
          name:   userProfile?.displayName || user.displayName || '',
          email:  user.email,
          phone:  address.phone || userProfile?.phone || '',
        });
        await placeOrder(razorpayResponse);
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
          <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
            <Button size="small" startIcon={<Phone />} variant="outlined" href="tel:+919999999999">
              Call Us
            </Button>
            <Button size="small" startIcon={<HeadsetMic />} variant="outlined" onClick={() => navigate('/support')}>
              Support
            </Button>
          </Box>
        </Box>
      </Container>
    );
  }

  // ── Empty cart guard ──────────────────────────────────────────────────────
  if (!items.length) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h6" mb={2}>Your cart is empty</Typography>
        <Button variant="contained" onClick={() => navigate('/')}>Browse Products</Button>
      </Container>
    );
  }

  // ── Main checkout UI ──────────────────────────────────────────────────────
  return (
    <Box sx={{ minHeight: '100vh', background: ZAP_COLORS.background || '#F9F9F9', pb: 8 }}>
      <Container maxWidth="md" sx={{ pt: 2 }}>
        {/* Back button */}
        <Box sx={{ mb: 2 }}>
          <IconButton onClick={() => navigate('/cart')}>
            <ArrowBack />
          </IconButton>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
          {/* ── Left column: address + payment ─────────────────────────────── */}
          <Box sx={{ flex: 1 }}>
            {/* Address section */}
            <Paper
              ref={addressRef}
              elevation={0}
              sx={{
                border: `1.5px solid ${addressMissing && !address ? ZAP_COLORS.primary : ZAP_COLORS.border}`,
                borderRadius: 3, p: 2.5, mb: 2,
                animation: addressShake ? 'zapShake 0.6s ease' : 'none',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Typography variant="subtitle1" fontWeight={700}>Delivery Address</Typography>
                <Button
                  size="small" startIcon={<Add />}
                  onClick={() => navigate('/profile', { state: { openAddAddress: true } })}
                  sx={{ color: ZAP_COLORS.primary }}
                >
                  Add New
                </Button>
              </Box>

              {serviceableAddresses.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 2 }}>
                  <LocationOn sx={{ color: ZAP_COLORS.textMuted, fontSize: 36, mb: 1 }} />
                  <Typography variant="body2" color="text.secondary" mb={1.5}>
                    No saved addresses for this delivery area.
                  </Typography>
                  <Button
                    variant="contained" size="small" startIcon={<Add />}
                    onClick={() => navigate('/profile', { state: { openAddAddress: true } })}
                  >
                    Add Address
                  </Button>
                </Box>
              ) : (
                <RadioGroup value={selectedAddress} onChange={(e) => setSelectedAddress(e.target.value)}>
                  {serviceableAddresses.map((addr) => (
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
                        control={<Radio size="small" />}
                        label={
                          <Box>
                            <Typography variant="body2" fontWeight={600}>{addr.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {addr.line1}
                              {addr.line2 ? `, ${addr.line2}` : ''}, {addr.city}
                              {addr.state ? `, ${addr.state}` : ''} — {addr.pincode}
                            </Typography>
                          </Box>
                        }
                        sx={{ m: 0, width: '100%', alignItems: 'flex-start' }}
                      />
                    </Paper>
                  ))}
                </RadioGroup>
              )}

              {nonServiceableAddresses.length > 0 && serviceableAddresses.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {nonServiceableAddresses.length} saved address{nonServiceableAddresses.length > 1 ? 'es are' : ' is'} in
                  a different delivery area and not shown. Change your store from the header 📍 to use them.
                </Typography>
              )}

              {nonServiceableAddresses.length > 0 && serviceableAddresses.length === 0 && activeUserStore && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  💡 Tip: Your saved addresses are near a different store. Use the 📍 location chip in
                  the header to switch stores and access them.
                </Typography>
              )}
            </Paper>

            {/* Payment method */}
            <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5 }}>
              <Typography variant="subtitle1" fontWeight={700} mb={1.5}>Payment Method</Typography>
              <RadioGroup value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <Paper elevation={0} onClick={() => setPaymentMethod('cod')} sx={{
                  border: `1.5px solid ${paymentMethod === 'cod' ? ZAP_COLORS.primary : ZAP_COLORS.border}`,
                  borderRadius: 2, p: 1.5, mb: 1, cursor: 'pointer',
                  background: paymentMethod === 'cod' ? `${ZAP_COLORS.primary}06` : 'transparent',
                }}>
                  <FormControlLabel value="cod" control={<Radio size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2" fontWeight={600}>Cash on Delivery</Typography>
                        <Typography variant="caption" color="text.secondary">Pay when your order arrives</Typography>
                      </Box>
                    }
                    sx={{ m: 0 }} />
                </Paper>
                <Paper elevation={0} onClick={() => setPaymentMethod('razorpay')} sx={{
                  border: `1.5px solid ${paymentMethod === 'razorpay' ? ZAP_COLORS.primary : ZAP_COLORS.border}`,
                  borderRadius: 2, p: 1.5, cursor: 'pointer',
                  background: paymentMethod === 'razorpay' ? `${ZAP_COLORS.primary}06` : 'transparent',
                }}>
                  <FormControlLabel value="razorpay" control={<Radio size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2" fontWeight={600}>Pay Online</Typography>
                        <Typography variant="caption" color="text.secondary">UPI, Card, Net Banking via Razorpay</Typography>
                      </Box>
                    }
                    sx={{ m: 0 }} />
                </Paper>
              </RadioGroup>
            </Paper>
          </Box>

          {/* ── Right column: order summary ─────────────────────────────────── */}
          <Box sx={{ width: { xs: '100%', md: 320 } }}>
            <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5, position: { md: 'sticky' }, top: { md: 80 } }}>
              <Typography variant="subtitle1" fontWeight={700} mb={1.5}>Order Summary</Typography>

              {/* Cart items */}
              <Box sx={{ mb: 2 }}>
                {availableCartItems.map((item) => (
                  <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                    <Typography variant="body2" sx={{ flex: 1, pr: 1 }} noWrap>
                      {item.name} {item.unit ? `(${item.unit})` : ''} × {item.quantity}
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      ₹{((item.discountedPrice || item.mrp) * item.quantity).toFixed(0)}
                    </Typography>
                  </Box>
                ))}
              </Box>

              <Divider sx={{ my: 1.5 }} />

              {/* Unavailable warning */}
              {hasUnavailable && (
                <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 2, fontSize: '0.75rem', py: 0.5 }}>
                  {unavailableCartItems.length} item{unavailableCartItems.length > 1 ? 's are' : ' is'} unavailable.
                  Go back to Cart to remove them.
                </Alert>
              )}

              {/* Price breakdown */}
              {(() => {
                const savedAmount = availableCartItems.reduce((sum, i) => {
                  if (i.discountedPrice && i.mrp > i.discountedPrice) {
                    return sum + (i.mrp - i.discountedPrice) * i.quantity;
                  }
                  return sum;
                }, 0);
                return (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2" color="text.secondary">Subtotal</Typography>
                      <Typography variant="body2" fontWeight={500}>₹{subtotal.toFixed(0)}</Typography>
                    </Box>
                    {savedAmount > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2" color="text.secondary">Product Savings</Typography>
                        <Typography variant="body2" fontWeight={600} color="success.main">-₹{savedAmount.toFixed(0)}</Typography>
                      </Box>
                    )}
                    {coupon && discount > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="body2" color="text.secondary">Coupon</Typography>
                          <Chip label={coupon.code} size="small" color="success" sx={{ fontSize: '0.7rem', height: 20 }} />
                        </Box>
                        <Typography variant="body2" fontWeight={600} color="success.main">-₹{discount.toFixed(0)}</Typography>
                      </Box>
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2" color="text.secondary">Delivery</Typography>
                      {deliveryCharge === 0
                        ? <Typography variant="body2" fontWeight={600} sx={{ color: ZAP_COLORS.accentGreen || '#06D6A0' }}>FREE</Typography>
                        : <Typography variant="body2" fontWeight={500}>₹{deliveryCharge}</Typography>}
                    </Box>
                    <Divider sx={{ my: 1.5 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                      <Typography fontWeight={700}>Total</Typography>
                      <Typography fontWeight={700} fontSize="1.1rem">₹{total.toFixed(0)}</Typography>
                    </Box>
                  </>
                );
              })()}

              <Button
                fullWidth variant="contained" size="large"
                onClick={handleCheckout}
                disabled={loading || hasUnavailable || !address || serviceableAddresses.length === 0}
                sx={{ borderRadius: 3, py: 1.5, fontWeight: 700 }}
              >
                {loading
                  ? <CircularProgress size={22} sx={{ color: '#fff' }} />
                  : paymentMethod === 'cod' ? 'Place Order' : `Pay ₹${total.toFixed(0)}`}
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

export default Checkout;