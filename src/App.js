import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box, CircularProgress } from '@mui/material';
import theme from './theme';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';

// Lazy loaded pages for performance
const Header = lazy(() => import('./components/common/Header'));
const BottomNav = lazy(() => import('./components/common/BottomNav'));

// User pages
const Home = lazy(() => import('./pages/user/Home'));
const Auth = lazy(() => import('./pages/user/Auth'));
const Cart = lazy(() => import('./pages/user/Cart'));
const Checkout = lazy(() => import('./pages/user/Checkout'));
const OrderHistory = lazy(() => import('./pages/user/OrderHistory'));
const ProductDetail = lazy(() => import('./pages/user/ProductDetail'));
const CategoryPage = lazy(() => import('./pages/user/CategoryPage'));
const Profile = lazy(() => import('./pages/user/Profile'));

// Admin pages
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'));
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'));
const AdminPurchases = lazy(() => import('./pages/admin/AdminPurchases'));
const { AdminCategories, AdminInventory, AdminSalesReport } = React.lazy(() =>
  import('./pages/admin/AdminOtherPages').then((m) => ({ default: () => null }))
);
// Fix: proper lazy for named exports
const LazyAdminCategories = lazy(() =>
  import('./pages/admin/AdminOtherPages').then((m) => ({ default: m.AdminCategories }))
);
const LazyAdminInventory = lazy(() =>
  import('./pages/admin/AdminOtherPages').then((m) => ({ default: m.AdminInventory }))
);
const LazyAdminSales = lazy(() =>
  import('./pages/admin/AdminOtherPages').then((m) => ({ default: m.AdminSalesReport }))
);
const LazyAdminBanners = lazy(() =>
  import('./pages/admin/AdminBannersAndCoupons').then((m) => ({ default: m.AdminBanners }))
);
const LazyAdminCoupons = lazy(() =>
  import('./pages/admin/AdminBannersAndCoupons').then((m) => ({ default: m.AdminCoupons }))
);

const LoadingScreen = () => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#FFF8F5' }}>
    <Box sx={{ textAlign: 'center' }}>
      <Box sx={{
        width: 56, height: 56, borderRadius: 3,
        background: 'linear-gradient(135deg, #FF6B35, #E55A25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        mx: 'auto', mb: 2, animation: 'pulse 1.5s ease-in-out infinite',
        '@keyframes pulse': {
          '0%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(255,107,53,0.4)' },
          '70%': { transform: 'scale(1.05)', boxShadow: '0 0 0 12px rgba(255,107,53,0)' },
          '100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(255,107,53,0)' },
        },
      }}>
        <Box sx={{ color: '#fff', fontSize: '1.8rem' }}>⚡</Box>
      </Box>
      <CircularProgress size={24} sx={{ color: '#FF6B35' }} />
    </Box>
  </Box>
);

// User Layout wrapper
const UserLayout = ({ children }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
    <Suspense fallback={null}>
      <Header />
    </Suspense>
    <Box component="main" sx={{ flex: 1 }}>
      {children}
    </Box>
    <Suspense fallback={null}>
      <BottomNav />
    </Suspense>
  </Box>
);

// Search page (uses CategoryPage with different title)
const SearchPage = lazy(() =>
  import('./pages/user/CategoryPage').then((m) => {
    // Wrap with search query support — CategoryPage already reads searchParams
    return { default: m.default };
  })
);

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <CartProvider>
          <Router>
            <Suspense fallback={<LoadingScreen />}>
              <Routes>
                {/* USER ROUTES */}
                <Route path="/" element={<UserLayout><Home /></UserLayout>} />
                <Route path="/login" element={<Auth />} />
                <Route path="/cart" element={<UserLayout><Cart /></UserLayout>} />
                <Route path="/checkout" element={<UserLayout><Checkout /></UserLayout>} />
                <Route path="/orders" element={<UserLayout><OrderHistory /></UserLayout>} />
                <Route path="/product/:id" element={<UserLayout><ProductDetail /></UserLayout>} />
                <Route path="/category/:id" element={<UserLayout><CategoryPage /></UserLayout>} />
                <Route path="/categories" element={<UserLayout><CategoryPage /></UserLayout>} />
                <Route path="/products" element={<UserLayout><CategoryPage /></UserLayout>} />
                <Route path="/search" element={<UserLayout><CategoryPage /></UserLayout>} />
                <Route path="/profile" element={<UserLayout><Profile /></UserLayout>} />

                {/* ADMIN ROUTES */}
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="orders/:id" element={<AdminOrders />} />
                  <Route path="products" element={<AdminProducts />} />
                  <Route path="products/new" element={<AdminProducts />} />
                  <Route path="categories" element={<LazyAdminCategories />} />
                  <Route path="inventory" element={<LazyAdminInventory />} />
                  <Route path="purchases" element={<AdminPurchases />} />
                  <Route path="banners" element={<LazyAdminBanners />} />
                  <Route path="coupons" element={<LazyAdminCoupons />} />
                  <Route path="sales" element={<LazyAdminSales />} />
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </Router>
        </CartProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
