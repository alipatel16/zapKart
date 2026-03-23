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
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable }          from 'firebase/functions';
import { db, COLLECTIONS }                       from '../../firebase';
import { useAuth }                               from '../../context/AuthContext';
import { useCart }                               from '../../context/CartContext';
import { useStore }                              from '../../context/StoreContext';
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

// ✅ SECURITY FIX: Safe order number — Math.random() avoids Date.now() collisions
// (two orders placed in the same millisecond would get the same number).
// This is display-only; Firestore's auto-ID is the true unique key.
const generateOrderNumber = () =>
  'ZAP' + Math.random().toString(36).slice(2, 8).toUpperCase();

const Checkout = () => {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const { activeUserStore } = useStore();
  const { items, coupon, subtotal, discount, deliveryCharge, total, clearCart } = useCart();

  const [selectedAddress, setSelectedAddress] = useState(userProfile?.addresses?.[0]?.id || '');
  const [paymentMethod, setPaymentMethod]     = useState('cod');
  const [loading, setLoading]                 = useState(false);
  const [orderPlaced, setOrderPlaced]         = useState(null);
  const [error, setError]                     = useState('');
  const [addressShake, setAddressShake]       = useState(false);
  const [addressMissing, setAddressMissing]   = useState(false);
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

  // ── Place order ────────────────────────────────────────────────────────────
  // For COD:     writes order with paymentStatus:'pending' (paid on delivery).
  // For Razorpay: writes order with paymentStatus:'pending', then calls
  //               verifyRazorpayPayment Cloud Function which HMAC-verifies the
  //               Razorpay signature server-side and upgrades to 'paid'.
  //               The order is never marked 'paid' from the client directly.
  const placeOrder = async (razorpayResponse = null) => {
    if (!address) {
      setError('Please select or add a delivery address to continue.');
      highlightAddressSection();
      return;
    }
    setLoading(true);
    setError('');
    setAddressMissing(false);
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
        items: items.map((i) => ({
          id:              i.id,
          name:            i.name,
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
        // ✅ Always write 'pending' — never trust the client to set 'paid'.
        // COD stays 'pending' until admin marks it paid on delivery.
        // Razorpay is upgraded to 'paid' by the verifyRazorpayPayment Cloud Function.
        paymentStatus: 'pending',
        paymentInfo:   null,
        status:        'placed',
        statusHistory: [{ status: 'placed', timestamp: new Date() }],
        createdAt:     serverTimestamp(),
        updatedAt:     serverTimestamp(),
      };

      const ref = await addDoc(collection(db, COLLECTIONS.ORDERS), orderData);

      // ── Verify Razorpay signature server-side ──────────────────────────────
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
          // Cloud Function has now set paymentStatus:'paid' on the order document.
        } catch (verifyErr) {
          // Signature verification failed — order was created but payment is
          // not confirmed. Show a specific error so the user can contact support.
          console.error('[Razorpay] Verification failed:', verifyErr);
          setError(
            'Payment received but verification failed. Please contact support with your order number: ' +
            orderNumber
          );
          setLoading(false);
          return;
        }
      }

      // Stock deduction happens server-side via validateAndProcessOrder trigger.
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

  // ── Order success screen ────────────────────────────────────────────────────
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
            <Paper elevation={0} sx={{
              border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5,
              position: { md: 'sticky' }, top: { md: 80 },
            }}>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>Order Summary</Typography>

              {/* Items list — show MRP per line */}
              {items.map((item) => (
                <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1, pr: 1 }} noWrap>
                    {item.name} × {item.quantity}
                  </Typography>
                  <Typography variant="body2" fontWeight={500}>
                    ₹{item.mrp * item.quantity}
                  </Typography>
                </Box>
              ))}

              <Divider sx={{ my: 1.5 }} />

              {/* Product savings — only show if there's an actual saving */}
              {(() => {
                const mrpTotal      = items.reduce((sum, i) => sum + i.mrp * i.quantity, 0);
                const savedAmount   = items.reduce((sum, i) => sum + ((i.mrp - (i.discountedPrice || i.mrp)) * i.quantity), 0);
                return (
                  <>
                    {/* MRP subtotal */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2" color="text.secondary">MRP Total</Typography>
                      <Typography variant="body2" fontWeight={500}>₹{mrpTotal}</Typography>
                    </Box>

                    {/* Product savings */}
                    {savedAmount > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2" color="text.secondary">Product Savings</Typography>
                        <Typography variant="body2" fontWeight={600} color="success.main">
                          -₹{savedAmount}
                        </Typography>
                      </Box>
                    )}

                    {/* Coupon discount */}
                    {coupon && discount > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="body2" color="text.secondary">Coupon</Typography>
                          <Chip label={coupon.code} size="small" color="success" sx={{ fontSize: '0.7rem', height: 20 }} />
                        </Box>
                        <Typography variant="body2" fontWeight={600} color="success.main">
                          -₹{discount}
                        </Typography>
                      </Box>
                    )}

                    {/* Delivery */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2" color="text.secondary">Delivery</Typography>
                      {deliveryCharge === 0
                        ? <Typography variant="body2" fontWeight={600} sx={{ color: ZAP_COLORS.accentGreen || '#06D6A0' }}>FREE</Typography>
                        : <Typography variant="body2" fontWeight={500}>₹{deliveryCharge}</Typography>}
                    </Box>

                    <Divider sx={{ my: 1.5 }} />

                    {/* Total */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                      <Typography fontWeight={700}>Total</Typography>
                      <Typography fontWeight={700} fontSize="1.1rem">₹{total.toFixed(0)}</Typography>
                    </Box>
                  </>
                );
              })()}
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