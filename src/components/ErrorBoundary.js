import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { trackError } from '../utils/analytics';
import { ZAP_COLORS } from '../theme';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to Firebase Analytics
    trackError(`${error.message} | ${info.componentStack?.split('\n')[1]?.trim()}`, true);
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <Box sx={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#FFF8F5', p: 3, textAlign: 'center',
      }}>
        <Box sx={{
          width: 72, height: 72, borderRadius: 3, mx: 'auto', mb: 3,
          background: `${ZAP_COLORS.error}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Box sx={{ fontSize: '2.5rem' }}>😔</Box>
        </Box>
        <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif", mb: 1 }}>
          Something went wrong
        </Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mb: 3, maxWidth: 360 }}>
          We've been notified and are working on a fix. Please try refreshing the page.
        </Typography>
        {process.env.NODE_ENV === 'development' && this.state.error && (
          <Box sx={{ mb: 3, p: 2, borderRadius: 2, background: '#fff', border: `1px solid ${ZAP_COLORS.border}`, maxWidth: 480, textAlign: 'left' }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: ZAP_COLORS.error, display: 'block', wordBreak: 'break-word' }}>
              {this.state.error.message}
            </Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="contained" onClick={this.handleReload}>
            Go to Home
          </Button>
          <Button variant="outlined" onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
        </Box>
      </Box>
    );
  }
}

export default ErrorBoundary;