import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useTheme } from '../core/theme/ThemeProvider';
import { EASE_OUT } from './motion';

export function ProgressBar({ progress, color, height = 6, delay = 0 }: { progress: number; color?: string; height?: number; delay?: number }) {
  const { colors } = useTheme();
  const value = useSharedValue(0);

  useEffect(() => {
    value.value = withDelay(delay, withTiming(Math.min(1, Math.max(0, progress)), { duration: 800, easing: EASE_OUT }));
  }, [progress, delay, value]);

  const fill = useAnimatedStyle(() => ({ width: `${value.value * 100}%` }));

  return (
    <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: colors.fill }]}>
      <Animated.View style={[styles.fill, { borderRadius: height / 2, backgroundColor: color ?? colors.accent }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
  fill: { height: '100%' },
});
