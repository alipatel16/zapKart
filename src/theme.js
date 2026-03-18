import { createTheme } from '@mui/material/styles';

const ZAP_COLORS = {
  primary: '#FF6B35',
  primaryDark: '#E55A25',
  primaryLight: '#FF8C5A',
  secondary: '#1A1A2E',
  accent: '#FFD23F',
  accentGreen: '#06D6A0',
  surface: '#FFFFFF',
  surfaceDim: '#FFF8F5',
  surfaceCard: '#FFFFFF',
  border: '#F0E6DF',
  textPrimary: '#1A1A2E',
  textSecondary: '#6B6B7B',
  textMuted: '#A0A0B0',
  success: '#06D6A0',
  warning: '#FFD23F',
  error: '#EF4444',
  info: '#3B82F6',
};

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: ZAP_COLORS.primary,
      dark: ZAP_COLORS.primaryDark,
      light: ZAP_COLORS.primaryLight,
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: ZAP_COLORS.secondary,
      contrastText: '#FFFFFF',
    },
    success: { main: ZAP_COLORS.success },
    warning: { main: ZAP_COLORS.warning },
    error: { main: ZAP_COLORS.error },
    info: { main: ZAP_COLORS.info },
    background: {
      default: '#FFF8F5',
      paper: '#FFFFFF',
    },
    text: {
      primary: ZAP_COLORS.textPrimary,
      secondary: ZAP_COLORS.textSecondary,
    },
  },
  typography: {
    fontFamily: "'DM Sans', sans-serif",
    h1: { fontFamily: "'Syne', sans-serif", fontWeight: 800, letterSpacing: '-0.02em' },
    h2: { fontFamily: "'Syne', sans-serif", fontWeight: 700, letterSpacing: '-0.02em' },
    h3: { fontFamily: "'Syne', sans-serif", fontWeight: 700, letterSpacing: '-0.01em' },
    h4: { fontFamily: "'Syne', sans-serif", fontWeight: 700 },
    h5: { fontFamily: "'Syne', sans-serif", fontWeight: 600 },
    h6: { fontFamily: "'Syne', sans-serif", fontWeight: 600 },
    subtitle1: { fontWeight: 500 },
    subtitle2: { fontWeight: 500 },
    body1: { fontWeight: 400 },
    body2: { fontWeight: 400, fontSize: '0.875rem' },
    button: { fontFamily: "'Syne', sans-serif", fontWeight: 600, textTransform: 'none', letterSpacing: '0.01em' },
    caption: { color: ZAP_COLORS.textMuted },
  },
  shape: { borderRadius: 16 },
  shadows: [
    'none',
    '0 1px 3px rgba(255,107,53,0.08)',
    '0 2px 8px rgba(255,107,53,0.10)',
    '0 4px 16px rgba(255,107,53,0.12)',
    '0 8px 24px rgba(255,107,53,0.14)',
    '0 12px 32px rgba(255,107,53,0.16)',
    '0 16px 40px rgba(255,107,53,0.18)',
    '0 20px 48px rgba(255,107,53,0.20)',
    ...Array(17).fill('0 24px 56px rgba(0,0,0,0.1)'),
  ],
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: '#FFF8F5',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          overscrollBehavior: 'none',
        },
        '::-webkit-scrollbar': { width: '4px' },
        '::-webkit-scrollbar-track': { background: 'transparent' },
        '::-webkit-scrollbar-thumb': { background: ZAP_COLORS.border, borderRadius: '2px' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          padding: '10px 20px',
          fontSize: '0.9rem',
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
          transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
          '&:active': { transform: 'scale(0.97)' },
        },
        contained: {
          background: `linear-gradient(135deg, ${ZAP_COLORS.primary} 0%, ${ZAP_COLORS.primaryDark} 100%)`,
          '&:hover': {
            background: `linear-gradient(135deg, ${ZAP_COLORS.primaryLight} 0%, ${ZAP_COLORS.primary} 100%)`,
            transform: 'translateY(-1px)',
          },
        },
        containedSecondary: {
          background: `linear-gradient(135deg, ${ZAP_COLORS.secondary} 0%, #2A2A4E 100%)`,
        },
        outlined: {
          borderColor: ZAP_COLORS.border,
          '&:hover': { borderColor: ZAP_COLORS.primary, background: `${ZAP_COLORS.primary}08` },
        },
        sizeLarge: { padding: '14px 28px', fontSize: '1rem', borderRadius: 14 },
        sizeSmall: { padding: '6px 14px', fontSize: '0.8rem', borderRadius: 10 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          border: `1px solid ${ZAP_COLORS.border}`,
          boxShadow: '0 2px 12px rgba(255,107,53,0.06)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 8px 24px rgba(255,107,53,0.15)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 500,
        },
        colorPrimary: {
          background: `${ZAP_COLORS.primary}15`,
          color: ZAP_COLORS.primary,
          border: `1px solid ${ZAP_COLORS.primary}30`,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            '& fieldset': { borderColor: ZAP_COLORS.border },
            '&:hover fieldset': { borderColor: ZAP_COLORS.primaryLight },
            '&.Mui-focused fieldset': { borderColor: ZAP_COLORS.primary },
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          backgroundImage: 'none',
        },
      },
    },
    MuiBottomNavigation: {
      styleOverrides: {
        root: {
          height: 64,
          borderTop: `1px solid ${ZAP_COLORS.border}`,
          background: '#FFFFFF',
        },
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: {
          minWidth: 'auto',
          '&.Mui-selected': { color: ZAP_COLORS.primary },
          color: ZAP_COLORS.textMuted,
        },
        label: {
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.7rem',
          fontWeight: 500,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: '#FFFFFF',
          color: ZAP_COLORS.textPrimary,
          boxShadow: `0 1px 0 ${ZAP_COLORS.border}`,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: ZAP_COLORS.border },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          background: ZAP_COLORS.primary,
          color: '#FFFFFF',
          fontWeight: 700,
          fontSize: '0.65rem',
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        colorDefault: {
          background: `linear-gradient(135deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.primaryDark})`,
          color: '#FFFFFF',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 4, height: 6 },
        bar: { borderRadius: 4, background: `linear-gradient(90deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.accent})` },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: { background: `${ZAP_COLORS.primary}10` },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked': {
            color: ZAP_COLORS.primary,
            '& + .MuiSwitch-track': { backgroundColor: ZAP_COLORS.primary },
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 500,
          textTransform: 'none',
          '&.Mui-selected': { color: ZAP_COLORS.primary, fontWeight: 600 },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { backgroundColor: ZAP_COLORS.primary, height: 3, borderRadius: 2 },
      },
    },
  },
});

export default theme;
export { ZAP_COLORS };
