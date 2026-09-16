import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';

import { useTheme } from '../core/theme/ThemeProvider';

/** Frosted bar background: real blur on iOS, a solid surface on Android. */
export function BarBackground() {
  const { colors, dark } = useTheme();
  return (
    <>
      {Platform.OS === 'ios' && <BlurView intensity={60} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'ios' ? colors.tabBar : colors.surface }]} />
    </>
  );
}
