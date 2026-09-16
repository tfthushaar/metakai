import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useSettings } from '../store/settings';
import { buildTheme, type Theme } from './palette';

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const appearance = useSettings((s) => s.appearance);
  const accent = useSettings((s) => s.accent);
  const darkStyle = useSettings((s) => s.darkStyle);
  const dark = appearance === 'system' ? system !== 'light' : appearance === 'dark';
  const theme = useMemo(() => buildTheme(dark, accent, darkStyle), [dark, accent, darkStyle]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside ThemeProvider');
  return theme;
}
