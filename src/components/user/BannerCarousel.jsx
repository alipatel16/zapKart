import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, EffectFade } from 'swiper/modules';
import { Box, Skeleton, useTheme } from '@mui/material';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/effect-fade';

const BannerCarousel = ({ banners = [], loading = false }) => {
  const theme = useTheme();

  if (loading) {
    return (
      <Box sx={{ width: '100%', mx: 'auto' }}>
        <Skeleton variant="rectangular" sx={{ borderRadius: 3, aspectRatio: { xs: '2.5/1', sm: '4/1' } }} />
      </Box>
    );
  }

  if (!banners.length) {
    return (
      <Box
        sx={{
          borderRadius: 3, overflow: 'hidden',
          aspectRatio: { xs: '2.5/1', sm: '4/1' },
          background: `linear-gradient(135deg, #FF6B35 0%, #1A1A2E 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Box sx={{ textAlign: 'center', color: '#fff' }}>
          <Box sx={{ fontSize: '2rem', mb: 1 }}>⚡</Box>
          <Box sx={{ fontFamily: "'Syne', sans-serif", fontSize: '1.5rem', fontWeight: 800 }}>ZAP DELIVERY</Box>
          <Box sx={{ fontSize: '0.9rem', opacity: 0.8 }}>Your local town's fastest delivery</Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        '& .swiper': { borderRadius: 3, overflow: 'hidden' },
        '& .swiper-pagination-bullet': {
          background: 'rgba(255,255,255,0.5)',
          width: 6, height: 6,
        },
        '& .swiper-pagination-bullet-active': {
          background: '#fff',
          width: 20,
          borderRadius: 3,
        },
        '& .swiper-pagination': { bottom: 10 },
      }}
    >
      <Swiper
        modules={[Autoplay, Pagination, EffectFade]}
        effect="fade"
        autoplay={{ delay: 4000, disableOnInteraction: false }}
        pagination={{ clickable: true }}
        loop
        style={{ width: '100%' }}
      >
        {banners.map((banner) => (
          <SwiperSlide key={banner.id}>
            <Box
              component={banner.link ? 'a' : 'div'}
              href={banner.link}
              onClick={banner.onClick}
              sx={{
                display: 'block',
                cursor: banner.link || banner.onClick ? 'pointer' : 'default',
                aspectRatio: { xs: '2.5/1', sm: '4/1' },
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <Box
                component="img"
                src={banner.imageUrl}
                alt={banner.title || 'Banner'}
                sx={{
                  width: '100%', height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
              {/* Gradient overlay for text */}
              {(banner.title || banner.subtitle) && (
                <Box sx={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)',
                  p: 2,
                }}>
                  {banner.title && (
                    <Box sx={{ color: '#fff', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: { xs: '1rem', sm: '1.3rem' } }}>
                      {banner.title}
                    </Box>
                  )}
                  {banner.subtitle && (
                    <Box sx={{ color: 'rgba(255,255,255,0.85)', fontSize: { xs: '0.75rem', sm: '0.9rem' } }}>
                      {banner.subtitle}
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          </SwiperSlide>
        ))}
      </Swiper>
    </Box>
  );
};

export default BannerCarousel;
