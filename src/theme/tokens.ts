/**
 * Maverick Design Tokens
 *
 * Direção: painel de instrumentos de performance, não "app fitness genérico".
 * Base grafite (não preto puro) + um único acento de "ignição" em laranja,
 * usado com moderação para ações e dados de alta intensidade. Tudo o mais
 * fica quieto para esse acento se destacar.
 */

export const colors = {
  bg: '#0D0F11',
  surface: '#16191C',
  surfaceElevated: '#1F2327',
  border: '#272C31',

  ignition: '#FF5A1F',
  ignitionMuted: 'rgba(255, 90, 31, 0.16)',

  steel: '#7C8791',
  textPrimary: '#F3F1EC',
  textMuted: '#9AA1A6',

  danger: '#FF5C5C',
  success: '#5CD68A',
  warning: '#E8B94D',
  warningMuted: 'rgba(232, 185, 77, 0.12)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  full: 999,
};

/**
 * Display/numérico: Space Grotesk — geométrica, números marcantes.
 * Corpo: Inter — legibilidade em telas pequenas.
 * Mono: JetBrains Mono — leitura tipo "readout de instrumento" para
 * rótulos e métricas curtas (ex: "HRV 52ms").
 */
export const typography = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_500Medium',
};
