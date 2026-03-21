import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Typography, Grid, Skeleton, IconButton,
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db, COLLECTIONS } from '../../firebase';
import { ZAP_COLORS } from '../../theme';

const FALLBACK_EMOJIS = ['🥦','🍎','🥛','🛒','🧴','🍚','🧃','🧹','🍪','🥤','🫙','🥩','🧀','🌾','🫒'];

const CategoriesPage = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(query(collection(db, COLLECTIONS.CATEGORIES), where('active', '==', true), orderBy('order')))
      .then((snap) => {
        setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <Box sx={{ pb: { xs: 13, md: 3 }, pt: 1 }}>
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5, px: { xs: 1, sm: 0 } }}>
          <IconButton onClick={() => navigate(-1)} size="small"><ArrowBack /></IconButton>
          <Typography variant="h6" fontWeight={700}>
            All Categories
          </Typography>
        </Box>

        <Grid container spacing={{ xs: 1.5, sm: 2 }}>
          {loading
            ? Array(12).fill(0).map((_, i) => (
              <Grid item xs={4} sm={3} md={2} key={i}>
                <Box sx={{ textAlign: 'center' }}>
                  <Skeleton variant="rounded" sx={{ borderRadius: 3, aspectRatio: '1/1', mb: 1 }} />
                  <Skeleton width="60%" height={14} sx={{ mx: 'auto' }} />
                </Box>
              </Grid>
            ))
            : categories.map((cat, i) => (
              <Grid item xs={4} sm={3} md={2} key={cat.id}>
                <Box
                  onClick={() => navigate(`/category/${cat.id}`)}
                  sx={{ textAlign: 'center', cursor: 'pointer' }}
                >
                  {/* Image box */}
                  <Box sx={{
                    aspectRatio: '1/1',
                    borderRadius: 3,
                    mb: 1,
                    overflow: 'hidden',
                    border: `1.5px solid ${ZAP_COLORS.border}`,
                    background: `${ZAP_COLORS.primary}${8 + (i % 6) * 2}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                    '&:hover': {
                      transform: 'translateY(-3px) scale(1.03)',
                      boxShadow: `0 8px 20px ${ZAP_COLORS.primary}25`,
                      borderColor: `${ZAP_COLORS.primary}60`,
                    },
                    '&:active': { transform: 'scale(0.95)' },
                  }}>
                    {cat.imageUrl ? (
                      <Box
                        component="img"
                        src={cat.imageUrl}
                        alt={cat.name}
                        loading="lazy"
                        sx={{ width: '75%', height: '75%', objectFit: 'contain' }}
                      />
                    ) : (
                      <Box sx={{ fontSize: { xs: '2rem', sm: '2.4rem' } }}>
                        {FALLBACK_EMOJIS[i % FALLBACK_EMOJIS.length]}
                      </Box>
                    )}
                  </Box>
                  <Typography
                    variant="caption"
                    fontWeight={600}
                    sx={{ fontSize: { xs: '0.72rem', sm: '0.8rem' }, display: 'block', lineHeight: 1.3 }}
                  >
                    {cat.name}
                  </Typography>
                </Box>
              </Grid>
            ))
          }
        </Grid>
      </Container>
    </Box>
  );
};

export default CategoriesPage;