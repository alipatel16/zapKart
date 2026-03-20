import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Typography, Chip, CircularProgress, useMediaQuery, useTheme } from '@mui/material';
import { ChevronRight } from '@mui/icons-material';
import {
  collection, query, where, orderBy, onSnapshot, limit,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { getOrderStatusColor } from '../../utils/helpers';
import { ZAP_COLORS } from '../../theme';

const ACTIVE_STATUSES = ['placed', 'confirmed', 'processing', 'packed', 'enroute'];

const STATUS_LABEL = {
  placed:     'Order Placed',
  confirmed:  'Confirmed',
  processing: 'Processing',
  packed:     'Packed',
  enroute:    'Out for Delivery',
};

const STATUS_EMOJI = {
  placed: '📋', confirmed: '✅', processing: '⚙️', packed: '📦', enroute: '🛵',
};

const ActiveOrdersBar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const scrollRef = useRef(null);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const hidden = location.pathname.startsWith('/admin') || location.pathname === '/login';

  useEffect(() => {
    if (!user || hidden) { setLoading(false); return; }
    const q = query(
      collection(db, COLLECTIONS.ORDERS),
      where('userId', '==', user.uid),
      where('status', 'in', ACTIVE_STATUSES),
      orderBy('createdAt', 'desc'),
      limit(10),
    );
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [user?.uid, hidden]);

  if (hidden || loading || orders.length === 0) return null;

  const handleClick = (order) => navigate(`/orders?highlight=${order.id}`);

  // ── Single pill ──────────────────────────────────────────────────────────
  const Pill = ({ order }) => {
    const color = getOrderStatusColor(order.status);
    const isMoving = order.status === 'enroute' || order.status === 'processing';
    return (
      <Box
        onClick={() => handleClick(order)}
        sx={{
          flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 0.8,
          px: 1.2, py: 0.5,
          borderRadius: 10,
          background: '#fff',
          border: `1.5px solid ${color}40`,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          boxShadow: `0 1px 6px ${color}18`,
          transition: 'transform 0.15s',
          '&:active': { transform: 'scale(0.96)' },
        }}
      >
        {/* Pulsing dot */}
        <Box sx={{
          width: 6, height: 6, borderRadius: '50%',
          background: color, flexShrink: 0,
          animation: isMoving ? 'dotPulse 1.2s ease-in-out infinite' : 'none',
          '@keyframes dotPulse': {
            '0%,100%': { opacity: 1 },
            '50%': { opacity: 0.3 },
          },
        }} />

        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: ZAP_COLORS.textPrimary }}>
          #{order.orderNumber?.slice(-6)}
        </Typography>

        <Typography sx={{ fontSize: '0.68rem', color, fontWeight: 600 }}>
          {STATUS_EMOJI[order.status]} {STATUS_LABEL[order.status] || order.status}
        </Typography>

        <ChevronRight sx={{ fontSize: 13, color: ZAP_COLORS.textMuted }} />
      </Box>
    );
  };

  // ── MOBILE: thin fixed strip just above BottomNav ───────────────────────
  if (isMobile) {
    return (
      <Box sx={{
        position: 'fixed',
        bottom: 64,
        left: 0, right: 0,
        zIndex: 99,
        px: 1.5, py: 0.6,
        display: 'flex', alignItems: 'center', gap: 1,
        background: 'rgba(255,248,245,0.96)',
        backdropFilter: 'blur(8px)',
        borderTop: `1px solid ${ZAP_COLORS.border}`,
      }}>
        {/* Label */}
        <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: ZAP_COLORS.primary, flexShrink: 0, letterSpacing: '0.04em' }}>
          ORDERS
        </Typography>

        {/* Scrollable pills */}
        <Box
          ref={scrollRef}
          sx={{
            display: 'flex', gap: 0.8, overflowX: 'auto', flex: 1,
            scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {orders.map((order) => <Pill key={order.id} order={order} />)}
        </Box>
      </Box>
    );
  }

  // ── DESKTOP: slim horizontal bar inside page content ────────────────────
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
      px: 2, py: 1,
      borderRadius: 2.5,
      background: `${ZAP_COLORS.primary}08`,
      border: `1px solid ${ZAP_COLORS.primary}20`,
      mb: 2,
    }}>
      <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: ZAP_COLORS.primary, flexShrink: 0 }}>
        🛵 Active Orders
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {orders.map((order) => <Pill key={order.id} order={order} />)}
      </Box>
    </Box>
  );
};

export default ActiveOrdersBar;