import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar, Toolbar, Box, Typography, IconButton, InputBase,
  Badge, Avatar, Drawer, List, ListItemButton, ListItemIcon,
  ListItemText, Divider, Button, Slide, Paper, useScrollTrigger,
  CircularProgress,
} from '@mui/material';
import {
  Search, ShoppingCart, Menu as MenuIcon,
  Home, Category, History, LocationOn, Close,
  Login, Logout, FlashOn, KeyboardArrowDown,
} from '@mui/icons-material';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useStore } from '../../context/StoreContext';
import { ZAP_COLORS } from '../../theme';
import LocationPickerDialog from '../user/LocationPickerDialog';

const HideOnScroll = ({ children }) => {
  const trigger = useScrollTrigger({ threshold: 10 });
  return <Slide appear={false} direction="down" in={!trigger}>{children}</Slide>;
};

// ── Smart search suggestion dropdown ────────────────────────────────────────
const SearchOverlay = ({ onClose }) => {
  const navigate = useNavigate();
  const { activeUserStore } = useStore();
  const [query_, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const fetchSuggestions = useCallback(async (term) => {
    if (term.length < 2) { setSuggestions([]); return; }
    setLoading(true);
    try {
      const col = collection(db, COLLECTIONS.PRODUCTS);
      // Keep constraints minimal to avoid composite index requirements.
      // storeId filter applied client-side so only active + limit needed.
      const constraints = [where('active', '==', true), limit(150)];
      const snap = await getDocs(query(col, ...constraints));
      const lower = term.toLowerCase();
      const storeId = activeUserStore?.id;
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => {
          // Store filter applied client-side
          if (storeId && p.storeId !== storeId) return false;
          return (
            p.name?.toLowerCase().includes(lower) ||
            p.description?.toLowerCase().includes(lower) ||
            p.unit?.toLowerCase().includes(lower)
          );
        })
        // Sort: name starts-with first, then contains
        .sort((a, b) => {
          const aStarts = a.name?.toLowerCase().startsWith(lower) ? 0 : 1;
          const bStarts = b.name?.toLowerCase().startsWith(lower) ? 0 : 1;
          return aStarts - bStarts;
        })
        .slice(0, 7);
      setSuggestions(docs);
    } catch { setSuggestions([]); }
    finally { setLoading(false); }
  }, [activeUserStore?.id]);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 250);
  };

  const handleSearch = () => {
    if (!query_.trim()) return;
    navigate(`/search?q=${encodeURIComponent(query_.trim())}`);
    onClose();
  };

  const handleSuggestionClick = (product) => {
    navigate(`/product/${product.id}`);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
    if (e.key === 'Escape') onClose();
  };

  // Highlight matching characters
  const highlight = (text, term) => {
    if (!term || !text) return text;
    const idx = text.toLowerCase().indexOf(term.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <Box component="span" sx={{ color: ZAP_COLORS.primary, fontWeight: 700 }}>
          {text.slice(idx, idx + term.length)}
        </Box>
        {text.slice(idx + term.length)}
      </>
    );
  };

  return (
    <Box
      onClick={(e) => e.target === e.currentTarget && onClose()}
      sx={{
        position: 'fixed', inset: 0,
        background: 'rgba(26,26,46,0.65)', backdropFilter: 'blur(8px)',
        zIndex: 1400, display: 'flex', flexDirection: 'column',
        alignItems: 'center', pt: { xs: 3, sm: 6 }, px: 2,
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 560 }}>
        {/* Search input */}
        <Paper elevation={8} sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5 }}>
            {loading
              ? <CircularProgress size={18} sx={{ color: ZAP_COLORS.primary, mr: 1.5, flexShrink: 0 }} />
              : <Search sx={{ color: ZAP_COLORS.primary, mr: 1.5, flexShrink: 0 }} />
            }
            <InputBase
              inputRef={inputRef}
              fullWidth
              placeholder="Search for products, brands..."
              value={query_}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              sx={{ fontSize: '1rem', fontFamily: "'DM Sans', sans-serif" }}
            />
            {query_ && (
              <IconButton size="small" onClick={() => { setQuery(''); setSuggestions([]); }}>
                <Close fontSize="small" />
              </IconButton>
            )}
          </Box>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <Box sx={{ borderTop: `1px solid ${ZAP_COLORS.border}` }}>
              {suggestions.map((product, i) => (
                <Box
                  key={product.id}
                  onClick={() => handleSuggestionClick(product)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5,
                    px: 2, py: 1.2, cursor: 'pointer',
                    borderBottom: i < suggestions.length - 1 ? `1px solid ${ZAP_COLORS.border}` : 'none',
                    '&:hover': { background: `${ZAP_COLORS.primary}06` },
                    transition: 'background 0.12s',
                  }}
                >
                  {/* Thumbnail */}
                  <Box
                    component="img"
                    src={product.images?.[0] || `https://via.placeholder.com/40x40/FFF8F5/FF6B35?text=${product.name?.[0]}`}
                    alt=""
                    sx={{ width: 36, height: 36, borderRadius: 1.5, objectFit: 'contain', background: `${ZAP_COLORS.primary}08`, flexShrink: 0 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={500} noWrap>
                      {highlight(product.name, query_)}
                    </Typography>
                    {product.unit && (
                      <Typography variant="caption" color="text.secondary">{product.unit}</Typography>
                    )}
                  </Box>
                  <Typography variant="body2" fontWeight={700} sx={{ color: ZAP_COLORS.primary, flexShrink: 0 }}>
                    ₹{product.discountedPrice || product.mrp}
                  </Typography>
                </Box>
              ))}

              {/* See all results */}
              <Box
                onClick={handleSearch}
                sx={{
                  px: 2, py: 1.2, cursor: 'pointer', textAlign: 'center',
                  background: `${ZAP_COLORS.primary}08`,
                  '&:hover': { background: `${ZAP_COLORS.primary}15` },
                }}
              >
                <Typography variant="body2" sx={{ color: ZAP_COLORS.primary, fontWeight: 600 }}>
                  See all results for "{query_}" →
                </Typography>
              </Box>
            </Box>
          )}

          {/* No results state */}
          {query_.length >= 2 && !loading && suggestions.length === 0 && (
            <Box sx={{ px: 2, py: 1.5, borderTop: `1px solid ${ZAP_COLORS.border}`, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No products found for "{query_}"
              </Typography>
            </Box>
          )}
        </Paper>

        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', textAlign: 'center', mt: 1.5 }}>
          Press Enter to search · Esc to close
        </Typography>
      </Box>
    </Box>
  );
};

// ── Main Header ──────────────────────────────────────────────────────────────
const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userProfile, logout } = useAuth();
  const { totalItems } = useCart();
  const { activeUserStore, userLocation } = useStore();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);

  const handleLogout = async () => { await logout(); setDrawerOpen(false); navigate('/'); };

  const navItems = [
    { label: 'Home',       icon: <Home />,     path: '/' },
    { label: 'Categories', icon: <Category />, path: '/categories' },
    { label: 'My Orders',  icon: <History />,  path: '/orders' },
  ];

  const locationText = userLocation?.label || activeUserStore?.name || 'Set Location';

  return (
    <>
      <HideOnScroll>
        <AppBar position="sticky" elevation={0}>
          <Toolbar sx={{ px: { xs: 1.5, sm: 2 }, minHeight: { xs: 56, sm: 64 }, gap: 1 }}>
            <IconButton size="small" onClick={() => setDrawerOpen(true)} sx={{ color: ZAP_COLORS.textPrimary }}>
              <MenuIcon />
            </IconButton>

            {/* Logo */}
            <Box onClick={() => navigate('/')} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
              <Box sx={{ width: 32, height: 32, borderRadius: 2, background: `linear-gradient(135deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.primaryDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FlashOn sx={{ color: '#fff', fontSize: 20 }} />
              </Box>
              <Typography variant="h6" sx={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '1.2rem', display: { xs: 'none', sm: 'block' } }}>ZAP</Typography>
            </Box>

            {/* Location chip */}
            <Box
              onClick={() => setLocationDialogOpen(true)}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.3, px: 1, py: 0.5, borderRadius: 2, background: `${ZAP_COLORS.primary}10`, cursor: 'pointer', flex: 1, maxWidth: 190, overflow: 'hidden', border: `1px solid ${ZAP_COLORS.primary}20`, '&:hover': { background: `${ZAP_COLORS.primary}18` }, '&:active': { transform: 'scale(0.97)' } }}
            >
              <LocationOn sx={{ fontSize: 14, color: ZAP_COLORS.primary, flexShrink: 0 }} />
              <Typography variant="caption" noWrap sx={{ color: ZAP_COLORS.primary, fontWeight: 600, fontSize: '0.72rem', flex: 1 }}>{locationText}</Typography>
              <KeyboardArrowDown sx={{ fontSize: 14, color: ZAP_COLORS.primary, flexShrink: 0 }} />
            </Box>

            <Box sx={{ flex: 1 }} />

            {/* Search */}
            <IconButton size="small" onClick={() => setSearchOpen(true)} sx={{ color: ZAP_COLORS.textSecondary }}>
              <Search />
            </IconButton>

            {/* Cart */}
            <IconButton size="small" onClick={() => navigate('/cart')} sx={{ color: ZAP_COLORS.textPrimary }}>
              <Badge badgeContent={totalItems} color="primary"><ShoppingCart /></Badge>
            </IconButton>

            {/* Avatar / Login */}
            {user ? (
              <Avatar src={user.photoURL} sx={{ width: 32, height: 32, cursor: 'pointer', fontSize: '0.85rem' }} onClick={() => navigate('/profile')}>
                {user.displayName?.[0] || user.email?.[0]}
              </Avatar>
            ) : (
              <Button size="small" variant="contained" onClick={() => navigate('/login', { state: { from: location } })} sx={{ minWidth: 0, px: 1.5, py: 0.5, fontSize: '0.78rem' }}>
                Login
              </Button>
            )}
          </Toolbar>

          {/* Store strip */}
          {activeUserStore && (
            <Box sx={{ px: 2, py: 0.5, background: `linear-gradient(90deg, ${ZAP_COLORS.primary}12, ${ZAP_COLORS.accent}10)`, borderTop: `1px solid ${ZAP_COLORS.primary}15`, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ fontSize: '0.8rem' }}>🏪</Box>
              <Typography variant="caption" sx={{ color: ZAP_COLORS.primary, fontWeight: 600, fontSize: '0.68rem' }}>
                Delivering from: {activeUserStore.name}
              </Typography>
              {activeUserStore.distanceKm !== undefined && (
                <Typography variant="caption" sx={{ color: ZAP_COLORS.textMuted, fontSize: '0.65rem', ml: 0.5 }}>
                  · {activeUserStore.distanceKm < 1 ? `${(activeUserStore.distanceKm * 1000).toFixed(0)}m` : `${activeUserStore.distanceKm.toFixed(1)}km`}
                </Typography>
              )}
            </Box>
          )}
        </AppBar>
      </HideOnScroll>

      {/* Smart search overlay */}
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}

      {/* Side Drawer */}
      <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)} PaperProps={{ sx: { width: 280, background: ZAP_COLORS.secondary, color: '#fff', pt: 2 } }}>
        <Box sx={{ px: 2.5, pb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: 2, background: `linear-gradient(135deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.primaryDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FlashOn sx={{ color: '#fff', fontSize: 22 }} />
              </Box>
              <Typography sx={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '1.3rem' }}>ZAP</Typography>
            </Box>
            <IconButton size="small" onClick={() => setDrawerOpen(false)} sx={{ color: 'rgba(255,255,255,0.6)' }}><Close /></IconButton>
          </Box>

          {activeUserStore && (
            <Box sx={{ p: 1.5, borderRadius: 2, background: 'rgba(255,107,53,0.15)', mb: 2 }}>
              <Typography variant="caption" sx={{ color: ZAP_COLORS.primary, fontWeight: 700, fontSize: '0.68rem' }}>📍 SERVING FROM</Typography>
              <Typography variant="body2" fontWeight={600} color="white">{activeUserStore.name}</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{activeUserStore.address}</Typography>
            </Box>
          )}

          {user ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Avatar src={user.photoURL} sx={{ width: 44, height: 44 }}>{user.displayName?.[0]}</Avatar>
              <Box>
                <Typography fontWeight={600} fontSize="0.95rem">{user.displayName || 'User'}</Typography>
                <Typography fontSize="0.75rem" sx={{ color: 'rgba(255,255,255,0.5)' }} noWrap>{user.email}</Typography>
              </Box>
            </Box>
          ) : (
            <Button fullWidth variant="contained" startIcon={<Login />} onClick={() => { navigate('/login'); setDrawerOpen(false); }}>Login / Sign Up</Button>
          )}
        </Box>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

        <List sx={{ px: 1 }}>
          {navItems.map((item) => (
            <ListItemButton key={item.path} onClick={() => { navigate(item.path); setDrawerOpen(false); }} sx={{ borderRadius: 2, mb: 0.5, background: location.pathname === item.path ? `${ZAP_COLORS.primary}20` : 'transparent', color: location.pathname === item.path ? ZAP_COLORS.primary : 'rgba(255,255,255,0.8)', '&:hover': { background: `${ZAP_COLORS.primary}15` } }}>
              <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 500, fontSize: '0.9rem' }} />
            </ListItemButton>
          ))}

          {/* Info pages */}
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 0.5 }} />
          {[
            { label: 'Help & Support', path: '/help' },
            { label: 'About Us',       path: '/about' },
            { label: 'Privacy Policy', path: '/privacy' },
            { label: 'Terms & Conditions', path: '/terms' },
          ].map((item) => (
            <ListItemButton key={item.path} onClick={() => { navigate(item.path); setDrawerOpen(false); }} sx={{ borderRadius: 2, mb: 0.3, color: 'rgba(255,255,255,0.55)', '&:hover': { background: `${ZAP_COLORS.primary}15`, color: '#fff' } }}>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.82rem' }} />
            </ListItemButton>
          ))}
        </List>

        {user && (
          <>
            <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mt: 1 }} />
            <List sx={{ px: 1 }}>
              <ListItemButton onClick={handleLogout} sx={{ borderRadius: 2, color: '#EF4444', '&:hover': { background: '#EF444415' } }}>
                <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}><Logout /></ListItemIcon>
                <ListItemText primary="Logout" primaryTypographyProps={{ fontWeight: 500, fontSize: '0.9rem' }} />
              </ListItemButton>
            </List>
          </>
        )}
      </Drawer>

      <LocationPickerDialog open={locationDialogOpen} onClose={() => setLocationDialogOpen(false)} />
    </>
  );
};

export default Header;