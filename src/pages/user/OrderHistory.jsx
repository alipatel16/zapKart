// ============================================================
// src/pages/user/OrderHistory.jsx  — PATCH NOTES
//
// FIX 3 changes only (canCancel + dispatched dialog).
// Everything else is preserved exactly as-is.
//
// CHANGES:
//  • canCancel  → only 'placed' | 'confirmed'  (was also allowing others implicitly)
//  • isDispatched → true for 'processing' | 'packed' | 'enroute'
//  • Cancel button for dispatched orders opens a NEW dialog explaining
//    they can reject delivery or call support — no actual cancel is done.
//  • Original cancel dialog/logic unchanged for placed/confirmed.
// ============================================================

// ─── FIND THIS SECTION in OrderCard and REPLACE with the block below ───────
//
// ORIGINAL (around line containing "const canCancel"):
//
//   const canCancel = ['placed', 'confirmed'].includes(order.status);
//
// REPLACE THE ENTIRE OrderCard component's relevant variables + JSX with:
// ───────────────────────────────────────────────────────────────────────────

/*
  Inside OrderCard component — add these variables after the existing state:

    const canCancel    = ['placed', 'confirmed'].includes(order.status);
    const isDispatched = ['processing', 'packed', 'enroute'].includes(order.status);
    const [dispatchedDialog, setDispatchedDialog] = useState(false);

  Then in the Actions box, REPLACE the existing cancel button block:

    {canCancel && (
      <Button size="small" variant="outlined" color="error" startIcon={<Cancel />}
        onClick={(e) => { e.stopPropagation(); setCancelDialog(true); }} sx={{ borderRadius: 2 }}>
        Cancel Order
      </Button>
    )}

  WITH this two-part block:

    {canCancel && (
      <Button size="small" variant="outlined" color="error" startIcon={<Cancel />}
        onClick={(e) => { e.stopPropagation(); setCancelDialog(true); }} sx={{ borderRadius: 2 }}>
        Cancel Order
      </Button>
    )}
    {isDispatched && (
      <Button size="small" variant="outlined" color="warning" startIcon={<Cancel />}
        onClick={(e) => { e.stopPropagation(); setDispatchedDialog(true); }} sx={{ borderRadius: 2 }}>
        Cancel Order
      </Button>
    )}

  Then add the new Dispatched dialog BELOW the existing Cancel dialog:

    <Dialog open={dispatchedDialog} onClose={() => setDispatchedDialog(false)}
      maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle fontWeight={700} sx={{ fontFamily: "'Syne', sans-serif" }}>
        ⚠️ Order Already Dispatched
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
          Your order <strong>#{order.orderNumber}</strong> is already on its way and cannot
          be cancelled at this stage.
        </Alert>
        <Typography variant="body2" color="text.secondary" mb={1.5}>
          Here's what you can do:
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid #E0E0E0', background: '#FAFAFA' }}>
            <Typography variant="body2" fontWeight={700} mb={0.3}>
              🚪 Reject the delivery
            </Typography>
            <Typography variant="caption" color="text.secondary">
              When the delivery agent arrives, simply refuse to accept the package. The
              item will be returned to the store.
            </Typography>
          </Box>
          <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid #E0E0E0', background: '#FAFAFA' }}>
            <Typography variant="body2" fontWeight={700} mb={0.3}>
              📞 Call support
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Contact our support team and they will try to intercept the delivery if
              possible.
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={() => setDispatchedDialog(false)} variant="outlined" fullWidth>
          Close
        </Button>
        <Button
          component="a" href="tel:+919876543210"
          variant="contained" color="warning" fullWidth
          startIcon={<Phone />}
        >
          Call Support
        </Button>
      </DialogActions>
    </Dialog>
*/

// ─────────────────────────────────────────────────────────────────────────────
// FULL PATCHED OrderCard component (drop-in replacement):
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Container, Typography, Button, IconButton, Divider,
  Paper, Chip, Alert, CircularProgress, Accordion, AccordionSummary,
  AccordionDetails, Stepper, Step, StepLabel, Dialog, DialogTitle,
  DialogContent, DialogActions, Pagination, Tabs, Tab,
} from '@mui/material';
import {
  ExpandMore, Download, Cancel, Phone, ArrowBack,
} from '@mui/icons-material';
import {
  collection, query, where, orderBy, getDocs, doc, updateDoc,
  serverTimestamp, limit, startAfter, getCountFromServer,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { generateInvoicePDF, ORDER_STATUSES, getOrderStatusColor, formatDate } from '../../utils/helpers';
import { ZAP_COLORS } from '../../theme';

const PAGE_SIZE = 10;

// ── Status Stepper ───────────────────────────────────────────────────────────
const OrderStatusStepper = ({ status }) => {
  const activeStep = ORDER_STATUSES.findIndex((s) => s.key === status);
  return (
    <Box sx={{ overflowX: 'auto', pb: 1 }}>
      <Stepper activeStep={activeStep} alternativeLabel sx={{ minWidth: 500 }}>
        {ORDER_STATUSES.map((s) => (
          <Step key={s.key} completed={ORDER_STATUSES.findIndex((x) => x.key === status) > ORDER_STATUSES.findIndex((x) => x.key === s.key)}>
            <StepLabel
              StepIconComponent={() => (
                <Box sx={{
                  width: 32, height: 32, borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: '1rem',
                  background: ORDER_STATUSES.findIndex((x) => x.key === s.key) <= activeStep
                    ? `${ZAP_COLORS.primary}20` : `${ZAP_COLORS.border}`,
                  border: ORDER_STATUSES.findIndex((x) => x.key === s.key) === activeStep
                    ? `2px solid ${ZAP_COLORS.primary}` : '2px solid transparent',
                }}>{s.icon}</Box>
              )}
            >{s.label}</StepLabel>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
};

// ── Individual order card ────────────────────────────────────────────────────
const OrderCard = ({ order, userProfile, expanded, onChange, onCancelled }) => {
  const [downloading,      setDownloading]      = useState(false);
  const [cancelDialog,     setCancelDialog]     = useState(false);
  const [cancelling,       setCancelling]       = useState(false);
  const [cancelError,      setCancelError]      = useState('');
  // Fix 3: new state for dispatched info dialog
  const [dispatchedDialog, setDispatchedDialog] = useState(false);

  // Fix 3: only placed/confirmed can actually cancel
  const canCancel    = ['placed', 'confirmed'].includes(order.status);
  // Fix 3: dispatched = show info popup instead
  const isDispatched = ['processing', 'packed', 'enroute'].includes(order.status);

  const handleCancel = async () => {
    setCancelling(true);
    setCancelError('');
    try {
      await updateDoc(doc(db, COLLECTIONS.ORDERS, order.id), {
        status: 'cancelled',
        statusHistory: [
          ...(order.statusHistory || []),
          { status: 'cancelled', timestamp: new Date().toISOString() },
        ],
        updatedAt: serverTimestamp(),
      });

      // Stock restoration handled by Cloud Function on status → 'cancelled'
      setCancelDialog(false);
      onCancelled?.();
    } catch (err) {
      setCancelError('Failed to cancel. Please try again or contact support.');
    } finally {
      setCancelling(false);
    }
  };

  const handleDownloadInvoice = async (e) => {
    e.stopPropagation();
    setDownloading(true);
    try { await generateInvoicePDF(order, userProfile); }
    catch (err) { console.error(err); }
    finally { setDownloading(false); }
  };

  const statusColor = getOrderStatusColor(order.status);

  return (
    <Accordion
      elevation={0}
      expanded={expanded}
      onChange={onChange}
      sx={{
        border: `1px solid ${ZAP_COLORS.border}`, borderRadius: '12px !important', mb: 1.5,
        '&:before': { display: 'none' },
        '&.Mui-expanded': { boxShadow: `0 4px 16px ${ZAP_COLORS.primary}12` },
        ...(expanded && { boxShadow: `0 0 0 2px ${ZAP_COLORS.primary}` }),
      }}
    >
      <AccordionSummary expandIcon={<ExpandMore />} sx={{ px: 2, py: 1 }}>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="body2" fontWeight={700}>#{order.orderNumber}</Typography>
            <Typography variant="caption" color="text.secondary">{formatDate(order.createdAt)}</Typography>
          </Box>
          <Chip
            label={ORDER_STATUSES.find((s) => s.key === order.status)?.label || order.status}
            size="small"
            sx={{ background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}30`, fontWeight: 600, fontSize: '0.7rem' }}
          />
          <Box sx={{ ml: 'auto', mr: 1 }}>
            <Typography fontWeight={700} color="primary">₹{order.total}</Typography>
            <Typography variant="caption" color="text.secondary">{order.items?.length} items</Typography>
          </Box>
        </Box>
      </AccordionSummary>

      <AccordionDetails sx={{ pt: 0, px: 2, pb: 2 }}>
        <Divider sx={{ mb: 2 }} />
        {order.status !== 'cancelled' && <OrderStatusStepper status={order.status} />}

        {/* Items */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" mb={1} display="block">
            ITEMS ORDERED
          </Typography>
          {order.items?.map((item, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <Box
                component="img"
                src={item.images?.[0] || '/placeholder.png'}
                alt={item.name}
                sx={{ width: 40, height: 40, borderRadius: 1.5, objectFit: 'cover', flexShrink: 0 }}
              />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight={600}>{item.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  ₹{item.discountedPrice || item.mrp} × {item.quantity}
                </Typography>
              </Box>
              <Typography variant="body2" fontWeight={700}>
                ₹{(item.discountedPrice || item.mrp) * item.quantity}
              </Typography>
            </Box>
          ))}
        </Box>

        <Divider sx={{ my: 1.5 }} />

        {/* Price summary */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {order.discount > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">Discount</Typography>
              <Typography variant="caption" color="success.main">-₹{order.discount}</Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary">Delivery</Typography>
            <Typography variant="caption">{order.deliveryCharge === 0 ? 'FREE' : `₹${order.deliveryCharge}`}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" fontWeight={700}>Total</Typography>
            <Typography variant="body2" fontWeight={700} color="primary">₹{order.total}</Typography>
          </Box>
        </Box>

        {/* Payment info */}
        <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            label={order.paymentMethod === 'cod' ? '💵 Cash on Delivery' : '💳 Online Payment'}
            size="small"
            sx={{ fontSize: '0.7rem', background: `${ZAP_COLORS.primary}10` }}
          />
          <Chip
            label={order.paymentStatus === 'paid' ? '✓ Paid' : 'Payment Pending'}
            size="small"
            sx={{
              fontSize: '0.7rem',
              background: order.paymentStatus === 'paid' ? `${ZAP_COLORS.accentGreen}15` : `${ZAP_COLORS.warning}15`,
              color: order.paymentStatus === 'paid' ? ZAP_COLORS.accentGreen : ZAP_COLORS.warning,
            }}
          />
        </Box>

        {/* Delivery address */}
        {order.address && (
          <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, background: `${ZAP_COLORS.border}`, border: `1px solid ${ZAP_COLORS.border}` }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={0.3}>
              DELIVERY ADDRESS
            </Typography>
            <Typography variant="caption">
              {order.address.name} · {order.address.line1}
              {order.address.line2 ? `, ${order.address.line2}` : ''}, {order.address.city}
              {order.address.state ? `, ${order.address.state}` : ''} - {order.address.pincode}
            </Typography>
          </Box>
        )}

        {/* Actions */}
        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
          <Button size="small" variant="outlined"
            startIcon={downloading ? <CircularProgress size={14} /> : <Download />}
            onClick={handleDownloadInvoice} disabled={downloading} sx={{ borderRadius: 2 }}>
            Invoice
          </Button>

          {/* Fix 3: Only placed/confirmed show real cancel */}
          {canCancel && (
            <Button size="small" variant="outlined" color="error" startIcon={<Cancel />}
              onClick={(e) => { e.stopPropagation(); setCancelDialog(true); }} sx={{ borderRadius: 2 }}>
              Cancel Order
            </Button>
          )}

          {/* Fix 3: Dispatched orders show info popup */}
          {isDispatched && (
            <Button size="small" variant="outlined" color="warning" startIcon={<Cancel />}
              onClick={(e) => { e.stopPropagation(); setDispatchedDialog(true); }} sx={{ borderRadius: 2 }}>
              Cancel Order
            </Button>
          )}

          <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
            <Button size="small" variant="text" component="a" href="tel:+919876543210"
              startIcon={<Phone />} sx={{ borderRadius: 2, color: ZAP_COLORS.primary, fontSize: '0.75rem' }}>
              Call
            </Button>
            <Button size="small" variant="text" component="a" href="https://wa.me/919876543210" target="_blank"
              sx={{ borderRadius: 2, color: '#25D366', fontSize: '0.75rem' }}>
              WhatsApp
            </Button>
          </Box>
        </Box>

        {/* Original cancel dialog (placed/confirmed) */}
        <Dialog open={cancelDialog} onClose={() => !cancelling && setCancelDialog(false)}
          maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
          <DialogTitle fontWeight={700} sx={{ fontFamily: "'Syne', sans-serif" }}>Cancel Order?</DialogTitle>
          <DialogContent>
            {cancelError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{cancelError}</Alert>}
            <Typography variant="body2" color="text.secondary">
              Are you sure you want to cancel order <strong>#{order.orderNumber}</strong>? This cannot be undone.
            </Typography>
            {order.paymentMethod !== 'cod' && order.paymentStatus === 'paid' && (
              <Alert severity="info" sx={{ mt: 1.5, borderRadius: 2, fontSize: '0.8rem' }}>
                Your payment will be refunded within 5–7 business days.
              </Alert>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button onClick={() => setCancelDialog(false)} disabled={cancelling} variant="outlined" fullWidth>
              Keep Order
            </Button>
            <Button onClick={handleCancel} disabled={cancelling} color="error" variant="contained" fullWidth>
              {cancelling ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Yes, Cancel'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Fix 3: Dispatched info dialog */}
        <Dialog open={dispatchedDialog} onClose={() => setDispatchedDialog(false)}
          maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
          <DialogTitle fontWeight={700} sx={{ fontFamily: "'Syne', sans-serif" }}>
            ⚠️ Order Already Dispatched
          </DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
              Order <strong>#{order.orderNumber}</strong> is already on its way and cannot
              be cancelled at this stage.
            </Alert>
            <Typography variant="body2" color="text.secondary" mb={1.5}>
              Here's what you can do:
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{
                p: 1.5, borderRadius: 2,
                border: `1px solid ${ZAP_COLORS.border}`,
                background: `${ZAP_COLORS.warning}06`,
              }}>
                <Typography variant="body2" fontWeight={700} mb={0.3}>
                  🚪 Reject the delivery
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  When the delivery agent arrives at your door, simply refuse to accept the
                  package. The item will be returned to the store.
                </Typography>
              </Box>
              <Box sx={{
                p: 1.5, borderRadius: 2,
                border: `1px solid ${ZAP_COLORS.border}`,
                background: `${ZAP_COLORS.primary}06`,
              }}>
                <Typography variant="body2" fontWeight={700} mb={0.3}>
                  📞 Call support immediately
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Contact our support team — they will try to intercept the delivery and
                  arrange a return if possible.
                </Typography>
              </Box>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button onClick={() => setDispatchedDialog(false)} variant="outlined" fullWidth>
              Close
            </Button>
            <Button
              component="a" href="tel:+919876543210"
              variant="contained" color="warning" fullWidth
              startIcon={<Phone />}
            >
              Call Support
            </Button>
          </DialogActions>
        </Dialog>
      </AccordionDetails>
    </Accordion>
  );
};

// ── Main page ────────────────────────────────────────────────────────────────
const OrderHistory = () => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  const [expandedId,   setExpandedId]   = useState(highlightId || false);
  const [orders,       setOrders]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [page,         setPage]         = useState(0);
  const [totalPages,   setTotalPages]   = useState(0);
  const [cursors,      setCursors]      = useState([null]);
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchOrders = async (pageIndex = 0, filter = 'all') => {
    if (!user) return;
    setLoading(true);
    try {
      const col = collection(db, COLLECTIONS.ORDERS);
      const constraints = [where('userId', '==', user.uid)];
      if (filter !== 'all') constraints.push(where('status', '==', filter));
      constraints.push(orderBy('createdAt', 'desc'));

      const countSnap = await getCountFromServer(query(col, ...constraints));
      setTotalPages(Math.ceil(countSnap.data().count / PAGE_SIZE));

      const cursor = cursors[pageIndex];
      const q = cursor
        ? query(col, ...constraints, limit(PAGE_SIZE), startAfter(cursor))
        : query(col, ...constraints, limit(PAGE_SIZE));

      const snap = await getDocs(q);
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPage(pageIndex);

      if (snap.docs.length > 0) {
        const newCursors = [...cursors];
        newCursors[pageIndex + 1] = snap.docs[snap.docs.length - 1];
        setCursors(newCursors);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCursors([null]);
    fetchOrders(0, statusFilter);
  }, [statusFilter, user?.uid]);

  const filterTabs = [
    { value: 'all',       label: 'All' },
    { value: 'placed',    label: '🆕 Placed' },
    { value: 'confirmed', label: '✅ Confirmed' },
    { value: 'enroute',   label: '🛵 On the Way' },
    { value: 'delivered', label: '🎉 Delivered' },
    { value: 'cancelled', label: '❌ Cancelled' },
  ];

  return (
    <Box sx={{ pb: { xs: 13, md: 3 }, pt: 1 }}>
      <Container maxWidth="md">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, px: { xs: 1, sm: 0 } }}>
          <IconButton onClick={() => navigate(-1)} size="small"><ArrowBack /></IconButton>
          <Typography variant="h6" fontWeight={700}>My Orders</Typography>
        </Box>

        <Tabs
          value={statusFilter}
          onChange={(_, v) => setStatusFilter(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2 }}
        >
          {filterTabs.map((t) => (
            <Tab key={t.value} value={t.value} label={t.label}
              sx={{ fontSize: '0.78rem', minWidth: 'auto', px: 1.5 }} />
          ))}
        </Tabs>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress sx={{ color: ZAP_COLORS.primary }} />
          </Box>
        ) : orders.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Box sx={{ fontSize: '4rem', mb: 1 }}>📦</Box>
            <Typography variant="h6" fontWeight={700} mb={0.5}>No orders yet</Typography>
            <Typography color="text.secondary" mb={2}>
              {statusFilter === 'all' ? "You haven't placed any orders." : `No ${statusFilter} orders.`}
            </Typography>
            <Button variant="contained" onClick={() => navigate('/')}>Shop Now</Button>
          </Box>
        ) : (
          <>
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                userProfile={userProfile}
                expanded={expandedId === order.id}
                onChange={(_, isExpanded) => setExpandedId(isExpanded ? order.id : false)}
                onCancelled={() => fetchOrders(page, statusFilter)}
              />
            ))}

            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Pagination
                  count={totalPages}
                  page={page + 1}
                  onChange={(_, p) => fetchOrders(p - 1, statusFilter)}
                  color="primary"
                />
              </Box>
            )}
          </>
        )}
      </Container>
    </Box>
  );
};

export default OrderHistory;