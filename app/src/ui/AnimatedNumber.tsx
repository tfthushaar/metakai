import { useEffect } from 'react';
import { TextInput, type TextStyle } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '../core/theme/ThemeProvider';
import { TYPE, type TypeVariant } from '../core/theme/typography';
import { EASE_OUT } from './motion';

Animated.addWhitelistedNativeProps({ text: true });
const AnimatedInput = Animated.createAnimatedComponent(TextInput);

export interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  variant?: TypeVariant;
  color?: string;
  style?: TextStyle;
  suffix?: string;
}

/** Counts smoothly to a new value on the UI thread. */
export function AnimatedNumber({ value, decimals = 0, variant = 'title1', color, style, suffix = '' }: AnimatedNumberProps) {
  const { colors } = useTheme();
  const shown = useSharedValue(value);

  useEffect(() => {
    shown.value = withTiming(value, { duration: 700, easing: EASE_OUT });
  }, [value, shown]);

  const animatedProps = useAnimatedProps(() => {
    const factor = Math.pow(10, decimals);
    const rounded = Math.round(shown.value * factor) / factor;
    const fixed = rounded.toFixed(decimals);
    const [int, frac] = fixed.split('.');
    const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const text = (frac ? `${withCommas}.${frac}` : withCommas) + suffix;
    return { text, defaultValue: text } as object;
  });

  return (
    <AnimatedInput
      editable={false}
      underlineColorAndroid="transparent"
      caretHidden
      pointerEvents="none"
      animatedProps={animatedProps}
      style={[TYPE[variant], { color: color ?? colors.text, padding: 0, margin: 0, fontVariant: ['tabular-nums'] }, style]}
    />
  );
}
