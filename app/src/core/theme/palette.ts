export type Appearance = 'system' | 'light' | 'dark';
export type AccentId = 'crimson' | 'mono' | 'ember' | 'ocean' | 'forest' | 'iris';
export type DarkStyle = 'black' | 'graphite';

export interface Colors {
  background: string;
  surface: string;
  surfaceRaised: string;
  fill: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  separator: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  success: string;
  warning: string;
  danger: string;
  overlay: string;
  tabBar: string;
}

export interface Theme {
  dark: boolean;
  accentId: AccentId;
  colors: Colors;
}

export const ACCENTS: Record<AccentId, { name: string; light: string; dark: string }> = {
  crimson: { name: 'Crimson', light: '#E5262A', dark: '#FF453A' },
  mono: { name: 'Mono', light: '#000000', dark: '#FFFFFF' },
  ember: { name: 'Ember', light: '#F57A00', dark: '#FF9F0A' },
  ocean: { name: 'Ocean', light: '#007AFF', dark: '#0A84FF' },
  forest: { name: 'Forest', light: '#249E4A', dark: '#30D158' },
  iris: { name: 'Iris', light: '#8E44C9', dark: '#BF5AF2' },
};

export const ACCENT_ORDER: AccentId[] = ['crimson', 'mono', 'ember', 'ocean', 'forest', 'iris'];

function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

const LIGHT = {
  background: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  fill: '#E8E8ED',
  text: '#000000',
  textSecondary: '#6E6E73',
  textTertiary: '#AEAEB2',
  separator: '#E0E0E5',
  success: '#249E4A',
  warning: '#E08600',
  danger: '#E5262A',
  overlay: 'rgba(0,0,0,0.35)',
  tabBar: 'rgba(250,250,252,0.86)',
};

const DARK: Record<DarkStyle, typeof LIGHT> = {
  black: {
    background: '#000000',
    surface: '#141416',
    surfaceRaised: '#1E1E21',
    fill: '#242428',
    text: '#FFFFFF',
    textSecondary: '#8E8E93',
    textTertiary: '#545458',
    separator: '#262629',
    success: '#30D158',
    warning: '#FF9F0A',
    danger: '#FF453A',
    overlay: 'rgba(0,0,0,0.6)',
    tabBar: 'rgba(10,10,12,0.82)',
  },
  graphite: {
    background: '#111113',
    surface: '#1C1C1F',
    surfaceRaised: '#26262A',
    fill: '#2C2C31',
    text: '#F5F5F7',
    textSecondary: '#92929A',
    textTertiary: '#5A5A60',
    separator: '#2E2E33',
    success: '#30D158',
    warning: '#FF9F0A',
    danger: '#FF453A',
    overlay: 'rgba(0,0,0,0.55)',
    tabBar: 'rgba(24,24,27,0.84)',
  },
};

export function buildTheme(dark: boolean, accentId: AccentId, darkStyle: DarkStyle): Theme {
  const base = dark ? DARK[darkStyle] : LIGHT;
  const accent = dark ? ACCENTS[accentId].dark : ACCENTS[accentId].light;
  const onAccent = accentId === 'mono' ? (dark ? '#000000' : '#FFFFFF') : '#FFFFFF';
  return {
    dark,
    accentId,
    colors: {
      ...base,
      accent,
      accentSoft: withAlpha(accent, dark ? 0.2 : 0.12),
      onAccent,
    },
  };
}
