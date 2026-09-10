/**
 * Identité visuelle CECAW, reprise du back-office (frontend/tailwind.config.ts).
 * L'or foncé #B8860B est la couleur de marque : elle porte les actions
 * principales, jamais les statuts, qui gardent leur code couleur universel.
 */
export const brand = {
  50: '#fdf9e7',
  100: '#f8ecb4',
  200: '#f0d475',
  300: '#e5b830',
  400: '#d4991a',
  500: '#c47d0e',
  600: '#b8860b',
  700: '#96670a',
  800: '#744f08',
  900: '#553a06',
  950: '#2d1e03',
} as const;

export const colors = {
  brand: brand[600],
  brandDark: brand[800],
  brandDeep: brand[950],
  brandLight: brand[50],
  brandSoft: brand[100],
  brandAccent: brand[300],

  // Fonds : ardoise très clair côté web, repris ici pour la continuité.
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceAlt: '#f1f5f9',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',

  text: '#0f172a',
  textSoft: '#334155',
  muted: '#64748b',
  mutedLight: '#94a3b8',
  onBrand: '#ffffff',

  // Statuts alignés sur success / warning / danger du thème web.
  success: '#10b981',
  successDark: '#047857',
  successLight: '#ecfdf5',
  warning: '#f59e0b',
  warningDark: '#b45309',
  warningLight: '#fffbeb',
  danger: '#ef4444',
  dangerDark: '#b91c1c',
  dangerLight: '#fef2f2',
} as const;

/** Familles chargées dans app/_layout.tsx. */
export const fonts = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
  black: 'Poppins_900Black',
  /** Titres éditoriaux, comme le `--font-display` du web. */
  display: 'PlayfairDisplay_700Bold',
  /** Matricules, numéros de compte, montants : tout ce qui s'aligne. */
  mono: 'JetBrainsMono_500Medium',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;

/** Ombres douces : l'application est utilisée en plein soleil, le contraste prime. */
export const shadow = {
  card: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

export const type = {
  h1: { fontFamily: fonts.bold, fontSize: 24, letterSpacing: -0.5 },
  h2: { fontFamily: fonts.semibold, fontSize: 18, letterSpacing: -0.3 },
  title: { fontFamily: fonts.semibold, fontSize: 15 },
  body: { fontFamily: fonts.regular, fontSize: 14 },
  small: { fontFamily: fonts.regular, fontSize: 12 },
  label: { fontFamily: fonts.medium, fontSize: 13 },
  mono: { fontFamily: fonts.mono, fontSize: 12 },
} as const;
