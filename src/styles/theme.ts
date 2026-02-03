// Professional color palette with semantic meanings
export const colors = {
  // Primary brand colors
  primary: '#28c16a',
  primaryLight: '#d1fae5',
  primaryDark: '#109b4c',

  // Secondary brand colors
  secondary: '#0b6cfb',
  secondaryLight: '#dbeafe',
  secondaryDark: '#0554d1',

  // Neutral colors - backgrounds
  background: '#f8fafc',
  surface: '#ffffff',
  card: '#ffffff',

  // Text colors with proper hierarchy
  text: '#0f172a',
  textSecondary: '#64748b',
  textTertiary: '#94a3b8',
  muted: '#94a3b8',

  // Semantic colors
  success: '#10b981',
  successLight: '#d1fae5',
  successDark: '#047857',

  warning: '#f59e0b',
  warningLight: '#fef3c7',
  warningDark: '#d97706',

  error: '#ef4444',
  errorLight: '#fee2e2',
  errorDark: '#dc2626',

  info: '#3b82f6',
  infoLight: '#dbeafe',
  infoDark: '#1d4ed8',

  // Interaction colors
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  borderDark: '#cbd5e1',

  // Overlay/special
  overlay: 'rgba(15, 23, 42, 0.5)',
  disabled: '#cbd5e1',
};

// Enhanced spacing system
export const spacing = (n: number) => n * 8;

// Typography scale
export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 36,
    letterSpacing: -0.25,
  },
  h3: {
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 32,
  },
  h4: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
  },
  bodyLarge: {
    fontSize: 18,
    fontWeight: '400',
    lineHeight: 28,
  },
  bodyMedium: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  labelLarge: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  labelMedium: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  labelSmall: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    letterSpacing: 0.5,
  },
};
