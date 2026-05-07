/**
 * Shared Design System Theme
 * Mirrored from the web project's index.css (Forest Green + Amber theme)
 */

export const Colors = {
  // Brand Colors
  primary: '#1a6a3a', // Forest Green (hsl(143 60% 26%))
  primaryForeground: '#ffffff',
  
  secondary: '#f4b41a', // Amber (hsl(43 87% 46%))
  secondaryForeground: '#1a140a', // (hsl(30 50% 10%))

  // Interface Colors
  background: '#f7f7f7', // (hsl(0 0% 97%))
  foreground: '#171f26', // (hsl(210 25% 12%))

  card: '#ffffff',
  cardForeground: '#171f26',
  cardBorder: '#e1e7e3', // (hsl(140 15% 88%))

  muted: '#f0f3f1', // (hsl(130 15% 95%))
  mutedForeground: '#677f71', // (hsl(140 10% 45%))

  accent: '#ebf1ed', // (hsl(130 15% 93%))
  accentForeground: '#154a29', // (hsl(143 60% 22%))

  destructive: '#f43f3f', // (hsl(0 84% 60%))
  destructiveForeground: '#ffffff',

  border: '#e1e7e3', // (hsl(140 12% 88%))
  input: '#e1e7e3',
  ring: '#1a6a3a',

  // Statuses
  success: '#1a6a3a',
  warning: '#f4b41a',
  error: '#f43f3f',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
};

export const Radius = {
  sm: 4,
  md: 8,
  lg: 10, // Mirroring --radius: 0.625rem
  xl: 14,
  full: 9999,
};

export const Typography = {
  fontSans: 'Inter', // Note: Must be loaded in Expo
  fontSerif: 'Playfair Display', // Note: Must be loaded in Expo
  
  sizes: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
  },
  
  weights: {
    light: '300',
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  } as const,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
};

export const Theme = {
  colors: Colors,
  spacing: Spacing,
  radius: Radius,
  typography: Typography,
  shadows: Shadows,
};

export default Theme;
