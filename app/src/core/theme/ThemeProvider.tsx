import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useSettings } from '../store/settings';
import { buildTheme, themeIsDark, type Theme } from './palette';

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const appearance = useSettings((s) => s.appearance);
  const accent = useSettings((s) => s.accent);
  const darkStyle = useSettings((s) => s.darkStyle);
  const custom = useSettings((s) => s.customColors);
  const dark = themeIsDark(appearance === 'system' ? system !== 'light' : appearance === 'dark', accent, custom);
  const theme = useMemo(() => buildTheme(dark, accent, darkStyle, custom), [dark, accent, darkStyle, custom]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside ThemeProvider');
  return theme;
}
