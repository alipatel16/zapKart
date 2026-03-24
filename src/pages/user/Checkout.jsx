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
  if (!store) return true;                  // no store context yet — don't filter
  if (!addr.lat || !addr.lng) return true;  // no coords — can't validate, keep it
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
      isAddressServiceable(addr, activeUserStore, SERVICE_RADIUS_KM)
    );
  }, [userProfile?.addresses, activeUserStore?.id, SERVICE_RADIUS_KM]);

  const nonServiceableAddresses = useMemo(() => {
    if (!userProfile?.addresses?.length) return [];
    return userProfile.addresses.filter((addr) =>
      !isAddressServiceable(addr, activeUserStore, SERVICE_RADIUS_KM)
    );
  }, [userProfile?.addresses, activeUserStore?.id, SERVICE_RADIUS_KM]);

  // ── Auto-select first serviceable address on load / store change ─────────
  useEffect(() => {
    if (!serviceableAddresses.length) { setSelectedAddress(''); return; }
    // Keep current selection if it's still serviceable
    const stillValid = serviceableAddresses.find((a) => a.id === selectedAddress);
    if (!stillValid) setSelectedAddress(serviceableAddresses[0].id);
  }, [serviceableAddresses]);   // eslint-disable-line react-hooks/exhaustive-deps

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

    // ✅ COD ABUSE FIX: Block users with 2+ active unpaid COD orders.
    // The Cloud Function enforces this server-side too — this check just gives
    // the user a clear message before the order is even written to Firestore.
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
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
            <Button size="small" variant="outlined" startIcon={<Phone />} component="a" href="tel:+919876543210">
              Call Us
            </Button>
            <Button size="small" variant="outlined" startIcon={<HeadsetMic />}
              component="a" href="https://wa.me/919876543210" target="_blank">
              WhatsApp
            </Button>
          </Box>
        </Box>
      </Container>
    );
  }

  return (
    <Box sx={{ pb: { xs: 13, md: 3 }, pt: 1 }}>
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, px: { xs: 1, sm: 0 } }}>
          <IconButton onClick={() => navigate(-1)} size="small"><ArrowBack /></IconButton>
          <Typography variant="h6" fontWeight={700}>Checkout</Typography>
        </Box>

        {/* Cart unavailable items warning */}
        {hasUnavailable && (
          <Alert
            severity="warning" sx={{ mb: 2, borderRadius: 2 }}
            action={
              <Button size="small" color="warning" onClick={() => navigate('/cart')}>
                Go to Cart
              </Button>
            }
          >
            <Typography variant="body2" fontWeight={700} mb={0.2}>Cart has unavailable items</Typography>
            <Typography variant="caption">
              {unavailableCartItems.map((i) => i.unit ? `${i.name} (${i.unit})` : i.name).join(', ')} not
              available at <strong>{activeUserStore?.name}</strong>. Remove them to proceed.
            </Typography>
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
          {/* ── Left column ────────────────────────────────────────────────── */}
          <Box sx={{ flex: 1 }}>

            {/* ── Delivery Address ─────────────────────────────────────────── */}
            <Paper
              ref={addressRef}
              elevation={0}
              sx={{
                border: `1.5px solid ${addressMissing ? ZAP_COLORS.error || '#EF4444' : ZAP_COLORS.border}`,
                borderRadius: 3, p: 2.5, mb: 2,
                animation: addressShake ? 'zapShake 0.6s ease' : 'none',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <LocationOn fontSize="small" sx={{ color: ZAP_COLORS.primary }} /> Delivery Address
                </Typography>
                <Button size="small" startIcon={<Add />} onClick={() => navigate('/add-address?from=checkout')}>
                  Add New
                </Button>
              </Box>

              {/* Delivering from chip */}
              {activeUserStore && (
                <Box sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.6,
                  px: 1.2, py: 0.4, borderRadius: 10, mb: 1.5,
                  background: `${ZAP_COLORS.primary}10`,
                  border: `1px solid ${ZAP_COLORS.primary}25`,
                }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: ZAP_COLORS.primary, flexShrink: 0 }} />
                  <Typography variant="caption" sx={{ color: ZAP_COLORS.primary, fontWeight: 600 }}>
                    Delivering from {activeUserStore.name}
                  </Typography>
                </Box>
              )}

              {/* ── Case 1: No addresses at all ── */}
              {!userProfile?.addresses?.length && (
                <Box sx={{ textAlign: 'center', py: 2.5 }}>
                  <Typography variant="body2" color="text.secondary" mb={1.5}>
                    No saved addresses. Add one to continue.
                  </Typography>
                  <Button variant="outlined" size="small" startIcon={<Add />}
                    onClick={() => navigate('/add-address?from=checkout')}>
                    Add Address
                  </Button>
                </Box>
              )}

              {/* ── Case 2: Addresses exist but none serviceable by active store ── */}
              {userProfile?.addresses?.length > 0 && serviceableAddresses.length === 0 && (
                <Box sx={{
                  p: 2, borderRadius: 2, textAlign: 'center',
                  background: `${ZAP_COLORS.warning || '#F59E0B'}08`,
                  border: `1px solid ${ZAP_COLORS.warning || '#F59E0B'}30`,
                }}>
                  <Typography variant="body2" fontWeight={600} mb={0.5}>
                    None of your saved addresses are in {activeUserStore?.name}'s delivery area
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
                    Change your delivery location from the header 📍 to match one of your saved addresses, or add a new address within this store's area.
                  </Typography>
                  <Button variant="outlined" size="small" startIcon={<Add />}
                    onClick={() => navigate('/add-address?from=checkout')}>
                    Add New Address
                  </Button>
                </Box>
              )}

              {/* ── Case 3: Show serviceable addresses as selectable list ── */}
              {serviceableAddresses.length > 0 && (
                <RadioGroup
                  value={selectedAddress}
                  onChange={(e) => setSelectedAddress(e.target.value)}
                >
                  {serviceableAddresses.map((addr) => {
                    const isSelected = selectedAddress === addr.id;
                    const noCoords   = !addr.lat || !addr.lng;

                    return (
                      <Paper
                        key={addr.id}
                        elevation={0}
                        onClick={() => setSelectedAddress(addr.id)}
                        sx={{
                          border: `1.5px solid ${isSelected ? ZAP_COLORS.primary : ZAP_COLORS.border}`,
                          borderRadius: 2, p: 1.5, mb: 1, cursor: 'pointer',
                          background: isSelected ? `${ZAP_COLORS.primary}06` : 'transparent',
                          transition: 'all 0.15s',
                          '&:hover': !isSelected ? { borderColor: `${ZAP_COLORS.primary}60` } : {},
                        }}
                      >
                        <FormControlLabel
                          value={addr.id}
                          control={<Radio size="small" sx={{ color: ZAP_COLORS.primary }} />}
                          label={
                            <Box sx={{ width: '100%' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                <Typography variant="body2" fontWeight={600}>
                                  {addr.name} — {addr.phone}
                                </Typography>
                                {noCoords && (
                                  <Chip
                                    label="Location unverified"
                                    size="small"
                                    sx={{
                                      fontSize: '0.62rem', height: 18,
                                      background: `${ZAP_COLORS.warning || '#F59E0B'}15`,
                                      color: ZAP_COLORS.warning || '#F59E0B',
                                      border: `1px solid ${ZAP_COLORS.warning || '#F59E0B'}30`,
                                    }}
                                  />
                                )}
                              </Box>
                              <Typography variant="caption" color="text.secondary">
                                {addr.label && <><strong>{addr.label}</strong> · </>}
                                {addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}, {addr.city}
                                {addr.state ? `, ${addr.state}` : ''} — {addr.pincode}
                              </Typography>
                            </Box>
                          }
                          sx={{ m: 0, width: '100%', alignItems: 'flex-start' }}
                        />
                      </Paper>
                    );
                  })}
                </RadioGroup>
              )}

              {/* Hint: some addresses filtered out */}
              {nonServiceableAddresses.length > 0 && serviceableAddresses.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {nonServiceableAddresses.length} saved address{nonServiceableAddresses.length > 1 ? 'es are' : ' is'} in
                  a different delivery area and not shown. Change your store from the header 📍 to use them.
                </Typography>
              )}
            </Paper>

            {/* ── Payment Method ─────────────────────────────────────────── */}
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
                        <Typography variant="caption" color="text.secondary">UPI, cards, netbanking via Razorpay</Typography>
                      </Box>
                    }
                    sx={{ m: 0 }} />
                </Paper>
              </RadioGroup>
            </Paper>
          </Box>

          {/* ── Order Summary ──────────────────────────────────────────────── */}
          <Box sx={{ width: { xs: '100%', md: 320 }, flexShrink: 0 }}>
            <Paper elevation={0} sx={{
              border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5,
              position: { md: 'sticky' }, top: { md: 80 },
            }}>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>Order Summary</Typography>

              {availableCartItems.map((item) => (
                <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Box sx={{ flex: 1, pr: 1 }}>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {item.name} × {item.quantity}
                    </Typography>
                    {item.unit && (
                      <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.7 }}>
                        {item.unit}
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="body2" fontWeight={500}>₹{item.mrp * item.quantity}</Typography>
                </Box>
              ))}

              <Divider sx={{ my: 1.5 }} />

              {(() => {
                const mrpTotal    = availableCartItems.reduce((s, i) => s + i.mrp * i.quantity, 0);
                const savedAmount = availableCartItems.reduce(
                  (s, i) => s + ((i.mrp - (i.discountedPrice || i.mrp)) * i.quantity), 0
                );
                return (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2" color="text.secondary">MRP Total</Typography>
                      <Typography variant="body2" fontWeight={500}>₹{mrpTotal}</Typography>
                    </Box>
                    {savedAmount > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2" color="text.secondary">Product Savings</Typography>
                        <Typography variant="body2" fontWeight={600} color="success.main">-₹{savedAmount}</Typography>
                      </Box>
                    )}
                    {coupon && discount > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="body2" color="text.secondary">Coupon</Typography>
                          <Chip label={coupon.code} size="small" color="success" sx={{ fontSize: '0.7rem', height: 20 }} />
                        </Box>
                        <Typography variant="body2" fontWeight={600} color="success.main">-₹{discount}</Typography>
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
                  : paymentMethod === 'cod' ? 'Place Order' : `Pay ₹${total}`}
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