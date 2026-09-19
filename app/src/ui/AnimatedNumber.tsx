import { useEffect, useRef, useState } from 'react';
import { Platform, Text, TextInput, type TextStyle } from 'react-native';
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

const DURATION_MS = 700;

function format(value: number, decimals: number, suffix: string): string {
  'worklet';
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(value * factor) / factor;
  const [int, frac] = rounded.toFixed(decimals).split('.');
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (frac ? `${withCommas}.${frac}` : withCommas) + suffix;
}

/** Counts smoothly to a new value on the UI thread. */
function NativeNumber({ value, decimals = 0, variant = 'title1', color, style, suffix = '' }: AnimatedNumberProps) {
  const { colors } = useTheme();
  const shown = useSharedValue(value);

  useEffect(() => {
    shown.value = withTiming(value, { duration: DURATION_MS, easing: EASE_OUT });
  }, [value, shown]);

  const animatedProps = useAnimatedProps(() => {
    const text = format(shown.value, decimals, suffix);
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

/** Web: browsers ignore the native text prop, so count in JavaScript and render plain text. */
function WebNumber({ value, decimals = 0, variant = 'title1', color, style, suffix = '' }: AnimatedNumberProps) {
  const { colors } = useTheme();
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = start + (value - start) * eased;
      from.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <Text style={[TYPE[variant], { color: color ?? colors.text, fontVariant: ['tabular-nums'] }, style]}>{format(shown, decimals, suffix)}</Text>;
}

export const AnimatedNumber = Platform.OS === 'web' ? WebNumber : NativeNumber;
