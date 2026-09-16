import { Stack } from 'expo-router';

import { useTheme } from '../../core/theme/ThemeProvider';

export default function SettingsLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'ios_from_right' }} />;
}
