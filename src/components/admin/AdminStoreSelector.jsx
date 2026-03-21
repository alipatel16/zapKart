import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, CircularProgress,
  Dialog, DialogTitle, DialogContent, Radio, RadioGroup,
  FormControlLabel, Chip,
} from '@mui/material';
import { Store, FlashOn, Add } from '@mui/icons-material';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { ZAP_COLORS } from '../../theme';

const AdminStoreSelector = ({ open, onClose, required = false }) => {
  const navigate = useNavigate();
  const { adminStore, setAdminStore } = useStore();
  const { updateUserProfile } = useAuth();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(adminStore?.id || '');

  useEffect(() => {
    if (!open) return;
    const fetchStores = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(db, COLLECTIONS.STORES), orderBy('name')));
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setStores(docs);
        // Pre-select: keep current store if still in list, else auto-select first
        if (adminStore && docs.find((s) => s.id === adminStore.id)) {
          setSelected(adminStore.id);
        } else if (docs.length === 1) {
          setSelected(docs[0].id);
        } else {
          setSelected('');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchStores();
  }, [open]);

  const handleConfirm = async () => {
    const store = stores.find((s) => s.id === selected);
    if (!store) return;
    setAdminStore(store);
    // Save adminStoreId to Firestore so FCM tokens are tagged correctly
    // for push notifications. This is what routes order alerts to the right admin.
    try {
      await updateUserProfile({ adminStoreId: store.id });
    } catch (err) {
      console.warn('Could not save adminStoreId to profile:', err.message);
    }
    onClose?.();
  };

  const handleGoAddStore = () => {
    onClose?.();
    navigate('/admin/stores');
  };

  return (
    <Dialog
      open={open}
      onClose={required ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: 2,
            background: `linear-gradient(135deg, ${ZAP_COLORS.primary}, ${ZAP_COLORS.primaryDark})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FlashOn sx={{ color: '#fff', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography fontWeight={800} fontFamily="'Syne', sans-serif">Select Your Store</Typography>
            <Typography variant="caption" color="text.secondary">Choose the store you're managing</Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress sx={{ color: ZAP_COLORS.primary }} />
          </Box>

        ) : stores.length === 0 ? (
          /* ── No stores exist yet ── */
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Box sx={{
              width: 64, height: 64, borderRadius: 3, mx: 'auto', mb: 2,
              background: `${ZAP_COLORS.primary}12`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Store sx={{ fontSize: 32, color: ZAP_COLORS.primary }} />
            </Box>
            <Typography variant="subtitle1" fontWeight={700} mb={0.5}>
              No stores found
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={0.5}>
              You need to add at least one store before you can manage products, orders, and inventory.
            </Typography>
          </Box>

        ) : (
          /* ── Store list ── */
          <RadioGroup value={selected} onChange={(e) => setSelected(e.target.value)}>
            {stores.map((store) => (
              <Box
                key={store.id}
                onClick={() => setSelected(store.id)}
                sx={{
                  border: `2px solid ${selected === store.id ? ZAP_COLORS.primary : ZAP_COLORS.border}`,
                  borderRadius: 2.5, p: 1.5, mb: 1.5, cursor: 'pointer',
                  background: selected === store.id ? `${ZAP_COLORS.primary}06` : '#fff',
                  transition: 'all 0.15s',
                  '&:hover': { borderColor: ZAP_COLORS.primary },
                }}
              >
                <FormControlLabel
                  value={store.id}
                  control={<Radio size="small" sx={{ '&.Mui-checked': { color: ZAP_COLORS.primary } }} />}
                  label={
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.3 }}>
                        <Store sx={{ fontSize: 16, color: ZAP_COLORS.primary }} />
                        <Typography variant="body2" fontWeight={700}>{store.name}</Typography>
                        {!store.active && (
                          <Chip label="Inactive" size="small" sx={{ height: 16, fontSize: '0.6rem' }} />
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {store.address}
                      </Typography>
                      <Typography variant="caption" sx={{ color: ZAP_COLORS.textMuted }}>
                        📦 {store.deliveryRadiusKm || 2}km radius
                        {store.openTime ? ` · 🕐 ${store.openTime}–${store.closeTime}` : ''}
                      </Typography>
                    </Box>
                  }
                  sx={{ m: 0, width: '100%', alignItems: 'flex-start' }}
                />
              </Box>
            ))}
          </RadioGroup>
        )}
      </DialogContent>

      <Box sx={{ px: 3, pb: 3, pt: 1, display: 'flex', gap: 1.5 }}>
        {/* Cancel — only shown when not required */}
        {!required && onClose && stores.length > 0 && (
          <Button fullWidth variant="outlined" onClick={onClose}>
            Cancel
          </Button>
        )}

        {stores.length === 0 ? (
          /* No stores → navigate to add store page */
          <Button
            fullWidth
            variant="contained"
            startIcon={<Add />}
            onClick={handleGoAddStore}
          >
            Add Your First Store
          </Button>
        ) : (
          /* Stores exist → confirm selection */
          <Button
            fullWidth
            variant="contained"
            disabled={!selected}
            onClick={handleConfirm}
          >
            Manage This Store
          </Button>
        )}
      </Box>
    </Dialog>
  );
};

export default AdminStoreSelector;