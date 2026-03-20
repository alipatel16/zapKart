import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Grid, Card, CardContent, Typography, Paper, Button,
  Chip, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Select, MenuItem, CircularProgress, Alert,
} from '@mui/material';
import {
  TrendingUp, ShoppingBag, Inventory2, People,
  LocalShipping, AttachMoney, Warning,
} from '@mui/icons-material';
import {
  collection, query, where, orderBy, limit, getDocs,
  getCountFromServer, Timestamp,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { getOrderStatusColor, ORDER_STATUSES, formatCurrency, formatDate } from '../../utils/helpers';
import { ZAP_COLORS } from '../../theme';
import { useStore } from '../../context/StoreContext';

const StatCard = ({ icon, label, value, sub, color, loading }) => (
  <Card elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, height: '100%' }}>
    <CardContent sx={{ p: 2.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={500}>{label}</Typography>
          {loading ? (
            <CircularProgress size={20} sx={{ display: 'block', mt: 1 }} />
          ) : (
            <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif", mt: 0.3 }}>
              {value}
            </Typography>
          )}
          {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
        </Box>
        <Box sx={{
          width: 44, height: 44, borderRadius: 2,
          background: `${color || ZAP_COLORS.primary}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {React.cloneElement(icon, { sx: { color: color || ZAP_COLORS.primary, fontSize: 22 } })}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { adminStore } = useStore();
  const [stats, setStats] = useState({ orders: 0, revenue: 0, products: 0, users: 0, pendingOrders: 0, lowStock: 0 });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('today');

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const now = new Date();
        let startDate;
        if (dateRange === 'today') startDate = new Date(now.setHours(0, 0, 0, 0));
        else if (dateRange === 'week') { startDate = new Date(); startDate.setDate(startDate.getDate() - 7); }
        else if (dateRange === 'month') { startDate = new Date(); startDate.setMonth(startDate.getMonth() - 1); }
        else startDate = new Date(0);

        const startTs = Timestamp.fromDate(startDate);

        const [ordersSnap, allOrdersSnap, productsSnap, usersSnap, pendingSnap, recentSnap] = await Promise.all([
          getCountFromServer(query(collection(db, COLLECTIONS.ORDERS), where('createdAt', '>=', startTs))),
          getDocs(query(collection(db, COLLECTIONS.ORDERS), where('createdAt', '>=', startTs))),
          getCountFromServer(query(collection(db, COLLECTIONS.PRODUCTS), where('active', '==', true))),
          getCountFromServer(collection(db, COLLECTIONS.USERS)),
          getCountFromServer(query(collection(db, COLLECTIONS.ORDERS), where('status', '==', 'placed'))),
          getDocs(query(collection(db, COLLECTIONS.ORDERS), orderBy('createdAt', 'desc'), limit(8))),
        ]);

        const revenue = allOrdersSnap.docs
          .filter((d) => d.data().paymentStatus === 'paid' || d.data().paymentMethod === 'cod')
          .reduce((sum, d) => sum + (d.data().total || 0), 0);

        // Low stock check
        const invSnap = await getDocs(query(collection(db, COLLECTIONS.PRODUCTS), where('stock', '<=', 5), where('active', '==', true)));

        setStats({
          orders: ordersSnap.data().count,
          revenue,
          products: productsSnap.data().count,
          users: usersSnap.data().count,
          pendingOrders: pendingSnap.data().count,
          lowStock: invSnap.size,
        });
        setRecentOrders(recentSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Dashboard stats error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [dateRange, adminStore?.id]);

  const quickLinks = [
    { label: 'Add Product', path: '/admin/products/new', color: ZAP_COLORS.primary, icon: '📦' },
    { label: 'Manage Orders', path: '/admin/orders', color: ZAP_COLORS.info, icon: '🛵' },
    { label: 'Inventory', path: '/admin/inventory', color: ZAP_COLORS.accentGreen, icon: '📊' },
    { label: 'Edit Banners', path: '/admin/banners', color: ZAP_COLORS.accent, icon: '🖼️' },
    { label: 'Categories', path: '/admin/categories', color: '#8B5CF6', icon: '🗂️' },
    { label: 'Purchases', path: '/admin/purchases', color: '#EC4899', icon: '🛒' },
  ];

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif" }}>
            Dashboard ⚡
          </Typography>
          <Typography variant="body2" color="text.secondary">Zap Admin Panel</Typography>
        </Box>
        <Select
          value={dateRange} onChange={(e) => setDateRange(e.target.value)}
          size="small" sx={{ fontSize: '0.85rem', borderRadius: 2, minWidth: 120 }}
        >
          <MenuItem value="today">Today</MenuItem>
          <MenuItem value="week">Last 7 Days</MenuItem>
          <MenuItem value="month">Last 30 Days</MenuItem>
          <MenuItem value="all">All Time</MenuItem>
        </Select>
      </Box>

      {/* Alerts */}
      {stats.pendingOrders > 0 && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }} icon="🔔">
          <strong>{stats.pendingOrders} new orders</strong> waiting to be confirmed.
          <Button size="small" onClick={() => navigate('/admin/orders')} sx={{ ml: 1 }}>View</Button>
        </Alert>
      )}
      {stats.lowStock > 0 && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} icon={<Warning />}>
          <strong>{stats.lowStock} products</strong> are low in stock.
          <Button size="small" onClick={() => navigate('/admin/inventory')} sx={{ ml: 1 }}>View</Button>
        </Alert>
      )}

      {/* Stats Grid */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { icon: <ShoppingBag />, label: 'Orders', value: stats.orders, color: ZAP_COLORS.primary },
          { icon: <AttachMoney />, label: 'Revenue', value: formatCurrency(stats.revenue), color: ZAP_COLORS.accentGreen },
          { icon: <Inventory2 />, label: 'Products', value: stats.products, color: ZAP_COLORS.info },
          { icon: <People />, label: 'Users', value: stats.users, color: '#8B5CF6' },
        ].map((s) => (
          <Grid item xs={6} sm={3} key={s.label}>
            <StatCard {...s} loading={loading} />
          </Grid>
        ))}
      </Grid>

      {/* Quick Links */}
      <Typography variant="subtitle1" fontWeight={700} mb={1.5}>Quick Actions</Typography>
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        {quickLinks.map((l) => (
          <Grid item xs={6} sm={4} md={2} key={l.label}>
            <Box
              onClick={() => navigate(l.path)}
              sx={{
                p: 2, borderRadius: 3, textAlign: 'center', cursor: 'pointer',
                border: `1px solid ${ZAP_COLORS.border}`,
                background: '#fff',
                transition: 'all 0.2s',
                '&:hover': { background: `${l.color}10`, borderColor: `${l.color}40`, transform: 'translateY(-2px)' },
                '&:active': { transform: 'scale(0.97)' },
              }}
            >
              <Box sx={{ fontSize: '1.8rem', mb: 0.5 }}>{l.icon}</Box>
              <Typography variant="caption" fontWeight={600} sx={{ color: l.color, fontSize: '0.75rem' }}>
                {l.label}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Recent Orders */}
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle1" fontWeight={700}>Recent Orders</Typography>
        <Button size="small" onClick={() => navigate('/admin/orders')}>View All →</Button>
      </Box>
      <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ background: `${ZAP_COLORS.primary}08` }}>
              {['Order #', 'Customer', 'Items', 'Total', 'Payment', 'Status', 'Date'].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.78rem', color: ZAP_COLORS.textSecondary }}>
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : recentOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 3, color: ZAP_COLORS.textMuted }}>
                  No orders yet
                </TableCell>
              </TableRow>
            ) : recentOrders.map((order) => {
              const statusColor = getOrderStatusColor(order.status);
              return (
                <TableRow
                  key={order.id} hover
                  onClick={() => navigate(`/admin/orders/${order.id}`)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={{ fontSize: '0.78rem', fontWeight: 600 }}>#{order.orderNumber}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>{order.customerName || '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}>{order.items?.length}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', fontWeight: 600 }}>₹{order.total}</TableCell>
                  <TableCell>
                    <Chip
                      label={order.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
                      size="small"
                      sx={{
                        fontSize: '0.65rem', height: 18,
                        background: order.paymentStatus === 'paid' ? `${ZAP_COLORS.accentGreen}18` : `${ZAP_COLORS.warning}18`,
                        color: order.paymentStatus === 'paid' ? ZAP_COLORS.accentGreen : ZAP_COLORS.warning,
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={ORDER_STATUSES.find((s) => s.key === order.status)?.label || order.status}
                      size="small"
                      sx={{
                        fontSize: '0.65rem', height: 18,
                        background: `${statusColor}18`, color: statusColor,
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.72rem', color: ZAP_COLORS.textMuted }}>
                    {formatDate(order.createdAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default AdminDashboard;
