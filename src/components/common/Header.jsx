import React, { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar, Toolbar, Box, Typography, IconButton, InputBase,
  Badge, Avatar, Drawer, List, ListItem, ListItemIcon,
  ListItemText, Divider, Button, Slide, Paper, useScrollTrigger,
} from '@mui/material';
import {
  Search, ShoppingCart, Person, Menu as MenuIcon,
  Home, Category, History, LocationOn, Close,
  Login, Logout, Settings, FlashOn,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { ZAP_COLORS } from '../../theme';

const HideOnScroll = ({ children }) => {
  const trigger = useScrollTrigger({ threshold: 10 });
  return (
    <Slide appear={false} direction="down" in={!trigger}>
      {children}
    </Slide>
  );
};

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userProfile, logout } = useAuth();
  const { totalItems } = useCart();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = useCallback((e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  }, [searchQuery, navigate]);

  const handleLogout = async () => {
    await logout();
    setDrawerOpen(false);
    navigate('/');
  };

  const navItems = [
    { label: 'Home', icon: <Home />, path: '/' },
    { label: 'Categories', icon: <Category />, path: '/categories' },
    { label: 'My Orders', icon: <History />, path: '/orders' },
    { label: 'Profile', icon: <Person />, path: '/profile' },
  ];

  return (
    <>
      <HideOnScroll>
        <AppBar position="sticky" elevation={0}>
          <Toolbar sx={{ px: { xs: 1.5, sm: 2 }, minHeight: { xs: 56, sm: 64 }, gap: 1 }}>
            {/* Hamburger */}
            <IconButton size="small" onClick={() => setDrawerOpen(true)} sx={{ color: ZAP_COLORS.textPrimary }}>
              <MenuIcon />
            </IconButton>

            {/* Logo */}
            <Box
              onClick={() => navigate('/')}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}
            >
              <Box
                sx={{
                  width: 32, height: 32, borderRadius: 2,
                  background: `linear-gradient(135deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.primaryDark})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <FlashOn sx={{ color: '#fff', fontSize: 20 }} />
              </Box>
              <Typography
                variant="h6"
                sx={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '1.2rem', display: { xs: 'none', sm: 'block' } }}
              >
                ZAP
              </Typography>
            </Box>

            {/* Location chip */}
            <Box
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.3,
                px: 1, py: 0.5, borderRadius: 2,
                background: `${ZAP_COLORS.primary}10`,
                cursor: 'pointer', flex: 1, maxWidth: 180,
                overflow: 'hidden',
              }}
              onClick={() => navigate('/profile')}
            >
              <LocationOn sx={{ fontSize: 14, color: ZAP_COLORS.primary, flexShrink: 0 }} />
              <Typography variant="caption" noWrap sx={{ color: ZAP_COLORS.primary, fontWeight: 600, fontSize: '0.72rem' }}>
                {userProfile?.addresses?.[0]?.city || 'Set Location'}
              </Typography>
            </Box>

            <Box sx={{ flex: 1 }} />

            {/* Search icon */}
            <IconButton size="small" onClick={() => setSearchOpen(true)} sx={{ color: ZAP_COLORS.textSecondary }}>
              <Search />
            </IconButton>

            {/* Cart */}
            <IconButton size="small" onClick={() => navigate('/cart')} sx={{ color: ZAP_COLORS.textPrimary }}>
              <Badge badgeContent={totalItems} color="primary">
                <ShoppingCart />
              </Badge>
            </IconButton>

            {/* Avatar */}
            {user ? (
              <Avatar
                src={user.photoURL}
                sx={{ width: 32, height: 32, cursor: 'pointer', fontSize: '0.85rem' }}
                onClick={() => navigate('/profile')}
              >
                {user.displayName?.[0] || user.email?.[0]}
              </Avatar>
            ) : (
              <Button
                size="small"
                variant="contained"
                onClick={() => navigate('/login', { state: { from: location } })}
                sx={{ minWidth: 0, px: 1.5, py: 0.5, fontSize: '0.78rem' }}
              >
                Login
              </Button>
            )}
          </Toolbar>
        </AppBar>
      </HideOnScroll>

      {/* Search Overlay */}
      {searchOpen && (
        <Box
          sx={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(26,26,46,0.7)', backdropFilter: 'blur(8px)',
            zIndex: 1400, display: 'flex', flexDirection: 'column',
            alignItems: 'center', pt: { xs: 4, sm: 8 }, px: 2,
          }}
          onClick={(e) => e.target === e.currentTarget && setSearchOpen(false)}
        >
          <Paper
            elevation={8}
            sx={{ width: '100%', maxWidth: 600, borderRadius: 3, overflow: 'hidden' }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5 }}>
              <Search sx={{ color: ZAP_COLORS.primary, mr: 1.5 }} />
              <InputBase
                autoFocus
                fullWidth
                placeholder="Search for products, categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearch}
                sx={{ fontSize: '1rem', fontFamily: "'DM Sans', sans-serif" }}
              />
              <IconButton size="small" onClick={() => setSearchOpen(false)}>
                <Close fontSize="small" />
              </IconButton>
            </Box>
          </Paper>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', mt: 2 }}>
            Press Enter to search
          </Typography>
        </Box>
      )}

      {/* Side Drawer */}
      <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: { width: 280, background: ZAP_COLORS.secondary, color: '#fff', pt: 2 },
        }}
      >
        {/* Drawer header */}
        <Box sx={{ px: 2.5, pb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{
                width: 36, height: 36, borderRadius: 2,
                background: `linear-gradient(135deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.primaryDark})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FlashOn sx={{ color: '#fff', fontSize: 22 }} />
              </Box>
              <Typography sx={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '1.3rem' }}>ZAP</Typography>
            </Box>
            <IconButton size="small" onClick={() => setDrawerOpen(false)} sx={{ color: 'rgba(255,255,255,0.6)' }}>
              <Close />
            </IconButton>
          </Box>

          {user ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Avatar src={user.photoURL} sx={{ width: 44, height: 44 }}>
                {user.displayName?.[0]}
              </Avatar>
              <Box>
                <Typography fontWeight={600} fontSize="0.95rem">{user.displayName || 'User'}</Typography>
                <Typography fontSize="0.75rem" sx={{ color: 'rgba(255,255,255,0.5)' }} noWrap>{user.email}</Typography>
              </Box>
            </Box>
          ) : (
            <Button
              fullWidth variant="contained" startIcon={<Login />}
              onClick={() => { navigate('/login'); setDrawerOpen(false); }}
            >
              Login / Sign Up
            </Button>
          )}
        </Box>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

        <List sx={{ px: 1 }}>
          {navItems.map((item) => (
            <ListItem
              key={item.path}
              button
              onClick={() => { navigate(item.path); setDrawerOpen(false); }}
              sx={{
                borderRadius: 2, mb: 0.5,
                background: location.pathname === item.path ? `${ZAP_COLORS.primary}20` : 'transparent',
                color: location.pathname === item.path ? ZAP_COLORS.primary : 'rgba(255,255,255,0.8)',
                '&:hover': { background: `${ZAP_COLORS.primary}15` },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 500, fontSize: '0.9rem' }} />
            </ListItem>
          ))}
        </List>

        {user && (
          <>
            <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mt: 1 }} />
            <List sx={{ px: 1 }}>
              <ListItem button onClick={handleLogout} sx={{ borderRadius: 2, color: '#EF4444', '&:hover': { background: '#EF444415' } }}>
                <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}><Logout /></ListItemIcon>
                <ListItemText primary="Logout" primaryTypographyProps={{ fontWeight: 500, fontSize: '0.9rem' }} />
              </ListItem>
            </List>
          </>
        )}
      </Drawer>
    </>
  );
};

export default Header;
