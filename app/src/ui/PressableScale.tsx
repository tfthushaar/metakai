import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptic } from './haptics';
import { TAP_SPRING } from './motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  feedback?: 'none' | 'selection' | 'light' | 'medium';
}

export function PressableScale({ children, style, scaleTo = 0.97, feedback = 'none', onPressIn, onPressOut, onPress, disabled, ...rest }: PressableScaleProps) {
  const pressed = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scaleTo) * pressed.value }],
    opacity: (disabled ? 0.45 : 1) - pressed.value * 0.08,
  }), [disabled, scaleTo]);

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        pressed.value = withSpring(1, TAP_SPRING);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withSpring(0, TAP_SPRING);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (feedback !== 'none') haptic[feedback]();
        onPress?.(e);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
