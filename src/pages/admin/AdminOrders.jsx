import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Select, MenuItem,
  Button, TextField, InputAdornment, Dialog, DialogTitle,
  DialogContent, DialogActions, CircularProgress, Tabs, Tab, IconButton,
  FormControl, InputLabel, Alert,
} from '@mui/material';
import {
  Search, Download, Visibility, CheckCircle,
} from '@mui/icons-material';
import {
  collection, query, where, orderBy, getDocs, doc,
  updateDoc, serverTimestamp, limit, startAfter, getCountFromServer,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { generateInvoicePDF, getOrderStatusColor, ORDER_STATUSES, formatDate, formatCurrency } from '../../utils/helpers';
import { ZAP_COLORS } from '../../theme';

const PAGE_SIZE = 15;

const AdminOrders = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const cursorsRef = useRef([null]);
  const [updating, setUpdating] = useState('');
  const [detailOrder, setDetailOrder] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchOrders = useCallback(async (pageIndex = 0, filter = 'all') => {
    setLoading(true);
    try {
      const col = collection(db, COLLECTIONS.ORDERS);
      const constraints = [];
      if (filter !== 'all') constraints.push(where('status', '==', filter));
      constraints.push(orderBy('createdAt', 'desc'));

      const countSnap = await getCountFromServer(query(col, ...constraints));
      setTotalPages(Math.ceil(countSnap.data().count / PAGE_SIZE));

      const cursor = cursorsRef.current[pageIndex];
      const q = cursor
        ? query(col, ...constraints, limit(PAGE_SIZE), startAfter(cursor))
        : query(col, ...constraints, limit(PAGE_SIZE));

      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders(docs);
      setPage(pageIndex);

      if (snap.docs.length > 0) {
        cursorsRef.current[pageIndex + 1] = snap.docs[snap.docs.length - 1];
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cursorsRef.current = [null];
    fetchOrders(0, statusFilter);
  }, [statusFilter]);

  const updateOrderStatus = async (orderId, newStatus) => {
    setUpdating(orderId);
    try {
      const ref = doc(db, COLLECTIONS.ORDERS, orderId);
      await updateDoc(ref, {
        status: newStatus,
        [`statusHistory`]: [...(orders.find((o) => o.id === orderId)?.statusHistory || []),
          { status: newStatus, timestamp: new Date().toISOString() }],
        updatedAt: serverTimestamp(),
      });
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: newStatus } : o));
      setSuccessMsg(`Order status updated to "${newStatus}"`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } finally {
      setUpdating('');
    }
  };

  const markAsPaid = async (orderId) => {
    setUpdating(orderId + '_pay');
    try {
      await updateDoc(doc(db, COLLECTIONS.ORDERS, orderId), {
        paymentStatus: 'paid',
        updatedAt: serverTimestamp(),
      });
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, paymentStatus: 'paid' } : o));
      setSuccessMsg('Payment marked as received');
      setTimeout(() => setSuccessMsg(''), 3000);
    } finally {
      setUpdating('');
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return o.orderNumber?.toLowerCase().includes(q) ||
      o.customerName?.toLowerCase().includes(q) ||
      o.customerEmail?.toLowerCase().includes(q);
  });

  const tabs = [
    { value: 'all', label: 'All' },
    { value: 'placed', label: '🆕 New' },
    { value: 'confirmed', label: '✅ Confirmed' },
    { value: 'processing', label: '⚙️ Processing' },
    { value: 'packed', label: '📦 Packed' },
    { value: 'enroute', label: '🛵 Out for Delivery' },
    { value: 'delivered', label: '✅ Delivered' },
    { value: 'cancelled', label: '❌ Cancelled' },
  ];

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif" }}>
          Orders Management
        </Typography>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{successMsg}</Alert>}

      <Tabs
        value={statusFilter} onChange={(_, v) => setStatusFilter(v)}
        variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}
      >
        {tabs.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} sx={{ fontSize: '0.78rem', minWidth: 'auto', px: 1.5 }} />
        ))}
      </Tabs>

      <TextField
        placeholder="Search by order #, customer name or email..."
        value={search} onChange={(e) => setSearch(e.target.value)}
        size="small" fullWidth sx={{ mb: 2 }}
        InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
      />

      <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ background: `${ZAP_COLORS.primary}08` }}>
              {['Order #', 'Customer', 'Items', 'Total', 'Payment', 'Status', 'Date', 'Actions'].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.78rem', color: ZAP_COLORS.textSecondary, whiteSpace: 'nowrap' }}>
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
            ) : filteredOrders.length === 0 ? (
              <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: ZAP_COLORS.textMuted }}>No orders found</TableCell></TableRow>
            ) : filteredOrders.map((order) => {
              const statusColor = getOrderStatusColor(order.status);
              return (
                <TableRow key={order.id} hover sx={{ '&:hover': { background: `${ZAP_COLORS.primary}04` } }}>
                  <TableCell sx={{ fontSize: '0.78rem', fontWeight: 700 }}>#{order.orderNumber}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>
                    <Box>
                      <Typography variant="body2" fontWeight={500} fontSize="0.78rem">{order.customerName}</Typography>
                      <Typography variant="caption" color="text.secondary">{order.customerPhone}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>{order.items?.length} items</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', fontWeight: 700 }}>₹{order.total}</TableCell>
                  <TableCell>
                    <Box>
                      <Chip
                        label={order.paymentMethod === 'cod' ? 'COD' : 'Online'}
                        size="small" sx={{ fontSize: '0.62rem', height: 17, mb: 0.3, display: 'block' }}
                      />
                      <Chip
                        label={order.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
                        size="small"
                        sx={{
                          fontSize: '0.62rem', height: 17,
                          background: order.paymentStatus === 'paid' ? `${ZAP_COLORS.accentGreen}18` : `${ZAP_COLORS.warning}18`,
                          color: order.paymentStatus === 'paid' ? ZAP_COLORS.accentGreen : ZAP_COLORS.warning,
                        }}
                      />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <FormControl size="small" sx={{ minWidth: 130 }}>
                      <Select
                        value={order.status}
                        onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                        disabled={updating === order.id}
                        sx={{ fontSize: '0.75rem', borderRadius: 2, color: statusColor,
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: `${statusColor}40` },
                        }}
                      >
                        {ORDER_STATUSES.map((s) => (
                          <MenuItem key={s.key} value={s.key} sx={{ fontSize: '0.8rem' }}>
                            {s.icon} {s.label}
                          </MenuItem>
                        ))}
                        <MenuItem value="cancelled" sx={{ fontSize: '0.8rem', color: ZAP_COLORS.error }}>
                          ❌ Cancel
                        </MenuItem>
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.72rem', color: ZAP_COLORS.textMuted, whiteSpace: 'nowrap' }}>
                    {formatDate(order.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => setDetailOrder(order)} title="View details">
                        <Visibility fontSize="small" />
                      </IconButton>
                      {order.paymentMethod === 'cod' && order.paymentStatus !== 'paid' && (
                        <IconButton
                          size="small" title="Mark as paid"
                          disabled={updating === order.id + '_pay'}
                          onClick={() => markAsPaid(order.id)}
                          sx={{ color: ZAP_COLORS.accentGreen }}
                        >
                          {updating === order.id + '_pay' ? <CircularProgress size={14} /> : <CheckCircle fontSize="small" />}
                        </IconButton>
                      )}
                      <IconButton
                        size="small" title="Download invoice"
                        onClick={() => generateInvoicePDF(order, { displayName: order.customerName })}
                      >
                        <Download fontSize="small" />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 3 }}>
          <Button size="small" variant="outlined" disabled={page === 0} onClick={() => fetchOrders(page - 1, statusFilter)}>← Prev</Button>
          <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', px: 1 }}>
            {page + 1} / {totalPages}
          </Typography>
          <Button size="small" variant="outlined" disabled={page >= totalPages - 1} onClick={() => fetchOrders(page + 1, statusFilter)}>Next →</Button>
        </Box>
      )}

      {/* Order Detail Dialog */}
      <Dialog open={!!detailOrder} onClose={() => setDetailOrder(null)} maxWidth="sm" fullWidth>
        {detailOrder && (
          <>
            <DialogTitle fontWeight={700}>
              Order #{detailOrder.orderNumber}
              <Typography variant="caption" color="text.secondary" display="block">
                {formatDate(detailOrder.createdAt)}
              </Typography>
            </DialogTitle>
            <DialogContent dividers>
              {/* Customer Info */}
              <Typography variant="subtitle2" fontWeight={700} mb={1}>Customer Details</Typography>
              <Box sx={{ mb: 2, p: 1.5, background: `${ZAP_COLORS.primary}06`, borderRadius: 2 }}>
                <Typography variant="body2"><strong>Name:</strong> {detailOrder.customerName}</Typography>
                <Typography variant="body2"><strong>Email:</strong> {detailOrder.customerEmail}</Typography>
                <Typography variant="body2"><strong>Phone:</strong> {detailOrder.customerPhone}</Typography>
              </Box>
              {/* Delivery Address */}
              <Typography variant="subtitle2" fontWeight={700} mb={1}>Delivery Address</Typography>
              <Box sx={{ mb: 2, p: 1.5, background: `${ZAP_COLORS.primary}06`, borderRadius: 2 }}>
                <Typography variant="body2">{detailOrder.address?.name} — {detailOrder.address?.phone}</Typography>
                <Typography variant="body2">{detailOrder.address?.line1}, {detailOrder.address?.city}, {detailOrder.address?.state} - {detailOrder.address?.pincode}</Typography>
              </Box>
              {/* Items */}
              <Typography variant="subtitle2" fontWeight={700} mb={1}>Items ({detailOrder.items?.length})</Typography>
              {detailOrder.items?.map((item, i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">{item.name} × {item.quantity}</Typography>
                  <Typography variant="body2" fontWeight={600}>₹{(item.discountedPrice || item.mrp) * item.quantity}</Typography>
                </Box>
              ))}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 1, borderTop: `1px solid ${ZAP_COLORS.border}` }}>
                <Typography fontWeight={700}>Total</Typography>
                <Typography fontWeight={800} color="primary">₹{detailOrder.total}</Typography>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => generateInvoicePDF(detailOrder, { displayName: detailOrder.customerName })} startIcon={<Download />}>
                Invoice
              </Button>
              <Button onClick={() => setDetailOrder(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default AdminOrders;
