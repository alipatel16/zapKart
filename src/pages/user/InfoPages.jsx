import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Typography, Accordion, AccordionSummary,
  AccordionDetails, Paper, Divider, IconButton,
} from '@mui/material';
import {
  ExpandMore, ArrowBack, Phone, Email, WhatsApp,
  Shield, Gavel, Info, HelpOutline,
} from '@mui/icons-material';
import { ZAP_COLORS } from '../../theme';

// ── Shared page wrapper ──────────────────────────────────────────────────────
const InfoPage = ({ title, subtitle, icon, children }) => {
  const navigate = useNavigate();
  return (
    <Box sx={{ pb: { xs: 13, md: 4 }, pt: 1 }}>
      <Container maxWidth="md">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, px: { xs: 1, sm: 0 } }}>
          <IconButton onClick={() => navigate(-1)} size="small"><ArrowBack /></IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ width: 40, height: 40, borderRadius: 2, background: `linear-gradient(135deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.primaryDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {React.cloneElement(icon, { sx: { color: '#fff', fontSize: 22 } })}
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif", lineHeight: 1.1 }}>{title}</Typography>
              {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
            </Box>
          </Box>
        </Box>
        {children}
      </Container>
    </Box>
  );
};

// ── HELP & SUPPORT ───────────────────────────────────────────────────────────
export const HelpPage = () => {
  const navigate = useNavigate();
  const faqs = [
    { q: 'How do I track my order?', a: 'Go to "My Orders" from the bottom navigation or your profile. Each order shows a live status tracker.' },
    { q: 'What is the delivery charge?', a: `We charge a small delivery fee of ₹${process.env.REACT_APP_DELIVERY_CHARGE || 10} per order. Orders above ₹${process.env.REACT_APP_FREE_DELIVERY_ABOVE || 299} get free delivery.` },
    { q: 'Can I cancel my order?', a: 'You can cancel your order only while it is in "Order Placed" status. Once processing begins, cancellation is not possible.' },
    { q: 'How do I apply a coupon?', a: 'In the Cart page, enter your coupon code in the field at the top of the order summary and tap Apply.' },
    { q: 'How do I add a new delivery address?', a: 'Go to Profile → Saved Addresses → Add New Address. You can save up to 5 addresses.' },
    { q: 'What payment methods are accepted?', a: 'We accept Cash on Delivery (COD) and all online payment methods via Razorpay — UPI, debit/credit cards, net banking.' },
    { q: 'I was charged but the order failed. What now?', a: `Online payments that fail mid-order are automatically refunded by Razorpay within 5-7 business days. Contact us if you don't see the refund.` },
    { q: `How do I download my invoice?`, a: `Go to My Orders, expand any delivered order, and tap "Download Invoice" to get a PDF.` },
  ];

  return (
    <InfoPage title="Help & Support" subtitle="We're here to help" icon={<HelpOutline />}>
      {/* Contact options */}
      <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, p: 2.5, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={2}>Contact Us</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[
            { icon: <Phone />, label: 'Call Us', value: '+91 98765 43210', href: 'tel:+919876543210', color: ZAP_COLORS.primary },
            { icon: <WhatsApp />, label: 'WhatsApp', value: '+91 98765 43210', href: 'https://wa.me/919876543210', color: '#25D366' },
            { icon: <Email />, label: 'Email Us', value: 'support@zapdelivery.com', href: 'mailto:support@zapdelivery.com', color: ZAP_COLORS.info },
          ].map((c) => (
            <Box
              key={c.label}
              component="a" href={c.href} target="_blank" rel="noreferrer"
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                p: 1.5, borderRadius: 2.5, textDecoration: 'none',
                border: `1px solid ${ZAP_COLORS.border}`,
                color: ZAP_COLORS.textPrimary,
                '&:hover': { background: `${c.color}08`, borderColor: `${c.color}40` },
                transition: 'all 0.15s',
              }}
            >
              <Box sx={{ width: 36, height: 36, borderRadius: 2, background: `${c.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {React.cloneElement(c.icon, { sx: { color: c.color, fontSize: 20 } })}
              </Box>
              <Box>
                <Typography variant="body2" fontWeight={600}>{c.label}</Typography>
                <Typography variant="caption" color="text.secondary">{c.value}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Paper>

      {/* FAQ */}
      <Typography variant="subtitle1" fontWeight={700} mb={1.5}>Frequently Asked Questions</Typography>
      {faqs.map((faq, i) => (
        <Accordion key={i} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: '12px !important', mb: 1, '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMore />} sx={{ px: 2 }}>
            <Typography variant="body2" fontWeight={600}>{faq.q}</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 2, pt: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>{faq.a}</Typography>
          </AccordionDetails>
        </Accordion>
      ))}

      <Box sx={{ mt: 3, p: 2, borderRadius: 2.5, background: `${ZAP_COLORS.primary}08`, border: `1px solid ${ZAP_COLORS.primary}20`, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Support hours: <strong>Mon–Sat, 9 AM – 9 PM</strong>
        </Typography>
      </Box>
    </InfoPage>
  );
};

// ── ABOUT US ─────────────────────────────────────────────────────────────────
export const AboutPage = () => (
  <InfoPage title="About Us" subtitle="Your local town's fastest delivery" icon={<Info />}>
    <Paper elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3, overflow: 'hidden', mb: 2 }}>
      <Box sx={{ background: `linear-gradient(135deg, ${ZAP_COLORS.secondary} 0%, #2A2A4E 100%)`, p: 4, textAlign: 'center' }}>
        <Box sx={{ width: 64, height: 64, borderRadius: 3, background: `linear-gradient(135deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.primaryDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2, boxShadow: `0 8px 24px ${ZAP_COLORS.primary}50` }}>
          <Box sx={{ fontSize: '2rem' }}>⚡</Box>
        </Box>
        <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif", color: '#fff', mb: 0.5 }}>ZAP Delivery</Typography>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>Delivering happiness, locally</Typography>
      </Box>
      <Box sx={{ p: 3 }}>
        <Typography variant="body1" sx={{ lineHeight: 1.8, color: ZAP_COLORS.textSecondary, mb: 2 }}>
          ZAP Delivery was built with one simple mission — to make your everyday shopping fast, fresh, and easy. We work directly with local stores in your town to bring you the best products at great prices, delivered to your doorstep in minutes.
        </Typography>
        <Typography variant="body1" sx={{ lineHeight: 1.8, color: ZAP_COLORS.textSecondary }}>
          We believe local businesses deserve a digital boost. By partnering with neighborhood stores, we help them reach more customers while giving you the convenience of instant delivery — all while keeping money in the local economy.
        </Typography>
      </Box>
    </Paper>

    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
      {[
        { emoji: '🛵', title: 'Fast Delivery', desc: 'Same-day delivery within 2km' },
        { emoji: '🏪', title: 'Local Stores', desc: 'Supporting neighborhood businesses' },
        { emoji: '💰', title: 'Best Prices', desc: 'No hidden fees, just fair prices' },
        { emoji: '✅', title: 'Quality Promise', desc: 'Fresh & genuine products always' },
      ].map((item) => (
        <Paper key={item.title} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 2.5, p: 2, textAlign: 'center' }}>
          <Box sx={{ fontSize: '1.8rem', mb: 0.8 }}>{item.emoji}</Box>
          <Typography variant="body2" fontWeight={700} mb={0.3}>{item.title}</Typography>
          <Typography variant="caption" color="text.secondary">{item.desc}</Typography>
        </Paper>
      ))}
    </Box>
  </InfoPage>
);

// ── PRIVACY POLICY ───────────────────────────────────────────────────────────
export const PrivacyPage = () => (
  <InfoPage title="Privacy Policy" subtitle="Last updated: January 2025" icon={<Shield />}>
    {[
      { title: '1. Information We Collect', body: 'We collect information you provide directly to us — such as your name, email address, phone number, and delivery addresses — when you create an account or place an order. We also collect location data (with your permission) to find the nearest store and enable delivery.' },
      { title: '2. How We Use Your Information', body: 'We use your information to process and deliver your orders, send you order updates and notifications, improve our services, and communicate with you about promotions and new features. We do not sell your personal data to third parties.' },
      { title: '3. Data Storage & Security', body: 'Your data is stored securely using Firebase (Google Cloud) infrastructure with industry-standard encryption. Payment information is processed by Razorpay and never stored on our servers.' },
      { title: '4. Location Data', body: 'We request location access only to detect your nearest store and calculate delivery distance. Location data is stored locally on your device and is not shared with third parties.' },
      { title: '5. Cookies & Local Storage', body: 'We use browser local storage to save your cart, location preferences, and login state between sessions. No third-party tracking cookies are used.' },
      { title: '6. Your Rights', body: 'You can request deletion of your account and all associated data at any time by contacting our support team. You can also update or correct your personal information from the Profile section.' },
      { title: '7. Contact', body: 'For privacy-related queries, contact us at privacy@zapdelivery.com.' },
    ].map((section) => (
      <Box key={section.title} sx={{ mb: 2.5 }}>
        <Typography variant="subtitle2" fontWeight={700} mb={0.8} sx={{ color: ZAP_COLORS.textPrimary }}>{section.title}</Typography>
        <Typography variant="body2" sx={{ lineHeight: 1.8, color: ZAP_COLORS.textSecondary }}>{section.body}</Typography>
        <Divider sx={{ mt: 2.5 }} />
      </Box>
    ))}
  </InfoPage>
);

// ── TERMS & CONDITIONS ───────────────────────────────────────────────────────
export const TermsPage = () => (
  <InfoPage title="Terms & Conditions" subtitle="Please read these carefully" icon={<Gavel />}>
    {[
      { title: '1. Acceptance of Terms', body: 'By using ZAP Delivery, you agree to these terms. If you do not agree, please do not use our services.' },
      { title: '2. Eligibility', body: 'You must be at least 18 years old to use this service. By using ZAP Delivery, you represent that you meet this requirement.' },
      { title: '3. Orders & Delivery', body: 'Orders are fulfilled by our partner stores. Delivery is available only within the service radius of your nearest store (typically 2km). We reserve the right to cancel orders due to stock unavailability, payment issues, or delivery constraints.' },
      { title: '4. Pricing & Payments', body: 'All prices are inclusive of GST unless stated otherwise. Delivery charges apply per order unless the order total meets the free delivery threshold. Razorpay processes online payments securely.' },
      { title: '5. Cancellations & Refunds', body: 'Orders can be cancelled only before processing begins. Online payment refunds are processed within 5–7 business days via the original payment method. COD orders that are cancelled do not require any refund action.' },
      { title: '6. User Conduct', body: 'You agree not to misuse the platform, provide false information, or attempt to defraud us or our partner stores. We reserve the right to suspend accounts that violate these terms.' },
      { title: '7. Limitation of Liability', body: 'ZAP Delivery is not liable for delays caused by circumstances beyond our control, including severe weather, traffic disruptions, or third-party failures.' },
      { title: '8. Changes to Terms', body: 'We may update these terms from time to time. Continued use of the service after changes constitutes acceptance of the revised terms.' },
    ].map((section) => (
      <Box key={section.title} sx={{ mb: 2.5 }}>
        <Typography variant="subtitle2" fontWeight={700} mb={0.8} sx={{ color: ZAP_COLORS.textPrimary }}>{section.title}</Typography>
        <Typography variant="body2" sx={{ lineHeight: 1.8, color: ZAP_COLORS.textSecondary }}>{section.body}</Typography>
        <Divider sx={{ mt: 2.5 }} />
      </Box>
    ))}
  </InfoPage>
);