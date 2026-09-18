import { luminance, mixHex, textOn } from '../../lib/color';

export type Appearance = 'system' | 'light' | 'dark';
export type PresetAccent = 'crimson' | 'mono' | 'ember' | 'ocean' | 'forest' | 'iris';
export type AccentId = PresetAccent | 'custom';
export type DarkStyle = 'black' | 'graphite';

/** Colours picked by the user for the Custom theme. */
export interface CustomColors {
  /** Colour 1: buttons, rings and highlights. */
  primary: string;
  /** Colour 2: secondary highlights such as carbs and trend lines. */
  secondary: string;
  /** Background; null keeps the light or dark background. Cards and text are derived from it. */
  background: string | null;
}

export const DEFAULT_CUSTOM_COLORS: CustomColors = { primary: '#FF453A', secondary: '#0A84FF', background: null };

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
  /** Second colour for secondary highlights such as carbs and trend lines. */
  accent2: string;
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

export const ACCENTS: Record<PresetAccent, { name: string; light: string; dark: string }> = {
  crimson: { name: 'Crimson', light: '#E5262A', dark: '#FF453A' },
  mono: { name: 'Mono', light: '#000000', dark: '#FFFFFF' },
  ember: { name: 'Ember', light: '#F57A00', dark: '#FF9F0A' },
  ocean: { name: 'Ocean', light: '#007AFF', dark: '#0A84FF' },
  forest: { name: 'Forest', light: '#249E4A', dark: '#30D158' },
  iris: { name: 'Iris', light: '#8E44C9', dark: '#BF5AF2' },
};

export const ACCENT_ORDER: PresetAccent[] = ['crimson', 'mono', 'ember', 'ocean', 'forest', 'iris'];

export const accentName = (id: AccentId) => (id === 'custom' ? 'Custom' : ACCENTS[id].name);

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
  tabBar: 'rgba(250,250,252,0.97)',
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
    tabBar: 'rgba(16,16,18,0.97)',
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
    tabBar: 'rgba(28,28,31,0.97)',
  },
};

/** Whether a custom background reads as dark, so text, status bar and charts follow it. */
export const isDarkBackground = (hex: string) => luminance(hex) < 0.2;

/** Cards, fills, borders and text tones derived from any background colour. */
function fromBackground(bg: string): typeof LIGHT {
  const dark = isDarkBackground(bg);
  const text = dark ? '#FFFFFF' : '#000000';
  const status = dark ? DARK.black : LIGHT;
  return {
    background: bg,
    surface: mixHex(bg, text, dark ? 0.08 : 0.04),
    surfaceRaised: mixHex(bg, text, dark ? 0.13 : 0.02),
    fill: mixHex(bg, text, dark ? 0.15 : 0.09),
    text,
    textSecondary: mixHex(text, bg, 0.42),
    textTertiary: mixHex(text, bg, 0.64),
    separator: mixHex(bg, text, dark ? 0.14 : 0.1),
    success: status.success,
    warning: status.warning,
    danger: status.danger,
    overlay: status.overlay,
    tabBar: withAlpha(mixHex(bg, text, dark ? 0.06 : 0.03), 0.97),
  };
}

/** Whether the theme should be dark, given the appearance setting and any custom background. */
export function themeIsDark(systemDark: boolean, accentId: AccentId, custom: CustomColors): boolean {
  if (accentId === 'custom' && custom.background) return isDarkBackground(custom.background);
  return systemDark;
}

export function buildTheme(dark: boolean, accentId: AccentId, darkStyle: DarkStyle, custom: CustomColors = DEFAULT_CUSTOM_COLORS): Theme {
  const isCustom = accentId === 'custom';
  const base = isCustom && custom.background ? fromBackground(custom.background) : dark ? DARK[darkStyle] : LIGHT;
  const accent = isCustom ? custom.primary : dark ? ACCENTS[accentId].dark : ACCENTS[accentId].light;
  const onAccent = isCustom ? textOn(accent) : accentId === 'mono' ? (dark ? '#000000' : '#FFFFFF') : '#FFFFFF';
  return {
    dark,
    accentId,
    colors: {
      ...base,
      accent,
      accentSoft: withAlpha(accent, dark ? 0.2 : 0.12),
      accent2: isCustom ? custom.secondary : base.text,
      onAccent,
    },
  };
}
