// ============================================================
// src/pages/user/Auth.jsx
// ============================================================
import React, { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Container, Typography, TextField, Button, Divider,
  IconButton, InputAdornment, Alert, Tab, Tabs, CircularProgress,
} from '@mui/material';
import { Visibility, VisibilityOff, FlashOn, Google, Facebook, MarkEmailRead } from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { ZAP_COLORS } from '../../theme';

const Auth = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const from      = location.state?.from?.pathname || '/';
  const { loginWithGoogle, loginWithFacebook, loginWithEmail, registerWithEmail, resetPassword } = useAuth();

  const [tab, setTab]             = useState(0); // 0=login, 1=register
  const [showPwd, setShowPwd]     = useState(false);
  const [loading, setLoading]     = useState('');
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  // ✅ BOT PROTECTION: Show this screen after successful registration
  // instead of navigating away — user must verify email before using the app.
  const [verifyEmailScreen, setVerifyEmailScreen] = useState(false);

  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });

  // ✅ BOT PROTECTION: Track when the register tab was opened.
  // Bots fill forms in milliseconds — real users take at least a few seconds.
  const registerOpenedAt = useRef(null);

  const handleChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleTabChange = (_, v) => {
    setTab(v);
    setError('');
    // Start the timer when the user opens the register tab
    if (v === 1) registerOpenedAt.current = Date.now();
  };

  const handleSocial = async (provider) => {
    setLoading(provider);
    setError('');
    try {
      if (provider === 'google') await loginWithGoogle();
      else await loginWithFacebook();
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading('');
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();

    if (tab === 1) {
      // ✅ BOT PROTECTION 1 — Honeypot check.
      // The "website" field is hidden from real users via CSS.
      // Bots that auto-fill forms will populate it — we silently block them.
      if (form.website) {
        // Silent fail — don't tell the bot it was caught
        setLoading('');
        return;
      }

      // ✅ BOT PROTECTION 2 — Time check.
      // Real users take at least 5 seconds to fill out a registration form.
      // Automated scripts complete it almost instantly.
      const elapsed = Date.now() - (registerOpenedAt.current || 0);
      if (elapsed < 5000) {
        setLoading('');
        return; // Silent fail
      }

      if (form.password !== form.confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    setLoading('email');
    setError('');
    try {
      if (tab === 0) {
        await loginWithEmail(form.email, form.password);
        navigate(from, { replace: true });
      } else {
        await registerWithEmail(form.email, form.password, form.name);
        // ✅ BOT PROTECTION 3 — Show verify email screen instead of logging in.
        // Account is created but user lands here until they verify their email.
        // Bots that create accounts get stuck here and can't access the app.
        setVerifyEmailScreen(true);
      }
    } catch (err) {
      const msgs = {
        'auth/user-not-found':        'No account found with this email',
        'auth/wrong-password':        'Incorrect password',
        'auth/email-already-in-use':  'Email already registered. Please login.',
        'auth/weak-password':         'Password must be at least 6 characters',
        'auth/invalid-email':         'Invalid email address',
        'auth/invalid-credential':    'Incorrect email or password',
      };
      setError(msgs[err.code] || err.message || 'Authentication failed');
    } finally {
      setLoading('');
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setLoading('forgot');
    setError('');
    try {
      await resetPassword(form.email);
      setSuccess('Password reset email sent! Check your inbox.');
      setForgotMode(false);
    } catch (err) {
      setError('Failed to send reset email. Check your email address.');
    } finally {
      setLoading('');
    }
  };

  // ── Verify email screen ──────────────────────────────────────────────────────
  if (verifyEmailScreen) {
    return (
      <Box sx={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        background: `linear-gradient(160deg, ${ZAP_COLORS.primary}15 0%, ${ZAP_COLORS.accent}10 50%, #fff 100%)`,
      }}>
        <Container maxWidth="xs" sx={{ py: 4 }}>
          <Box sx={{
            background: '#fff', borderRadius: 4,
            boxShadow: '0 8px 32px rgba(255,107,53,0.12)',
            p: 4, textAlign: 'center',
          }}>
            <Box sx={{
              width: 72, height: 72, borderRadius: '50%',
              background: `linear-gradient(135deg, ${ZAP_COLORS.primary}20, ${ZAP_COLORS.primary}40)`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              mb: 2,
            }}>
              <MarkEmailRead sx={{ fontSize: 36, color: ZAP_COLORS.primary }} />
            </Box>
            <Typography variant="h6" fontWeight={700} mb={1}>
              Check your inbox!
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              We sent a verification link to <strong>{form.email}</strong>.
              Please verify your email before logging in.
            </Typography>
            <Button
              variant="contained" fullWidth
              onClick={() => {
                setVerifyEmailScreen(false);
                setTab(0);
                setForm({ name: '', email: form.email, password: '', confirmPassword: '' });
              }}
            >
              Go to Login
            </Button>
            <Typography variant="caption" color="text.secondary" display="block" mt={2}>
              Didn't receive it? Check your spam folder.
            </Typography>
          </Box>
        </Container>
      </Box>
    );
  }

  // ── Main auth screen ─────────────────────────────────────────────────────────
  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      background: `linear-gradient(160deg, ${ZAP_COLORS.primary}15 0%, ${ZAP_COLORS.accent}10 50%, #fff 100%)`,
    }}>
      <Container maxWidth="xs" sx={{ py: 4 }}>
        {/* Logo */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box sx={{
            width: 64, height: 64, borderRadius: 3,
            background: `linear-gradient(135deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.primaryDark})`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            mb: 2, boxShadow: `0 8px 24px ${ZAP_COLORS.primary}40`,
          }}>
            <FlashOn sx={{ color: '#fff', fontSize: 36 }} />
          </Box>
          <Typography variant="h4" sx={{ fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>ZAP</Typography>
          <Typography variant="body2" color="text.secondary">Your local town's fastest delivery</Typography>
        </Box>

        <Box sx={{
          background: '#fff', borderRadius: 4,
          boxShadow: '0 8px 32px rgba(255,107,53,0.12)',
          overflow: 'hidden',
        }}>
          {!forgotMode ? (
            <>
              <Tabs value={tab} onChange={handleTabChange}
                sx={{ borderBottom: `1px solid ${ZAP_COLORS.border}` }}>
                <Tab label="Login" sx={{ flex: 1 }} />
                <Tab label="Create Account" sx={{ flex: 1 }} />
              </Tabs>

              <Box sx={{ p: 3 }}>
                {error   && <Alert severity="error"   sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}

                {/* Social logins */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2.5 }}>
                  <Button
                    fullWidth variant="outlined" startIcon={<Google sx={{ color: '#EA4335' }} />}
                    onClick={() => handleSocial('google')}
                    disabled={!!loading}
                    sx={{ borderColor: ZAP_COLORS.border, color: ZAP_COLORS.textPrimary, justifyContent: 'flex-start', px: 2 }}
                  >
                    {loading === 'google' ? <CircularProgress size={18} /> : 'Continue with Google'}
                  </Button>
                  <Button
                    fullWidth variant="outlined" startIcon={<Facebook sx={{ color: '#1877F2' }} />}
                    onClick={() => handleSocial('facebook')}
                    disabled={!!loading}
                    sx={{ borderColor: ZAP_COLORS.border, color: ZAP_COLORS.textPrimary, justifyContent: 'flex-start', px: 2 }}
                  >
                    {loading === 'facebook' ? <CircularProgress size={18} /> : 'Continue with Facebook'}
                  </Button>
                </Box>

                <Divider sx={{ mb: 2.5 }}>
                  <Typography variant="caption" color="text.secondary">or with email</Typography>
                </Divider>

                {/* Email form */}
                <Box component="form" onSubmit={handleEmailAuth} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {tab === 1 && (
                    <TextField
                      name="name" label="Full Name" value={form.name}
                      onChange={handleChange} required fullWidth size="small"
                    />
                  )}
                  <TextField
                    name="email" label="Email Address" type="email"
                    value={form.email} onChange={handleChange} required fullWidth size="small"
                  />
                  <TextField
                    name="password" label="Password" type={showPwd ? 'text' : 'password'}
                    value={form.password} onChange={handleChange} required fullWidth size="small"
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setShowPwd(!showPwd)}>
                            {showPwd ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  {tab === 1 && (
                    <TextField
                      name="confirmPassword" label="Confirm Password" type="password"
                      value={form.confirmPassword} onChange={handleChange} required fullWidth size="small"
                    />
                  )}

                  {/* ✅ BOT PROTECTION: Honeypot field.
                      Completely hidden from real users — bots auto-fill it and get blocked.
                      IMPORTANT: Never remove the display:none style. */}
                  <input
                    type="text"
                    name="website"
                    value={form.website || ''}
                    onChange={handleChange}
                    style={{ display: 'none' }}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                  />

                  {tab === 0 && (
                    <Typography
                      variant="caption" onClick={() => setForgotMode(true)}
                      sx={{ color: ZAP_COLORS.primary, cursor: 'pointer', alignSelf: 'flex-end' }}
                    >
                      Forgot password?
                    </Typography>
                  )}

                  <Button
                    type="submit" variant="contained" fullWidth size="large"
                    disabled={!!loading}
                    sx={{ mt: 0.5 }}
                  >
                    {loading === 'email'
                      ? <CircularProgress size={22} sx={{ color: '#fff' }} />
                      : tab === 0 ? 'Login' : 'Create Account'}
                  </Button>
                </Box>
              </Box>
            </>
          ) : (
            <Box sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={700} mb={0.5}>Reset Password</Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Enter your email and we'll send a reset link.
              </Typography>
              {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
              <Box component="form" onSubmit={handleForgot} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  name="email" label="Email Address" type="email"
                  value={form.email} onChange={handleChange} required fullWidth size="small"
                />
                <Button type="submit" variant="contained" fullWidth disabled={loading === 'forgot'}>
                  {loading === 'forgot' ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Send Reset Link'}
                </Button>
                <Button variant="text" onClick={() => setForgotMode(false)} sx={{ color: ZAP_COLORS.textSecondary }}>
                  ← Back to Login
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      </Container>
    </Box>
  );
};

export default Auth;