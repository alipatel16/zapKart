import React, { Suspense, lazy } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  CircularProgress,
} from "@mui/material";
import theme from "./theme";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { StoreProvider } from "./context/StoreContext";
import ActiveOrdersBar from "./components/user/ActiveOrdersBar";
import ErrorBoundary from "./components/ErrorBoundary";
import { useNotifications } from "./hooks/useNotifications";
import PageTransition from "./components/common/PageTransition";
import CartReconciler from "./components/user/CartReconciler";
import ScrollToTop from './components/common/ScrollToTop';

// ── Common ───────────────────────────────────────────────────────────────────
import Header from "./components/common/Header";
const BottomNav = lazy(
  () => import(/* webpackPrefetch: true */ "./components/common/BottomNav"),
);
const LocationGate = lazy(
  () => import(/* webpackPrefetch: true */ "./pages/user/LocationGate"),
);

// ── User pages ────────────────────────────────────────────────────────────────
const Home = lazy(
  () => import(/* webpackPrefetch: true */ "./pages/user/Home"),
);
const Auth = lazy(
  () => import(/* webpackPrefetch: true */ "./pages/user/Auth"),
);
const Cart = lazy(
  () => import(/* webpackPrefetch: true */ "./pages/user/Cart"),
);
const Checkout = lazy(
  () => import(/* webpackPrefetch: true */ "./pages/user/Checkout"),
);
const OrderHistory = lazy(
  () => import(/* webpackPrefetch: true */ "./pages/user/OrderHistory"),
);
const ProductDetail = lazy(
  () => import(/* webpackPrefetch: true */ "./pages/user/ProductDetail"),
);
const CategoryPage = lazy(
  () => import(/* webpackPrefetch: true */ "./pages/user/CategoryPage"),
);
const CategoriesPage = lazy(
  () => import(/* webpackPrefetch: true */ "./pages/user/CategoriesPage"),
);
const Profile = lazy(
  () => import(/* webpackPrefetch: true */ "./pages/user/Profile"),
);

const HelpPage = lazy(() =>
  import(/* webpackPrefetch: true */ "./pages/user/InfoPages").then((m) => ({
    default: m.HelpPage,
  })),
);
const AboutPage = lazy(() =>
  import(/* webpackPrefetch: true */ "./pages/user/InfoPages").then((m) => ({
    default: m.AboutPage,
  })),
);
const PrivacyPage = lazy(() =>
  import(/* webpackPrefetch: true */ "./pages/user/InfoPages").then((m) => ({
    default: m.PrivacyPage,
  })),
);
const TermsPage = lazy(() =>
  import(/* webpackPrefetch: true */ "./pages/user/InfoPages").then((m) => ({
    default: m.TermsPage,
  })),
);

const MapAddressPicker = lazy(
  () => import(/* webpackPrefetch: true */ "./pages/user/MapAddressPicker"),
);
const AddressDetails = lazy(
  () => import(/* webpackPrefetch: true */ "./pages/user/AddressDetails"),
);

// ── Admin pages ───────────────────────────────────────────────────────────────
const AdminLayout = lazy(
  () => import("./pages/admin/AdminLayout"),
);
const AdminDashboard = lazy(
  () => import("./pages/admin/AdminDashboard"),
);
const AdminOrders = lazy(
  () => import("./pages/admin/AdminOrders"),
);
const AdminProducts = lazy(
  () => import("./pages/admin/AdminProducts"),
);
const AdminPurchases = lazy(
  () => import("./pages/admin/AdminPurchases"),
);
const AdminStores = lazy(
  () => import("./pages/admin/AdminStores"),
);
const AdminTopPicks = lazy(
  () => import("./pages/admin/AdminTopPicks"),
);

const AdminCategories = lazy(() =>
  import("./pages/admin/AdminOtherPages").then(
    (m) => ({ default: m.AdminCategories }),
  ),
);
const AdminInventory = lazy(() =>
  import("./pages/admin/AdminOtherPages").then(
    (m) => ({ default: m.AdminInventory }),
  ),
);
const AdminSalesReport = lazy(() =>
  import("./pages/admin/AdminOtherPages").then(
    (m) => ({ default: m.AdminSalesReport }),
  ),
);
const AdminBanners = lazy(() =>
  import("./pages/admin/AdminBannersAndCoupons").then((m) => ({ default: m.AdminBanners })),
);
const AdminCoupons = lazy(() =>
  import(
    "./pages/admin/AdminBannersAndCoupons"
  ).then((m) => ({ default: m.AdminCoupons })),
);

// ── Notifications initializer ────────────────────────────────────────────────
const NotificationsInit = () => {
  useNotifications();
  return null;
};

// ── Auth gate: shows BootScreen while Firebase resolves the session ───────────
const AppShell = ({ children }) => {
  const { loading } = useAuth();
  if (loading) return <BootScreen />;
  return children;
};

// ✅ SECURITY FIX: Admin route guard — enforced at the router level.
const AdminRoute = ({ children }) => {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <BootScreen />;
  if (!user || !isAdmin) return <Navigate to="/" replace />;
  return children;
};

// ── Initial app boot screen ───────────────────────────────────────────────────
const BootScreen = () => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      background: "#FFF8F5",
    }}
  >
    <Box sx={{ textAlign: "center" }}>
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: 3,
          background: "linear-gradient(135deg, #FF6B35, #E55A25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mx: "auto",
          mb: 2,
          animation: "zapPulse 1.5s ease-in-out infinite",
          "@keyframes zapPulse": {
            "0%": {
              transform: "scale(1)",
              boxShadow: "0 0 0 0 rgba(255,107,53,0.4)",
            },
            "70%": {
              transform: "scale(1.05)",
              boxShadow: "0 0 0 12px rgba(255,107,53,0)",
            },
            "100%": {
              transform: "scale(1)",
              boxShadow: "0 0 0 0 rgba(255,107,53,0)",
            },
          },
        }}
      >
        <Box sx={{ color: "#fff", fontSize: "1.8rem" }}>⚡</Box>
      </Box>
      <CircularProgress size={24} sx={{ color: "#FF6B35" }} />
    </Box>
  </Box>
);

// ── User layout — mounts ONCE, uses <Outlet> for page content ─────────────────
// This mirrors how AdminLayout works: Header, BottomNav, ActiveOrdersBar stay
// mounted across navigations. Only the inner page swaps via <Outlet>.
const UserLayout = () => (
  <LocationGate>
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <Box component="main" sx={{ flex: 1 }}>
        <PageTransition>
          <Outlet />
        </PageTransition>
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
              <CartReconciler />
              <NotificationsInit />
              <Router>
                <ScrollToTop />
                <Suspense fallback={<BootScreen />}>
                  <AppShell>
                    <Routes>
                      {/* ── USER ROUTES — nested under single UserLayout ── */}
                      <Route element={<UserLayout />}>
                        <Route
                          index
                          element={
                            <Suspense fallback={null}>
                              <Home />
                            </Suspense>
                          }
                        />
                        <Route
                          path="cart"
                          element={
                            <Suspense fallback={null}>
                              <Cart />
                            </Suspense>
                          }
                        />
                        <Route
                          path="checkout"
                          element={
                            <Suspense fallback={null}>
                              <Checkout />
                            </Suspense>
                          }
                        />
                        <Route
                          path="orders"
                          element={
                            <Suspense fallback={null}>
                              <OrderHistory />
                            </Suspense>
                          }
                        />
                        <Route
                          path="product/:id"
                          element={
                            <Suspense fallback={null}>
                              <ProductDetail />
                            </Suspense>
                          }
                        />
                        <Route
                          path="category/:id"
                          element={
                            <Suspense fallback={null}>
                              <CategoryPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="categories"
                          element={
                            <Suspense fallback={null}>
                              <CategoriesPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="products"
                          element={
                            <Suspense fallback={null}>
                              <CategoryPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="profile"
                          element={
                            <Suspense fallback={null}>
                              <Profile />
                            </Suspense>
                          }
                        />
                        <Route
                          path="help"
                          element={
                            <Suspense fallback={null}>
                              <HelpPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="about"
                          element={
                            <Suspense fallback={null}>
                              <AboutPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="privacy"
                          element={
                            <Suspense fallback={null}>
                              <PrivacyPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="terms"
                          element={
                            <Suspense fallback={null}>
                              <TermsPage />
                            </Suspense>
                          }
                        />
                      </Route>

                      {/* ── Standalone pages (no UserLayout shell) ── */}
                      <Route
                        path="/login"
                        element={
                          <Suspense fallback={null}>
                            <Auth />
                          </Suspense>
                        }
                      />
                      <Route
                        path="/add-address"
                        element={
                          <Suspense fallback={null}>
                            <MapAddressPicker />
                          </Suspense>
                        }
                      />
                      <Route
                        path="/address-details"
                        element={
                          <Suspense fallback={null}>
                            <AddressDetails />
                          </Suspense>
                        }
                      />

                      {/* ── ADMIN ROUTES — already uses Outlet pattern ── */}
                      <Route
                        path="/admin"
                        element={
                          <Suspense fallback={null}>
                            <AdminRoute>
                              <AdminLayout />
                            </AdminRoute>
                          </Suspense>
                        }
                      >
                        <Route
                          index
                          element={
                            <Suspense fallback={null}>
                              <AdminDashboard />
                            </Suspense>
                          }
                        />
                        <Route
                          path="orders"
                          element={
                            <Suspense fallback={null}>
                              <AdminOrders />
                            </Suspense>
                          }
                        />
                        <Route
                          path="orders/:id"
                          element={
                            <Suspense fallback={null}>
                              <AdminOrders />
                            </Suspense>
                          }
                        />
                        <Route
                          path="products"
                          element={
                            <Suspense fallback={null}>
                              <AdminProducts />
                            </Suspense>
                          }
                        />
                        <Route
                          path="products/new"
                          element={
                            <Suspense fallback={null}>
                              <AdminProducts />
                            </Suspense>
                          }
                        />
                        <Route
                          path="categories"
                          element={
                            <Suspense fallback={null}>
                              <AdminCategories />
                            </Suspense>
                          }
                        />
                        <Route
                          path="inventory"
                          element={
                            <Suspense fallback={null}>
                              <AdminInventory />
                            </Suspense>
                          }
                        />
                        <Route
                          path="purchases"
                          element={
                            <Suspense fallback={null}>
                              <AdminPurchases />
                            </Suspense>
                          }
                        />
                        <Route
                          path="banners"
                          element={
                            <Suspense fallback={null}>
                              <AdminBanners />
                            </Suspense>
                          }
                        />
                        <Route
                          path="coupons"
                          element={
                            <Suspense fallback={null}>
                              <AdminCoupons />
                            </Suspense>
                          }
                        />
                        <Route
                          path="sales"
                          element={
                            <Suspense fallback={null}>
                              <AdminSalesReport />
                            </Suspense>
                          }
                        />
                        <Route
                          path="stores"
                          element={
                            <Suspense fallback={null}>
                              <AdminStores />
                            </Suspense>
                          }
                        />
                        <Route
                          path="top-picks"
                          element={
                            <Suspense fallback={null}>
                              <AdminTopPicks />
                            </Suspense>
                          }
                        />
                      </Route>

                      {/* FALLBACK */}
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </AppShell>
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