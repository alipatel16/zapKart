import React from 'react';
import { useLocation } from 'react-router-dom';
import { Box } from '@mui/material';

/**
 * PageTransition — wraps page content with a smooth fade+slide-up animation.
 *
 * How it works:
 * - Uses `key={location.key}` so React creates a fresh DOM node on every
 *   navigation, which re-triggers the CSS @keyframes animation.
 * - The animation is CSS-only (no JS timers), so it's jank-free even on
 *   slower devices and never blocks React's render cycle.
 * - The parent (UserLayout) keeps Header / BottomNav mounted — only the
 *   inner page content animates, so the chrome feels stable.
 */
const PageTransition = ({ children }) => {
  const location = useLocation();

  return (
    <Box
      key={location.key}
      sx={{
        animation: 'zapPageIn 0.22s cubic-bezier(0.22, 1, 0.36, 1) both',
        '@keyframes zapPageIn': {
          from: {
            opacity: 0,
            transform: 'translateY(8px)',
          },
          to: {
            opacity: 1,
            transform: 'translateY(0)',
          },
        },
        // Prevent the white background from bleeding through during animation
        willChange: 'opacity, transform',
        // Ensure the animated box doesn't clip overflow (e.g. sticky headers)
        overflow: 'visible',
      }}
    >
      {children}
    </Box>
  );
};

export default PageTransition;