import React, { useTransition } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BottomNavigation, BottomNavigationAction, Paper, Badge } from '@mui/material';
import { Home, Category, ShoppingCart, History, Person } from '@mui/icons-material';
import { useCart } from '../../context/CartContext';

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { totalItems } = useCart();
  // useTransition keeps the OLD page visible while the new lazy chunk loads,
  // preventing the white flash AND the banner close-reopen flicker.
  const [, startTransition] = useTransition();

  const tabs = [
    { label: 'Home',       icon: <Home />,                                                             path: '/'          },
    { label: 'Categories', icon: <Category />,                                                         path: '/categories' },
    { label: 'Cart',       icon: <Badge badgeContent={totalItems} color="primary"><ShoppingCart /></Badge>, path: '/cart'  },
    { label: 'Orders',     icon: <History />,                                                          path: '/orders'    },
    { label: 'Profile',    icon: <Person />,                                                           path: '/profile'   },
  ];

  const currentTab = tabs.findIndex((t) =>
    t.path === '/' ? location.pathname === '/' : location.pathname.startsWith(t.path)
  );

  // Hide on admin routes
  if (location.pathname.startsWith('/admin')) return null;

  return (
    <Paper
      elevation={0}
      sx={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 100,
        display: { xs: 'block', md: 'none' },
        pb: 'env(safe-area-inset-bottom)',
      }}
    >
      <BottomNavigation
        value={currentTab >= 0 ? currentTab : false}
        onChange={(_, newValue) => {
          // Wrap in startTransition so React keeps the current page mounted
          // (including the BannerCarousel) while the next page's JS chunk loads.
          // On subsequent clicks the chunk is already cached so the transition
          // is instant — no more first-click flicker.
          startTransition(() => navigate(tabs[newValue].path));
        }}
      >
        {tabs.map((tab) => (
          <BottomNavigationAction
            key={tab.path}
            label={tab.label}
            icon={tab.icon}
            showLabel
          />
        ))}
      </BottomNavigation>
    </Paper>
  );
};

export default BottomNav;