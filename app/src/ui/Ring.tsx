import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '../core/theme/ThemeProvider';
import { EASE_OUT } from './motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface RingProps {
  size: number;
  stroke: number;
  /** 0–1; values above 1 wrap as an overflow lap. */
  progress: number;
  color?: string;
  trackColor?: string;
  children?: ReactNode;
  delay?: number;
}

export function Ring({ size, stroke, progress, color, trackColor, children, delay = 0 }: RingProps) {
  const { colors } = useTheme();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = useSharedValue(0);

  useEffect(() => {
    value.value = withTiming(Math.max(0, progress), { duration: 900, easing: EASE_OUT });
  }, [progress, value, delay]);

  const mainProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - Math.min(value.value, 1)),
  }));
  const overflowProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - Math.min(Math.max(value.value - 1, 0), 1)),
    opacity: value.value > 1 ? 1 : 0,
  }));

  const ringColor = color ?? colors.accent;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor ?? colors.fill} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={mainProps}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.text}
          strokeOpacity={0.9}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={overflowProps}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
