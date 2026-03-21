import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box, CircularProgress } from '@mui/material';
import theme from './theme';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { StoreProvider } from './context/StoreContext';
import ActiveOrdersBar from './components/user/ActiveOrdersBar';
import ErrorBoundary from './components/ErrorBoundary';
import { useNotifications } from './hooks/useNotifications';

// ── Common ───────────────────────────────────────────────────────────────────
const Header        = lazy(() => import('./components/common/Header'));
const BottomNav     = lazy(() => import('./components/common/BottomNav'));
const LocationGate      = lazy(() => import('./pages/user/LocationGate'));

// ── User pages ────────────────────────────────────────────────────────────────
const Home          = lazy(() => import('./pages/user/Home'));
const Auth          = lazy(() => import('./pages/user/Auth'));
const Cart          = lazy(() => import('./pages/user/Cart'));
const Checkout      = lazy(() => import('./pages/user/Checkout'));
const OrderHistory  = lazy(() => import('./pages/user/OrderHistory'));
const ProductDetail = lazy(() => import('./pages/user/ProductDetail'));
const CategoryPage    = lazy(() => import('./pages/user/CategoryPage'));
const CategoriesPage  = lazy(() => import('./pages/user/CategoriesPage'));
const Profile       = lazy(() => import('./pages/user/Profile'));
const HelpPage      = lazy(() => import('./pages/user/InfoPages').then(m => ({ default: m.HelpPage })));
const AboutPage     = lazy(() => import('./pages/user/InfoPages').then(m => ({ default: m.AboutPage })));
const PrivacyPage   = lazy(() => import('./pages/user/InfoPages').then(m => ({ default: m.PrivacyPage })));
const TermsPage     = lazy(() => import('./pages/user/InfoPages').then(m => ({ default: m.TermsPage })));
const MapAddressPicker = lazy(() => import('./pages/user/MapAddressPicker'));
const AddressDetails   = lazy(() => import('./pages/user/AddressDetails'));

// ── Admin pages ───────────────────────────────────────────────────────────────
const AdminLayout    = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminOrders    = lazy(() => import('./pages/admin/AdminOrders'));
const AdminProducts  = lazy(() => import('./pages/admin/AdminProducts'));
const AdminPurchases = lazy(() => import('./pages/admin/AdminPurchases'));
const AdminStores    = lazy(() => import('./pages/admin/AdminStores'));

// Named exports — must each use their own .then() wrapper
const AdminCategories = lazy(() =>
  import('./pages/admin/AdminOtherPages').then((m) => ({ default: m.AdminCategories }))
);
const AdminInventory = lazy(() =>
  import('./pages/admin/AdminOtherPages').then((m) => ({ default: m.AdminInventory }))
);
const AdminSalesReport = lazy(() =>
  import('./pages/admin/AdminOtherPages').then((m) => ({ default: m.AdminSalesReport }))
);
const AdminBanners = lazy(() =>
  import('./pages/admin/AdminBannersAndCoupons').then((m) => ({ default: m.AdminBanners }))
);
const AdminCoupons = lazy(() =>
  import('./pages/admin/AdminBannersAndCoupons').then((m) => ({ default: m.AdminCoupons }))
);

// ── Notifications initializer (hook must be inside providers) ────────────────
const NotificationsInit = () => { useNotifications(); return null; };

// ── Loading screen ────────────────────────────────────────────────────────────
const LoadingScreen = () => (
  <Box sx={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100vh', background: '#FFF8F5',
  }}>
    <Box sx={{ textAlign: 'center' }}>
      <Box sx={{
        width: 56, height: 56, borderRadius: 3,
        background: 'linear-gradient(135deg, #FF6B35, #E55A25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        mx: 'auto', mb: 2,
        animation: 'zapPulse 1.5s ease-in-out infinite',
        '@keyframes zapPulse': {
          '0%':   { transform: 'scale(1)',    boxShadow: '0 0 0 0 rgba(255,107,53,0.4)' },
          '70%':  { transform: 'scale(1.05)', boxShadow: '0 0 0 12px rgba(255,107,53,0)' },
          '100%': { transform: 'scale(1)',    boxShadow: '0 0 0 0 rgba(255,107,53,0)' },
        },
      }}>
        <Box sx={{ color: '#fff', fontSize: '1.8rem' }}>⚡</Box>
      </Box>
      <CircularProgress size={24} sx={{ color: '#FF6B35' }} />
    </Box>
  </Box>
);

// ── User layout ───────────────────────────────────────────────────────────────
// LocationGate is rendered INSIDE StoreProvider (see provider tree below),
// so useStore() inside LocationGate always has a valid context.
const UserLayout = ({ children }) => (
  <LocationGate>
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Suspense fallback={null}>
        <Header />
      </Suspense>
      <Box component="main" sx={{ flex: 1 }}>
        {children}
      </Box>
      <Suspense fallback={null}>
        <ActiveOrdersBar />
      </Suspense>
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </Box>
  </LocationGate>
);

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/*
        Provider order (outermost → innermost):
          AuthProvider   — Firebase auth state
          StoreProvider  — GPS + nearest-store (must wrap LocationGate & admin)
          CartProvider   — cart state
          Router         — React Router
      */}
      <ErrorBoundary>
      <AuthProvider>
        <StoreProvider>
          <CartProvider>
            <NotificationsInit />
            <Router>
              <Suspense fallback={<LoadingScreen />}>
                <Routes>

                  {/* USER ROUTES */}
                  <Route path="/"             element={<UserLayout><Home /></UserLayout>} />
                  <Route path="/login"        element={<Auth />} />
                  <Route path="/cart"         element={<UserLayout><Cart /></UserLayout>} />
                  <Route path="/checkout"     element={<UserLayout><Checkout /></UserLayout>} />
                  <Route path="/orders"       element={<UserLayout><OrderHistory /></UserLayout>} />
                  <Route path="/product/:id"  element={<UserLayout><ProductDetail /></UserLayout>} />
                  <Route path="/category/:id" element={<UserLayout><CategoryPage /></UserLayout>} />
                  <Route path="/categories"   element={<UserLayout><CategoriesPage /></UserLayout>} />
                  <Route path="/products"     element={<UserLayout><CategoryPage /></UserLayout>} />
                  <Route path="/search"       element={<UserLayout><CategoryPage /></UserLayout>} />
                  <Route path="/profile"      element={<UserLayout><Profile /></UserLayout>} />
                  <Route path="/add-address"   element={<MapAddressPicker />} />
                  <Route path="/address-details" element={<AddressDetails />} />
                  <Route path="/help"         element={<UserLayout><HelpPage /></UserLayout>} />
                  <Route path="/about"        element={<UserLayout><AboutPage /></UserLayout>} />
                  <Route path="/privacy"      element={<UserLayout><PrivacyPage /></UserLayout>} />
                  <Route path="/terms"        element={<UserLayout><TermsPage /></UserLayout>} />

                  {/* ADMIN ROUTES */}
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index               element={<AdminDashboard />} />
                    <Route path="orders"       element={<AdminOrders />} />
                    <Route path="orders/:id"   element={<AdminOrders />} />
                    <Route path="products"     element={<AdminProducts />} />
                    <Route path="products/new" element={<AdminProducts />} />
                    <Route path="categories"   element={<AdminCategories />} />
                    <Route path="inventory"    element={<AdminInventory />} />
                    <Route path="purchases"    element={<AdminPurchases />} />
                    <Route path="banners"      element={<AdminBanners />} />
                    <Route path="coupons"      element={<AdminCoupons />} />
                    <Route path="sales"        element={<AdminSalesReport />} />
                    <Route path="stores"       element={<AdminStores />} />
                  </Route>

                  {/* FALLBACK */}
                  <Route path="*" element={<Navigate to="/" replace />} />

                </Routes>
              </Suspense>
            </Router>
          </CartProvider>
        </StoreProvider>
      </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;