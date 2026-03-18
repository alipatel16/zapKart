import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Drawer, List, ListItem, ListItemIcon, ListItemText,
  Typography, IconButton, Divider, useMediaQuery, useTheme,
  AppBar, Toolbar, Avatar, Tooltip,
} from '@mui/material';
import {
  Dashboard, Inventory2, ShoppingBag, Category, ViewCarousel,
  LocalOffer, TrendingUp, ShoppingCart, FlashOn, Menu as MenuIcon,
  ChevronLeft, Logout, Home,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { ZAP_COLORS } from '../../theme';

const DRAWER_WIDTH = 220;
const MINI_WIDTH = 64;

const navItems = [
  { path: '/admin', label: 'Dashboard', icon: <Dashboard />, exact: true },
  { path: '/admin/orders', label: 'Orders', icon: <ShoppingBag /> },
  { path: '/admin/products', label: 'Products', icon: <Inventory2 /> },
  { path: '/admin/categories', label: 'Categories', icon: <Category /> },
  { path: '/admin/inventory', label: 'Inventory', icon: <TrendingUp /> },
  { path: '/admin/purchases', label: 'Purchases', icon: <ShoppingCart /> },
  { path: '/admin/banners', label: 'Banners', icon: <ViewCarousel /> },
  { path: '/admin/coupons', label: 'Coupons', icon: <LocalOffer /> },
  { path: '/admin/sales', label: 'Sales Report', icon: <TrendingUp /> },
];

const AdminLayout = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(!isMobile);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userProfile, logout, isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 2 }}>
        <Typography variant="h5" fontWeight={700}>Access Denied</Typography>
        <Typography color="text.secondary">You don't have admin access.</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <button onClick={() => navigate('/')} style={{ padding: '8px 16px', cursor: 'pointer' }}>Go Home</button>
        </Box>
      </Box>
    );
  }

  const effectiveWidth = isMobile ? 0 : collapsed ? MINI_WIDTH : DRAWER_WIDTH;

  const DrawerContent = () => (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Logo */}
      <Box sx={{
        px: collapsed ? 1 : 2, py: 2.5,
        display: 'flex', alignItems: 'center', gap: 1.5,
        borderBottom: `1px solid rgba(255,255,255,0.1)`,
      }}>
        <Box sx={{
          width: 34, height: 34, borderRadius: 2,
          background: `linear-gradient(135deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.primaryDark})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <FlashOn sx={{ color: '#fff', fontSize: 20 }} />
        </Box>
        {!collapsed && (
          <Box sx={{ overflow: 'hidden' }}>
            <Typography sx={{ color: '#fff', fontFamily: "'Syne', sans-serif", fontWeight: 800, lineHeight: 1.1 }}>ZAP</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', letterSpacing: '0.1em' }}>ADMIN</Typography>
          </Box>
        )}
      </Box>

      {/* Nav items */}
      <List sx={{ px: 1, py: 1.5, flex: 1 }}>
        {navItems.map((item) => {
          const active = item.exact
            ? location.pathname === item.path
            : location.pathname.startsWith(item.path);
          return (
            <Tooltip key={item.path} title={collapsed ? item.label : ''} placement="right">
              <ListItem
                button
                onClick={() => { navigate(item.path); if (isMobile) setDrawerOpen(false); }}
                sx={{
                  borderRadius: 2, mb: 0.3, px: collapsed ? 1.5 : 1.5,
                  background: active ? `${ZAP_COLORS.primary}25` : 'transparent',
                  color: active ? ZAP_COLORS.primary : 'rgba(255,255,255,0.65)',
                  '&:hover': { background: `${ZAP_COLORS.primary}15`, color: '#fff' },
                  minHeight: 42,
                  justifyContent: collapsed ? 'center' : 'flex-start',
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
              </ListItem>
            </Tooltip>
          );
        })}
      </List>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

      {/* Bottom actions */}
      <Box sx={{ p: 1.5 }}>
        <Tooltip title={collapsed ? 'Go to User App' : ''} placement="right">
          <ListItem
            button onClick={() => navigate('/')}
            sx={{ borderRadius: 2, color: 'rgba(255,255,255,0.5)', px: 1.5, justifyContent: collapsed ? 'center' : 'flex-start', mb: 0.5 }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: collapsed ? 0 : 36, justifyContent: 'center' }}>
              <Home sx={{ fontSize: 20 }} />
            </ListItemIcon>
            {!collapsed && <ListItemText primary="User App" primaryTypographyProps={{ fontSize: '0.82rem' }} />}
          </ListItem>
        </Tooltip>
        <Tooltip title={collapsed ? 'Logout' : ''} placement="right">
          <ListItem
            button onClick={logout}
            sx={{ borderRadius: 2, color: '#EF4444', px: 1.5, justifyContent: collapsed ? 'center' : 'flex-start' }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: collapsed ? 0 : 36, justifyContent: 'center' }}>
              <Logout sx={{ fontSize: 20 }} />
            </ListItemIcon>
            {!collapsed && <ListItemText primary="Logout" primaryTypographyProps={{ fontSize: '0.82rem' }} />}
          </ListItem>
        </Tooltip>

        {/* User info */}
        {!collapsed && (
          <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar src={user?.photoURL} sx={{ width: 28, height: 28, fontSize: '0.75rem' }}>
              {user?.displayName?.[0]}
            </Avatar>
            <Box sx={{ overflow: 'hidden' }}>
              <Typography sx={{ color: '#fff', fontSize: '0.78rem', fontWeight: 600 }} noWrap>{userProfile?.displayName}</Typography>
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
          position: 'fixed', top: 0, left: 0, height: '100vh',
          zIndex: 200,
        }}>
          <Box sx={{
            width: '100%', height: '100%',
            background: ZAP_COLORS.secondary,
            overflowY: 'auto', overflowX: 'hidden',
          }}>
            <DrawerContent />
          </Box>
          {/* Collapse toggle */}
          <IconButton
            size="small"
            onClick={() => setCollapsed(!collapsed)}
            sx={{
              position: 'absolute', right: -12, top: 72,
              background: '#fff', border: `1px solid ${ZAP_COLORS.border}`,
              width: 24, height: 24, zIndex: 300,
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
          anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)}
          PaperProps={{ sx: { width: DRAWER_WIDTH, background: ZAP_COLORS.secondary } }}
        >
          <DrawerContent />
        </Drawer>
      )}

      {/* Main area */}
      <Box sx={{ flex: 1, ml: `${effectiveWidth}px`, transition: 'margin-left 0.25s ease', minWidth: 0 }}>
        {/* Top bar for mobile */}
        {isMobile && (
          <AppBar position="sticky" elevation={0} sx={{ background: '#fff', borderBottom: `1px solid ${ZAP_COLORS.border}` }}>
            <Toolbar sx={{ gap: 1 }}>
              <IconButton size="small" onClick={() => setDrawerOpen(true)}>
                <MenuIcon />
              </IconButton>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FlashOn sx={{ color: ZAP_COLORS.primary }} />
                <Typography fontFamily="'Syne', sans-serif" fontWeight={800}>ZAP Admin</Typography>
              </Box>
            </Toolbar>
          </AppBar>
        )}

        {/* Page content */}
        <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

export default AdminLayout;
