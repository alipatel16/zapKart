import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Typography, IconButton, Divider, useMediaQuery, useTheme,
  AppBar, Toolbar, Avatar, Tooltip, Chip, Button,
} from '@mui/material';
import {
  Dashboard, Inventory2, ShoppingBag, Category, ViewCarousel,
  LocalOffer, TrendingUp, ShoppingCart, FlashOn, Menu as MenuIcon,
  ChevronLeft, Logout, Home, Store, SwapHoriz, StarBorder,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import AdminStoreSelector from '../../components/admin/AdminStoreSelector';
import { ZAP_COLORS } from '../../theme';

import { useAdminOrderNotifications } from '../hooks/useAdminOrderNotifications';


const DRAWER_WIDTH = 230;
const MINI_WIDTH = 64;

const navItems = [
  { path: '/admin',             label: 'Dashboard',    icon: <Dashboard />,   exact: true },
  { path: '/admin/orders',      label: 'Orders',       icon: <ShoppingBag /> },
  { path: '/admin/products',    label: 'Products',     icon: <Inventory2 /> },
  { path: '/admin/categories',  label: 'Categories',   icon: <Category /> },
  { path: '/admin/inventory',   label: 'Inventory',    icon: <TrendingUp /> },
  { path: '/admin/purchases',   label: 'Purchases',    icon: <ShoppingCart /> },
  { path: '/admin/banners',     label: 'Banners',      icon: <ViewCarousel /> },
  { path: '/admin/coupons',     label: 'Coupons',      icon: <LocalOffer /> },
  { path: '/admin/stores',      label: 'Stores',       icon: <Store /> },
  { path: '/admin/sales',       label: 'Sales Report', icon: <TrendingUp /> },
  { path: '/admin/top-picks',   label: 'Top Picks',    icon: <StarBorder /> },
];

const AdminLayout = () => {
  useAdminOrderNotifications();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(!isMobile);
  const [collapsed, setCollapsed] = useState(false);
  const [storeSelectorOpen, setStoreSelectorOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userProfile, logout, isAdmin } = useAuth();
  const { adminStore } = useStore();

  const needsStoreSelection = !adminStore && location.pathname !== '/admin/stores';
  const effectiveWidth = isMobile ? 0 : collapsed ? MINI_WIDTH : DRAWER_WIDTH;

  if (!isAdmin) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 2, p: 3 }}>
        <Box sx={{ fontSize: '3rem' }}>🔒</Box>
        <Typography variant="h5" fontWeight={700}>Access Denied</Typography>
        <Typography color="text.secondary" textAlign="center">You don't have admin access.</Typography>
        <Button variant="contained" onClick={() => navigate('/')}>Go Home</Button>
      </Box>
    );
  }

  // When store selector closes after a selection — reload so all store-scoped
  // data refreshes and land on dashboard
  const handleStoreSelectorClose = () => {
    setStoreSelectorOpen(false);
    navigate('/admin');
    window.location.reload();
  };

  // ── Drawer content defined as plain JSX (not a nested component) so hooks
  //    are not called conditionally and refs are stable ─────────────────────
  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Logo */}
      <Box sx={{
        px: collapsed ? 1 : 2, py: 2.5,
        display: 'flex', alignItems: 'center', gap: 1.5,
        borderBottom: `1px solid rgba(255,255,255,0.1)`,
      }}>
        <Box sx={{
          width: 34, height: 34, borderRadius: 2, flexShrink: 0,
          background: `linear-gradient(135deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.primaryDark})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <FlashOn sx={{ color: '#fff', fontSize: 20 }} />
        </Box>
        {!collapsed && (
          <Box>
            <Typography sx={{ color: '#fff', fontFamily: "'Syne', sans-serif", fontWeight: 800, lineHeight: 1.1 }}>ZAP</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', letterSpacing: '0.1em' }}>ADMIN</Typography>
          </Box>
        )}
      </Box>

      {/* Active store selector */}
      <Box
        onClick={() => setStoreSelectorOpen(true)}
        sx={{
          px: collapsed ? 1 : 2, py: 1.2,
          borderBottom: `1px solid rgba(255,255,255,0.08)`,
          cursor: 'pointer',
          '&:hover': { background: 'rgba(255,255,255,0.04)' },
        }}
      >
        {collapsed ? (
          <Tooltip title={adminStore ? `Store: ${adminStore.name}` : 'Select Store'} placement="right">
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Store sx={{ color: adminStore ? ZAP_COLORS.primary : 'rgba(255,255,255,0.4)', fontSize: 22 }} />
            </Box>
          </Tooltip>
        ) : adminStore ? (
          <Box>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.62rem', letterSpacing: '0.08em', display: 'block' }}>
              ACTIVE STORE
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={700} sx={{ color: '#fff' }} noWrap>{adminStore.name}</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }} noWrap>
                  {adminStore.address?.split(',')[0]}
                </Typography>
              </Box>
              <SwapHoriz sx={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', ml: 0.5 }} />
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Store sx={{ color: ZAP_COLORS.warning, fontSize: 18 }} />
            <Box>
              <Typography variant="caption" sx={{ color: ZAP_COLORS.warning, fontWeight: 700, fontSize: '0.75rem' }}>
                No Store Selected
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', fontSize: '0.65rem' }}>
                Tap to select
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      {/* Nav items */}
      <List sx={{ px: 1, py: 1.5, flex: 1, overflowY: 'auto' }}>
        {navItems.map((item) => {
          const active = item.exact
            ? location.pathname === item.path
            : location.pathname.startsWith(item.path);
          return (
            <Tooltip key={item.path} title={collapsed ? item.label : ''} placement="right" arrow>
              {/* span wrapper needed so Tooltip can attach its ref when child is a button */}
              <span style={{ display: 'block', marginBottom: 2 }}>
                <ListItemButton
                  onClick={() => { if (isMobile) setDrawerOpen(false); setTimeout(() => { navigate(item.path); }); }}
                  sx={{
                    borderRadius: 2,
                    background: active ? `${ZAP_COLORS.primary}25` : 'transparent',
                    color: active ? ZAP_COLORS.primary : 'rgba(255,255,255,0.65)',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    minHeight: 42, px: 1.5,
                    '&:hover': { background: `${ZAP_COLORS.primary}15`, color: '#fff' },
                  }}
                >
                  <ListItemIcon sx={{ color: 'inherit', minWidth: collapsed ? 0 : 36, justifyContent: 'center' }}>
                    {React.cloneElement(item.icon, { sx: { fontSize: 20 } })}
                  </ListItemIcon>
                  {!collapsed && (
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: active ? 600 : 400 }}
                    />
                  )}
                </ListItemButton>
              </span>
            </Tooltip>
          );
        })}
      </List>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

      {/* Bottom actions */}
      <Box sx={{ p: 1.5 }}>
        <ListItemButton
          onClick={() => navigate('/')}
          sx={{ borderRadius: 2, color: 'rgba(255,255,255,0.5)', px: 1.5, mb: 0.5, justifyContent: collapsed ? 'center' : 'flex-start' }}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: collapsed ? 0 : 36, justifyContent: 'center' }}>
            <Home sx={{ fontSize: 20 }} />
          </ListItemIcon>
          {!collapsed && <ListItemText primary="User App" primaryTypographyProps={{ fontSize: '0.82rem' }} />}
        </ListItemButton>

        <ListItemButton
          onClick={logout}
          sx={{ borderRadius: 2, color: '#EF4444', px: 1.5, justifyContent: collapsed ? 'center' : 'flex-start' }}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: collapsed ? 0 : 36, justifyContent: 'center' }}>
            <Logout sx={{ fontSize: 20 }} />
          </ListItemIcon>
          {!collapsed && <ListItemText primary="Logout" primaryTypographyProps={{ fontSize: '0.82rem' }} />}
        </ListItemButton>

        {!collapsed && (
          <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar src={user?.photoURL} sx={{ width: 28, height: 28, fontSize: '0.75rem' }}>
              {user?.displayName?.[0]}
            </Avatar>
            <Box sx={{ overflow: 'hidden' }}>
              <Typography sx={{ color: '#fff', fontSize: '0.78rem', fontWeight: 600 }} noWrap>
                {userProfile?.displayName}
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }} noWrap>Admin</Typography>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', background: '#F8F9FC' }}>

      {/* Desktop sidebar */}
      {!isMobile && (
        <Box sx={{
          width: effectiveWidth, flexShrink: 0,
          transition: 'width 0.25s ease',
          position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 200,
        }}>
          <Box sx={{ width: '100%', height: '100%', background: ZAP_COLORS.secondary, overflowY: 'auto', overflowX: 'hidden' }}>
            {drawerContent}
          </Box>
          {/* Collapse toggle */}
          <IconButton
            size="small"
            onClick={() => setCollapsed(!collapsed)}
            sx={{
              position: 'absolute', right: -12, top: 72, zIndex: 300,
              background: '#fff', border: `1px solid ${ZAP_COLORS.border}`, width: 24, height: 24,
              '&:hover': { background: ZAP_COLORS.primary, color: '#fff', borderColor: ZAP_COLORS.primary },
              transition: 'all 0.2s',
            }}
          >
            <ChevronLeft sx={{ fontSize: 14, transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s' }} />
          </IconButton>
        </Box>
      )}

      {/* Mobile Drawer */}
      {isMobile && (
        <Drawer
          anchor="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          PaperProps={{ sx: { width: DRAWER_WIDTH, background: ZAP_COLORS.secondary } }}
        >
          {drawerContent}
        </Drawer>
      )}

      {/* Main content area */}
      <Box sx={{ flex: 1, ml: `${effectiveWidth}px`, transition: 'margin-left 0.25s ease', minWidth: 0 }}>

        {/* Mobile top bar */}
        {isMobile && (
          <AppBar position="sticky" elevation={0} sx={{ background: '#fff', borderBottom: `1px solid ${ZAP_COLORS.border}` }}>
            <Toolbar sx={{ gap: 1 }}>
              <IconButton size="small" onClick={() => setDrawerOpen(true)}>
                <MenuIcon />
              </IconButton>
              <FlashOn sx={{ color: ZAP_COLORS.primary }} />
              <Typography fontFamily="'Syne', sans-serif" fontWeight={800}>ZAP Admin</Typography>
              {adminStore && (
                <Chip
                  label={adminStore.name}
                  size="small"
                  onClick={() => setStoreSelectorOpen(true)}
                  icon={<Store sx={{ fontSize: '14px !important' }} />}
                  sx={{ ml: 'auto', fontSize: '0.7rem', background: `${ZAP_COLORS.primary}15`, color: ZAP_COLORS.primary }}
                />
              )}
            </Toolbar>
          </AppBar>
        )}

        {/* Warning banner when no store selected */}
        {!adminStore && location.pathname !== '/admin/stores' && (
          <Box sx={{
            px: 3, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5,
            background: `${ZAP_COLORS.warning}15`,
            borderBottom: `1px solid ${ZAP_COLORS.warning}30`,
          }}>
            <Store sx={{ color: ZAP_COLORS.warning, fontSize: 18 }} />
            <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
              No store selected — please select a store to manage its data.
            </Typography>
            <Button size="small" variant="outlined" color="warning" onClick={() => setStoreSelectorOpen(true)}>
              Select Store
            </Button>
          </Box>
        )}

        <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>

      {/* Store selector modal */}
      <AdminStoreSelector
        open={storeSelectorOpen || needsStoreSelection}
        onClose={needsStoreSelection ? undefined : handleStoreSelectorClose}
        required={needsStoreSelection}
      />
    </Box>
  );
};

export default AdminLayout;