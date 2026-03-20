import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Container, Typography, Chip, Button, Divider,
  CircularProgress, Tabs, Tab, Accordion, AccordionSummary,
  AccordionDetails, Stepper, Step, StepLabel,
  IconButton, Skeleton, Dialog, DialogTitle, DialogContent, DialogActions, Alert,
} from '@mui/material';
import { ExpandMore, Download, Refresh, ArrowBack, Phone, HeadsetMic, Cancel } from '@mui/icons-material';
import {
  collection, query, where, orderBy, getDocs, limit, startAfter, getCountFromServer,
  doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { generateInvoicePDF, getOrderStatusColor, ORDER_STATUSES, formatDate } from '../../utils/helpers';
import { ZAP_COLORS } from '../../theme';

const PAGE_SIZE = 10;

const OrderStatusStepper = ({ status }) => {
  const activeStep = ORDER_STATUSES.findIndex((s) => s.key === status);
  const isCancelled = status === 'cancelled';
  return (
    <Box sx={{ mt: 1.5, overflowX: 'auto' }}>
      <Stepper
        activeStep={activeStep}
        alternativeLabel
        sx={{
          minWidth: 400,
          '& .MuiStepLabel-label': { fontSize: '0.65rem', mt: 0.5 },
          '& .MuiStepIcon-root.Mui-active': { color: ZAP_COLORS.primary },
          '& .MuiStepIcon-root.Mui-completed': { color: ZAP_COLORS.accentGreen },
        }}
      >
        {ORDER_STATUSES.map((s) => (
          <Step key={s.key}>
            <StepLabel
              StepIconComponent={() => (
                <Box sx={{
                  width: 28, height: 28, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.85rem',
                  background: ORDER_STATUSES.findIndex((x) => x.key === s.key) <= activeStep && !isCancelled
                    ? `${ZAP_COLORS.primary}20` : `${ZAP_COLORS.border}`,
                  border: ORDER_STATUSES.findIndex((x) => x.key === s.key) === activeStep
                    ? `2px solid ${ZAP_COLORS.primary}` : '2px solid transparent',
                }}>
                  {s.icon}
                </Box>
              )}
            >
              {s.label}
            </StepLabel>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
};

const OrderCard = ({ order, userProfile, expanded, onChange, onCancelled }) => {
  const [downloading, setDownloading] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const canCancel = ['placed', 'confirmed'].includes(order.status);

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
    try {
      await generateInvoicePDF(order, userProfile);
    } catch (err) {
      console.error(err);
    } finally {
      setDownloading(false);
    }
  };

  const statusColor = getOrderStatusColor(order.status);

  return (
    <Accordion
      elevation={0}
      expanded={expanded}
      onChange={onChange}
      sx={{
        border: `1px solid ${ZAP_COLORS.border}`,
        borderRadius: '12px !important',
        mb: 1.5,
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
            sx={{
              background: `${statusColor}18`, color: statusColor,
              border: `1px solid ${statusColor}30`, fontWeight: 600, fontSize: '0.7rem',
            }}
          />
          <Box sx={{ ml: 'auto', mr: 1 }}>
            <Typography fontWeight={700} color="primary">₹{order.total}</Typography>
            <Typography variant="caption" color="text.secondary">{order.items?.length} items</Typography>
          </Box>
        </Box>
      </AccordionSummary>

      <AccordionDetails sx={{ pt: 0, px: 2, pb: 2 }}>
        <Divider sx={{ mb: 2 }} />

        {/* Order status stepper */}
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
                src={item.images?.[0] || `https://via.placeholder.com/50x50/FFF8F5/FF6B35?text=${item.name?.[0]}`}
                alt={item.name}
                sx={{ width: 44, height: 44, borderRadius: 1.5, objectFit: 'contain', background: `${ZAP_COLORS.primary}08`, flexShrink: 0 }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={500} noWrap>{item.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  ₹{item.discountedPrice || item.mrp} × {item.quantity}
                </Typography>
              </Box>
              <Typography variant="body2" fontWeight={600}>
                ₹{(item.discountedPrice || item.mrp) * item.quantity}
              </Typography>
            </Box>
          ))}
        </Box>

        <Divider sx={{ my: 1.5 }} />

        {/* Order meta */}
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 1.5 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Payment</Typography>
            <Typography variant="body2" fontWeight={600}>
              {order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online (Razorpay)'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Payment Status</Typography>
            <Chip
              label={order.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
              size="small"
              sx={{
                display: 'block', mt: 0.2,
                background: order.paymentStatus === 'paid' ? `${ZAP_COLORS.accentGreen}18` : `${ZAP_COLORS.warning}18`,
                color: order.paymentStatus === 'paid' ? ZAP_COLORS.accentGreen : ZAP_COLORS.warning,
                fontWeight: 600, fontSize: '0.7rem',
              }}
            />
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Delivery Address</Typography>
            <Typography variant="body2" fontWeight={500}>
              {order.address?.line1}, {order.address?.city}
            </Typography>
          </Box>
        </Box>

        {/* Action buttons */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            size="small" variant="outlined"
            startIcon={downloading ? <CircularProgress size={14} /> : <Download />}
            onClick={handleDownloadInvoice} disabled={downloading}
            sx={{ borderRadius: 2 }}
          >
            Invoice
          </Button>

          {canCancel && (
            <Button
              size="small" variant="outlined" color="error"
              startIcon={<Cancel />}
              onClick={(e) => { e.stopPropagation(); setCancelDialog(true); }}
              sx={{ borderRadius: 2 }}
            >
              Cancel Order
            </Button>
          )}

          <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
            <Button
              size="small" variant="text"
              component="a" href="tel:+919876543210"
              startIcon={<Phone />}
              sx={{ borderRadius: 2, color: ZAP_COLORS.primary, fontSize: '0.75rem' }}
            >
              Call
            </Button>
            <Button
              size="small" variant="text"
              component="a" href="https://wa.me/919876543210" target="_blank"
              sx={{ borderRadius: 2, color: '#25D366', fontSize: '0.75rem' }}
            >
              WhatsApp
            </Button>
          </Box>
        </Box>

        {/* Cancel confirmation dialog */}
        <Dialog open={cancelDialog} onClose={() => !cancelling && setCancelDialog(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
          <DialogTitle fontWeight={700} sx={{ fontFamily: "'Syne', sans-serif" }}>Cancel Order?</DialogTitle>
          <DialogContent>
            {cancelError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{cancelError}</Alert>}
            <Typography variant="body2" color="text.secondary">
              Are you sure you want to cancel order <strong>#{order.orderNumber}</strong>?
              This action cannot be undone.
            </Typography>
            {order.paymentMethod !== 'cod' && order.paymentStatus === 'paid' && (
              <Alert severity="info" sx={{ mt: 1.5, borderRadius: 2, fontSize: '0.8rem' }}>
                Your payment will be refunded within 5–7 business days.
              </Alert>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button onClick={() => setCancelDialog(false)} disabled={cancelling} variant="outlined" fullWidth>Keep Order</Button>
            <Button onClick={handleCancel} disabled={cancelling} color="error" variant="contained" fullWidth>
              {cancelling ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Yes, Cancel'}
            </Button>
          </DialogActions>
        </Dialog>
      </AccordionDetails>
    </Accordion>
  );
};

const OrderHistory = () => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const [expandedId, setExpandedId] = useState(highlightId || false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [cursors, setCursors] = useState([null]);
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
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders(docs);
      // If a specific order was linked to, expand it and scroll to it
      if (highlightId && docs.find((d) => d.id === highlightId)) {
        setExpandedId(highlightId);
        setTimeout(() => {
          const el = document.getElementById(`order-${highlightId}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
      setPage(pageIndex);
      if (snap.docs.length > 0) {
        setCursors((prev) => {
          const updated = [...prev];
          updated[pageIndex + 1] = snap.docs[snap.docs.length - 1];
          return updated;
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCursors([null]);
    fetchOrders(0, statusFilter);
  }, [user, statusFilter]);

  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h6" mb={2}>Please login to view your orders</Typography>
        <Button variant="contained" onClick={() => navigate('/login')}>Login</Button>
      </Container>
    );
  }

  const tabFilters = [
    { value: 'all', label: 'All' },
    { value: 'placed', label: 'Active' },
    { value: 'enroute', label: 'Out for Delivery' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <Box sx={{ pb: { xs: 13, md: 3 }, pt: 1 }}>
      <Container maxWidth="md">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, px: { xs: 1, sm: 0 } }}>
          <IconButton onClick={() => navigate(-1)} size="small"><ArrowBack /></IconButton>
          <Typography variant="h6" fontWeight={700}>My Orders</Typography>
          <IconButton size="small" onClick={() => fetchOrders(0, statusFilter)} sx={{ ml: 'auto' }}>
            <Refresh fontSize="small" />
          </IconButton>
        </Box>

        <Tabs
          value={statusFilter}
          onChange={(_, v) => setStatusFilter(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2, '& .MuiTabs-root': { px: 0 } }}
        >
          {tabFilters.map((t) => (
            <Tab key={t.value} value={t.value} label={t.label} sx={{ fontSize: '0.8rem', minWidth: 'auto', px: 1.5 }} />
          ))}
        </Tabs>

        {loading ? (
          Array(3).fill(0).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 2, mb: 1.5 }} />
          ))
        ) : orders.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Box sx={{ fontSize: '4rem', mb: 2 }}>📦</Box>
            <Typography variant="h6" fontWeight={600} mb={1}>No orders found</Typography>
            <Typography color="text.secondary" mb={3}>Start shopping to see your orders here</Typography>
            <Button variant="contained" onClick={() => navigate('/')}>Shop Now</Button>
          </Box>
        ) : (
          <>
            {orders.map((order) => (
              <Box key={order.id} id={`order-${order.id}`}>
                <OrderCard
                  order={order}
                  userProfile={userProfile}
                  expanded={expandedId === order.id}
                  onChange={(_, isOpen) => setExpandedId(isOpen ? order.id : false)}
                  onCancelled={() => fetchOrders(0, statusFilter)}
                />
              </Box>
            ))}

            {/* Need help */}
            <Box sx={{ mt: 2, p: 2, borderRadius: 2.5, background: `${ZAP_COLORS.primary}08`, border: `1px solid ${ZAP_COLORS.primary}20`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="body2" fontWeight={600}>Need help with an order?</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" variant="outlined" component="a" href="tel:+919876543210" startIcon={<Phone />} sx={{ borderRadius: 10, fontSize: '0.75rem' }}>
                  Call Us
                </Button>
                <Button size="small" variant="outlined" startIcon={<HeadsetMic />} onClick={() => navigate('/help')} sx={{ borderRadius: 10, fontSize: '0.75rem' }}>
                  Help Center
                </Button>
              </Box>
            </Box>

            {/* Pagination */}
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 3 }}>
                <Button
                  size="small" variant="outlined" disabled={page === 0}
                  onClick={() => fetchOrders(page - 1, statusFilter)}
                >
                  Previous
                </Button>
                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', px: 1 }}>
                  Page {page + 1} of {totalPages}
                </Typography>
                <Button
                  size="small" variant="outlined" disabled={page >= totalPages - 1}
                  onClick={() => fetchOrders(page + 1, statusFilter)}
                >
                  Next
                </Button>
              </Box>
            )}
          </>
        )}
      </Container>
    </Box>
  );
};

export default OrderHistory;