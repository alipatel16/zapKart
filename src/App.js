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
const Header       = lazy(() => import(/* webpackPrefetch: true */ './components/common/Header'));
const BottomNav    = lazy(() => import(/* webpackPrefetch: true */ './components/common/BottomNav'));
const LocationGate = lazy(() => import(/* webpackPrefetch: true */ './pages/user/LocationGate'));

// ── User pages ────────────────────────────────────────────────────────────────
const Home          = lazy(() => import(/* webpackPrefetch: true */ './pages/user/Home'));
const Auth          = lazy(() => import(/* webpackPrefetch: true */ './pages/user/Auth'));
const Cart          = lazy(() => import(/* webpackPrefetch: true */ './pages/user/Cart'));
const Checkout      = lazy(() => import(/* webpackPrefetch: true */ './pages/user/Checkout'));
const OrderHistory  = lazy(() => import(/* webpackPrefetch: true */ './pages/user/OrderHistory'));
const ProductDetail = lazy(() => import(/* webpackPrefetch: true */ './pages/user/ProductDetail'));
const CategoryPage  = lazy(() => import(/* webpackPrefetch: true */ './pages/user/CategoryPage'));
const CategoriesPage= lazy(() => import(/* webpackPrefetch: true */ './pages/user/CategoriesPage'));
const Profile       = lazy(() => import(/* webpackPrefetch: true */ './pages/user/Profile'));

const HelpPage    = lazy(() => import(/* webpackPrefetch: true */ './pages/user/InfoPages').then(m => ({ default: m.HelpPage })));
const AboutPage   = lazy(() => import(/* webpackPrefetch: true */ './pages/user/InfoPages').then(m => ({ default: m.AboutPage })));
const PrivacyPage = lazy(() => import(/* webpackPrefetch: true */ './pages/user/InfoPages').then(m => ({ default: m.PrivacyPage })));
const TermsPage   = lazy(() => import(/* webpackPrefetch: true */ './pages/user/InfoPages').then(m => ({ default: m.TermsPage })));

const MapAddressPicker = lazy(() => import(/* webpackPrefetch: true */ './pages/user/MapAddressPicker'));
const AddressDetails   = lazy(() => import(/* webpackPrefetch: true */ './pages/user/AddressDetails'));

// ── Admin pages ───────────────────────────────────────────────────────────────
const AdminLayout    = lazy(() => import(/* webpackPrefetch: true */ './pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import(/* webpackPrefetch: true */ './pages/admin/AdminDashboard'));
const AdminOrders    = lazy(() => import(/* webpackPrefetch: true */ './pages/admin/AdminOrders'));
const AdminProducts  = lazy(() => import(/* webpackPrefetch: true */ './pages/admin/AdminProducts'));
const AdminPurchases = lazy(() => import(/* webpackPrefetch: true */ './pages/admin/AdminPurchases'));
const AdminStores    = lazy(() => import(/* webpackPrefetch: true */ './pages/admin/AdminStores'));
const AdminTopPicks  = lazy(() => import(/* webpackPrefetch: true */ './pages/admin/AdminTopPicks'));

const AdminCategories = lazy(() =>
  import(/* webpackPrefetch: true */ './pages/admin/AdminOtherPages').then((m) => ({ default: m.AdminCategories }))
);
const AdminInventory = lazy(() =>
  import(/* webpackPrefetch: true */ './pages/admin/AdminOtherPages').then((m) => ({ default: m.AdminInventory }))
);
const AdminSalesReport = lazy(() =>
  import(/* webpackPrefetch: true */ './pages/admin/AdminOtherPages').then((m) => ({ default: m.AdminSalesReport }))
);
const AdminBanners = lazy(() =>
  import(/* webpackPrefetch: true */ './pages/admin/AdminBannersAndCoupons').then((m) => ({ default: m.AdminBanners }))
);
const AdminCoupons = lazy(() =>
  import(/* webpackPrefetch: true */ './pages/admin/AdminBannersAndCoupons').then((m) => ({ default: m.AdminCoupons }))
);

// ── Notifications initializer ────────────────────────────────────────────────
const NotificationsInit = () => { useNotifications(); return null; };

// ── Initial app boot screen (shown ONLY while the very first JS chunk loads) ──
// This is intentionally shown only on cold start. All subsequent navigations
// use the null fallback below so there's no flash between pages.
const BootScreen = () => (
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
      <ErrorBoundary>
        <AuthProvider>
          <StoreProvider>
            <CartProvider>
              <NotificationsInit />
              <Router>
                {/*
                  Outer Suspense: shows BootScreen only on the very first cold load
                  while the initial JS bundle evaluates. Once the app shell is ready,
                  this never triggers again for the lifetime of the session.
                */}
                <Suspense fallback={<BootScreen />}>
                  {/*
                    Inner Suspense (per route): fallback is null so navigating between
                    pages never shows a loading screen. Chunks are prefetched in the
                    background via webpackPrefetch so they're ready before the user clicks.
                  */}
                  <Routes>

                    {/* USER ROUTES */}
                    <Route path="/"                element={<Suspense fallback={null}><UserLayout><Home /></UserLayout></Suspense>} />
                    <Route path="/login"           element={<Suspense fallback={null}><Auth /></Suspense>} />
                    <Route path="/cart"            element={<Suspense fallback={null}><UserLayout><Cart /></UserLayout></Suspense>} />
                    <Route path="/checkout"        element={<Suspense fallback={null}><UserLayout><Checkout /></UserLayout></Suspense>} />
                    <Route path="/orders"          element={<Suspense fallback={null}><UserLayout><OrderHistory /></UserLayout></Suspense>} />
                    <Route path="/product/:id"     element={<Suspense fallback={null}><UserLayout><ProductDetail /></UserLayout></Suspense>} />
                    <Route path="/category/:id"    element={<Suspense fallback={null}><UserLayout><CategoryPage /></UserLayout></Suspense>} />
                    <Route path="/categories"      element={<Suspense fallback={null}><UserLayout><CategoriesPage /></UserLayout></Suspense>} />
                    <Route path="/products"        element={<Suspense fallback={null}><UserLayout><CategoryPage /></UserLayout></Suspense>} />
                    <Route path="/profile"         element={<Suspense fallback={null}><UserLayout><Profile /></UserLayout></Suspense>} />
                    <Route path="/add-address"     element={<Suspense fallback={null}><MapAddressPicker /></Suspense>} />
                    <Route path="/address-details" element={<Suspense fallback={null}><AddressDetails /></Suspense>} />
                    <Route path="/help"            element={<Suspense fallback={null}><UserLayout><HelpPage /></UserLayout></Suspense>} />
                    <Route path="/about"           element={<Suspense fallback={null}><UserLayout><AboutPage /></UserLayout></Suspense>} />
                    <Route path="/privacy"         element={<Suspense fallback={null}><UserLayout><PrivacyPage /></UserLayout></Suspense>} />
                    <Route path="/terms"           element={<Suspense fallback={null}><UserLayout><TermsPage /></UserLayout></Suspense>} />

                    {/* ADMIN ROUTES */}
                    <Route path="/admin" element={<Suspense fallback={null}><AdminLayout /></Suspense>}>
                      <Route index               element={<Suspense fallback={null}><AdminDashboard /></Suspense>} />
                      <Route path="orders"       element={<Suspense fallback={null}><AdminOrders /></Suspense>} />
                      <Route path="orders/:id"   element={<Suspense fallback={null}><AdminOrders /></Suspense>} />
                      <Route path="products"     element={<Suspense fallback={null}><AdminProducts /></Suspense>} />
                      <Route path="products/new" element={<Suspense fallback={null}><AdminProducts /></Suspense>} />
                      <Route path="categories"   element={<Suspense fallback={null}><AdminCategories /></Suspense>} />
                      <Route path="inventory"    element={<Suspense fallback={null}><AdminInventory /></Suspense>} />
                      <Route path="purchases"    element={<Suspense fallback={null}><AdminPurchases /></Suspense>} />
                      <Route path="banners"      element={<Suspense fallback={null}><AdminBanners /></Suspense>} />
                      <Route path="coupons"      element={<Suspense fallback={null}><AdminCoupons /></Suspense>} />
                      <Route path="sales"        element={<Suspense fallback={null}><AdminSalesReport /></Suspense>} />
                      <Route path="stores"       element={<Suspense fallback={null}><AdminStores /></Suspense>} />
                      <Route path="top-picks"    element={<Suspense fallback={null}><AdminTopPicks /></Suspense>} />
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