import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Typography, Button, Paper, Radio, RadioGroup,
  FormControlLabel, Dialog, DialogTitle, DialogContent,
  CircularProgress, Divider, Chip, IconButton, Alert,
} from '@mui/material';
import { Add, ArrowBack, CheckCircle, Phone, HeadsetMic } from '@mui/icons-material';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useStore } from '../../context/StoreContext';
import AddressForm, { EMPTY_ADDRESS } from '../../components/user/AddressForm';
import { initiateRazorpayPayment } from '../../utils/helpers';
import { ZAP_COLORS } from '../../theme';

const Checkout = () => {
  const navigate = useNavigate();
  const { user, userProfile, addAddress } = useAuth();
  const { activeUserStore } = useStore();
  const { items, coupon, subtotal, discount, deliveryCharge, total, clearCart } = useCart();

  const [selectedAddress, setSelectedAddress] = useState(userProfile?.addresses?.[0]?.id || '');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [loading, setLoading] = useState(false);
  const [addressDialog, setAddressDialog] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(null);
  const [error, setError] = useState('');

  const [newAddress, setNewAddress] = useState(EMPTY_ADDRESS);
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressError, setAddressError] = useState('');

  const address = userProfile?.addresses?.find((a) => a.id === selectedAddress);

  const placeOrder = async (paymentInfo = null) => {
    if (!address) { setError('Please select a delivery address'); return; }
    setLoading(true);
    setError('');
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
        statusHistory: [{ status: 'placed', timestamp: new Date().toISOString() }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const ref = await addDoc(collection(db, COLLECTIONS.ORDERS), orderData);
      clearCart();
      setOrderPlaced({ id: ref.id, orderNumber, ...orderData });
    } catch (err) {
      setError('Failed to place order. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (paymentMethod === 'cod') {
      await placeOrder();
    } else {
      setLoading(true);
      initiateRazorpayPayment({
        amount: total,
        orderId: `order_${Date.now()}`,
        userEmail: user.email,
        userName: userProfile?.displayName || '',
        userPhone: address?.phone || '',
        onSuccess: async (paymentInfo) => {
          await placeOrder(paymentInfo);
          setLoading(false);
        },
        onFailure: (msg) => {
          setError(msg || 'Payment failed');
          setLoading(false);
        },
      });
    }
  };

  const handleAddAddress = async () => {
    setAddressSaving(true);
    setAddressError('');
    try {
      const added = await addAddress(newAddress);
      setSelectedAddress(added.id);
      setAddressDialog(false);
      setNewAddress(EMPTY_ADDRESS);
    } catch (err) {
      setAddressError(err.message);
    } finally {
      setAddressSaving(false);
    }
  };

  if (orderPlaced) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <Box sx={{
          width: 80, height: 80, borderRadius: '50%',
          background: `${ZAP_COLORS.accentGreen}20`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          mx: 'auto', mb: 3,
        }}>
          <CheckCircle sx={{ fontSize: 48, color: ZAP_COLORS.accentGreen }} />
        </Box>
        <Typography variant="h5" fontWeight={800} mb={1}>Order Placed! 🎉</Typography>
        <Typography color="text.secondary" mb={0.5}>
          Your order <strong>#{orderPlaced.orderNumber}</strong> has been placed successfully.
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={4}>
          {paymentMethod === 'cod' ? 'Please keep cash ready at the time of delivery.' : 'Payment confirmed!'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="contained" onClick={() => navigate('/orders')}>
            Track Order
          </Button>
          <Button variant="outlined" onClick={() => navigate('/')}>
            Continue Shopping
          </Button>
        </Box>
        <Box sx={{ mt: 3, pt: 3, borderTop: `1px solid ${ZAP_COLORS.border}` }}>
          <Typography variant="caption" color="text.secondary" display="block" mb={1.5} textAlign="center">
            Need help with your order?
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="outlined" size="small" startIcon={<Phone />}
              component="a" href="tel:+919876543210"
              sx={{ borderRadius: 10, fontSize: '0.8rem' }}
            >
              Call Support
            </Button>
            <Button
              variant="outlined" size="small" startIcon={<HeadsetMic />}
              onClick={() => navigate('/help')}
              sx={{ borderRadius: 10, fontSize: '0.8rem' }}
            >
              Help Center
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
          <IconButton onClick={() => navigate('/cart')} size="small"><ArrowBack /></IconButton>
          <Typography variant="h6" fontWeight={700}>Checkout</Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

        <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
          <Box sx={{ flex: 1 }}>
            {/* Address Section */}
            <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5, mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" fontWeight={700} fontSize="1rem">📍 Delivery Address</Typography>
                {(userProfile?.addresses?.length || 0) < 5 && (
                  <Button size="small" startIcon={<Add />} onClick={() => setAddressDialog(true)}>
                    Add New
                  </Button>
                )}
              </Box>

              {!userProfile?.addresses?.length ? (
                <Button fullWidth variant="outlined" startIcon={<Add />} onClick={() => setAddressDialog(true)}>
                  Add Delivery Address
                </Button>
              ) : (
                <RadioGroup value={selectedAddress} onChange={(e) => setSelectedAddress(e.target.value)}>
                  {userProfile.addresses.map((addr) => (
                    <Box
                      key={addr.id}
                      sx={{
                        border: `1.5px solid ${selectedAddress === addr.id ? ZAP_COLORS.primary : ZAP_COLORS.border}`,
                        borderRadius: 2, p: 1.5, mb: 1,
                        background: selectedAddress === addr.id ? `${ZAP_COLORS.primary}06` : 'transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onClick={() => setSelectedAddress(addr.id)}
                    >
                      <FormControlLabel
                        value={addr.id}
                        control={<Radio size="small" />}
                        label={
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Chip label={addr.label} size="small" color="primary" sx={{ height: 20, fontSize: '0.68rem' }} />
                              <Typography variant="body2" fontWeight={600}>{addr.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{addr.phone}</Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary" display="block">
                              {addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}, {addr.city}, {addr.state} - {addr.pincode}
                            </Typography>
                          </Box>
                        }
                        sx={{ m: 0, width: '100%', alignItems: 'flex-start' }}
                      />
                    </Box>
                  ))}
                </RadioGroup>
              )}
            </Paper>

            {/* Payment Section */}
            <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5 }}>
              <Typography variant="h6" fontWeight={700} fontSize="1rem" mb={2}>💳 Payment Method</Typography>
              <RadioGroup value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                {[
                  { value: 'razorpay', label: '💳 Pay Online', sub: 'UPI, Cards, Net Banking via Razorpay' },
                  { value: 'cod', label: '💵 Cash on Delivery', sub: 'Pay when your order arrives' },
                ].map((opt) => (
                  <Box
                    key={opt.value}
                    sx={{
                      border: `1.5px solid ${paymentMethod === opt.value ? ZAP_COLORS.primary : ZAP_COLORS.border}`,
                      borderRadius: 2, p: 1.5, mb: 1, cursor: 'pointer',
                      background: paymentMethod === opt.value ? `${ZAP_COLORS.primary}06` : 'transparent',
                    }}
                    onClick={() => setPaymentMethod(opt.value)}
                  >
                    <FormControlLabel
                      value={opt.value} control={<Radio size="small" />}
                      label={
                        <Box>
                          <Typography variant="body2" fontWeight={600}>{opt.label}</Typography>
                          <Typography variant="caption" color="text.secondary">{opt.sub}</Typography>
                        </Box>
                      }
                      sx={{ m: 0 }}
                    />
                  </Box>
                ))}
              </RadioGroup>
            </Paper>
          </Box>

          {/* Summary */}
          <Box sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0 }}>
            <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5, position: { md: 'sticky' }, top: 80 }}>
              <Typography variant="h6" fontWeight={700} mb={2}>Bill Details</Typography>
              {[
                { label: 'Subtotal', value: `₹${subtotal}` },
                discount > 0 && { label: 'Discount', value: `-₹${discount}`, color: 'success.main' },
                { label: 'Delivery', value: deliveryCharge === 0 ? 'FREE' : `₹${deliveryCharge}`, color: deliveryCharge === 0 ? 'success.main' : undefined },
              ].filter(Boolean).map((row) => (
                <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                  <Typography variant="body2" fontWeight={500} color={row.color}>{row.value}</Typography>
                </Box>
              ))}
              <Divider sx={{ my: 1.5 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2.5 }}>
                <Typography fontWeight={700}>Total</Typography>
                <Typography fontWeight={800} fontSize="1.2rem" color="primary">₹{total}</Typography>
              </Box>
              <Button
                fullWidth variant="contained" size="large"
                onClick={handleCheckout}
                disabled={loading || !selectedAddress}
              >
                {loading
                  ? <CircularProgress size={22} sx={{ color: '#fff' }} />
                  : paymentMethod === 'cod' ? 'Place Order' : `Pay ₹${total}`
                }
              </Button>
            </Paper>
          </Box>
        </Box>

        {/* Add Address Dialog */}
        <Dialog open={addressDialog} onClose={() => { setAddressDialog(false); setAddressError(''); }} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontFamily: "'Syne', sans-serif", fontWeight: 700 }}>Add New Address</DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            <AddressForm
              value={newAddress}
              onChange={setNewAddress}
              onSave={handleAddAddress}
              onCancel={() => { setAddressDialog(false); setAddressError(''); }}
              saving={addressSaving}
              error={addressError}
            />
          </DialogContent>
        </Dialog>
      </Container>
    </Box>
  );
};

export default Checkout;