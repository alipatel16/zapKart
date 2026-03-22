import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Button, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Select, MenuItem, FormControl,
  InputLabel, Switch, FormControlLabel, CircularProgress, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip,
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { ZAP_COLORS } from '../../theme';

const EMPTY_ENTRY = { categoryId: '', label: '', subtitle: '', order: 1, active: true };

// Stored at: settings/topPicksConfig
// Shape: { categories: [{categoryId, label, subtitle, order, active}] }

const AdminTopPicks = () => {
  const [config, setConfig] = useState([]); // array of category entries
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [dialog, setDialog] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [form, setForm] = useState(EMPTY_ENTRY);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [catsSnap, configSnap] = await Promise.all([
          getDocs(query(collection(db, COLLECTIONS.CATEGORIES), orderBy('name'))),
          getDoc(doc(db, 'settings', 'topPicksConfig')),
        ]);
        setCategories(catsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        if (configSnap.exists()) {
          const entries = configSnap.data().categories || [];
          setConfig(entries.sort((a, b) => (a.order || 0) - (b.order || 0)));
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const openAdd = () => {
    setEditIdx(null);
    setForm({ ...EMPTY_ENTRY, order: config.length + 1 });
    setError('');
    setDialog(true);
  };

  const openEdit = (idx) => {
    setEditIdx(idx);
    setForm({ ...config[idx] });
    setError('');
    setDialog(true);
  };

  const handleSave = async () => {
    if (!form.categoryId || !form.label) {
      setError('Category and display label are required.');
      return;
    }
    // Prevent duplicate category entries
    const isDuplicate = config.some((c, i) => c.categoryId === form.categoryId && i !== editIdx);
    if (isDuplicate) {
      setError('This category already has a Top Picks section.');
      return;
    }
    setSaving(true);
    try {
      let newConfig;
      if (editIdx !== null) {
        newConfig = config.map((c, i) => (i === editIdx ? { ...form } : c));
      } else {
        newConfig = [...config, { ...form }];
      }
      // Sort by order
      newConfig.sort((a, b) => (a.order || 0) - (b.order || 0));
      await setDoc(doc(db, 'settings', 'topPicksConfig'), {
        categories: newConfig,
        updatedAt: serverTimestamp(),
      });
      setConfig(newConfig);
      setDialog(false);
      setSuccess(editIdx !== null ? 'Section updated!' : 'Section added!');
      setTimeout(() => setSuccess(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (idx) => {
    const entry = config[idx];
    if (!window.confirm(`Remove "${entry.label}" from Top Picks?`)) return;
    const newConfig = config.filter((_, i) => i !== idx);
    await setDoc(doc(db, 'settings', 'topPicksConfig'), {
      categories: newConfig,
      updatedAt: serverTimestamp(),
    });
    setConfig(newConfig);
    setSuccess('Section removed!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const toggleActive = async (idx) => {
    const newConfig = config.map((c, i) => i === idx ? { ...c, active: !c.active } : c);
    await setDoc(doc(db, 'settings', 'topPicksConfig'), {
      categories: newConfig,
      updatedAt: serverTimestamp(),
    });
    setConfig(newConfig);
  };

  const getCategoryName = (id) => categories.find((c) => c.id === id)?.name || id;

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={800} sx={{ fontFamily: "'Syne', sans-serif" }}>
            Top Picks by Category
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Display curated product sections on the home page (max 6)
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={openAdd} disabled={config.length >= 6}>
          Add Section
        </Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}

      <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
        These sections appear on the user home page below "New Arrivals". Each section shows up to 6 products from the selected category. Max 6 sections.
      </Alert>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : config.length === 0 ? (
        <Paper elevation={0} sx={{ border: `1px dashed ${ZAP_COLORS.border}`, borderRadius: 3, p: 4, textAlign: 'center' }}>
          <Typography variant="h6" mb={1}>No sections configured</Typography>
          <Typography color="text.secondary" mb={2}>Add categories to show as "Top Picks" on the home page</Typography>
          <Button variant="outlined" startIcon={<Add />} onClick={openAdd}>Add First Section</Button>
        </Paper>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${ZAP_COLORS.border}`, borderRadius: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ background: `${ZAP_COLORS.primary}08` }}>
                {['Order', 'Category', 'Display Label', 'Subtitle', 'Active', 'Actions'].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.78rem', color: ZAP_COLORS.textSecondary }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {config.map((entry, idx) => (
                <TableRow key={idx} hover>
                  <TableCell sx={{ fontSize: '0.78rem', fontWeight: 600 }}>#{entry.order || idx + 1}</TableCell>
                  <TableCell>
                    <Chip label={getCategoryName(entry.categoryId)} size="small"
                      sx={{ background: `${ZAP_COLORS.primary}10`, color: ZAP_COLORS.primary, fontWeight: 600 }} />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{entry.label}</TableCell>
                  <TableCell sx={{ fontSize: '0.78rem', color: ZAP_COLORS.textMuted }}>{entry.subtitle || '—'}</TableCell>
                  <TableCell>
                    <Switch size="small" checked={!!entry.active} onChange={() => toggleActive(idx)} />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => openEdit(idx)}><Edit fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => handleDelete(idx)} sx={{ color: ZAP_COLORS.error }}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>{editIdx !== null ? 'Edit Section' : 'Add Top Picks Section'}</DialogTitle>
        <DialogContent dividers>
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

          <FormControl size="small" fullWidth sx={{ mb: 2 }}>
            <InputLabel>Category *</InputLabel>
            <Select value={form.categoryId} onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))} label="Category *">
              {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
          </FormControl>

          <TextField
            label="Display Label *" placeholder='e.g. "Top Picks for Daily Grooming"'
            value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
            size="small" fullWidth sx={{ mb: 2 }}
            helperText="This is the section title shown to users"
          />

          <TextField
            label="Subtitle (optional)" placeholder='e.g. "Essentials for every day"'
            value={form.subtitle} onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))}
            size="small" fullWidth sx={{ mb: 2 }}
          />

          <TextField
            label="Display Order" type="number"
            value={form.order} onChange={(e) => setForm((p) => ({ ...p, order: parseInt(e.target.value) || 1 }))}
            size="small" sx={{ width: 120, mb: 2 }}
            helperText="Lower = shown first"
          />

          <FormControlLabel
            control={<Switch checked={!!form.active} onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))} />}
            label="Show on home page"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : editIdx !== null ? 'Update' : 'Add Section'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminTopPicks;