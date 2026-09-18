import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOutDown, withSpring, withTiming, ZoomIn, type EntryAnimationsValues, type LayoutAnimation } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS } from '../core/theme/typography';
import { EASE_OUT, SPRING } from './motion';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

interface ToastState {
  id: number;
  message: string | null;
  action?: { label: string; onPress: () => void };
  show: (message: string, action?: ToastState['action']) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  id: 0,
  message: null,
  show: (message, action) => set((s) => ({ id: s.id + 1, message, action })),
  hide: () => set({ message: null, action: undefined }),
}));

export const toast = (message: string, action?: ToastState['action']) => useToast.getState().show(message, action);

const toastIn = (_values: EntryAnimationsValues): LayoutAnimation => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 24 }, { scale: 0.94 }] },
    animations: {
      opacity: withTiming(1, { duration: 200, easing: EASE_OUT }),
      transform: [{ translateY: withSpring(0, SPRING) }, { scale: withSpring(1, SPRING) }],
    },
  };
};

export function ToastHost({ bottomOffset = 100 }: { bottomOffset?: number }) {
  const { colors, dark, accentId } = useTheme();
  const insets = useSafeAreaInsets();
  const { id, message, action, hide } = useToast();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, 3800);
    return () => clearTimeout(t);
  }, [id, message, hide]);

  if (!message) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + bottomOffset }]}>
      <Animated.View
        key={id}
        entering={toastIn}
        exiting={FadeOutDown.duration(180)}
        style={[styles.toast, { backgroundColor: dark ? colors.surfaceRaised : '#1C1C1E' }]}
      >
        {!action && (
          <Animated.View entering={ZoomIn.springify().damping(12).stiffness(260).delay(80)} style={[styles.check, { backgroundColor: colors.success }]}>
            <Icon name="check" size={12} color="#FFFFFF" strokeWidth={3.4} />
          </Animated.View>
        )}
        <Text variant="subhead" weight="medium" color="#FFFFFF" style={{ flexShrink: 1 }}>
          {message}
        </Text>
        {action && (
          <PressableScale
            feedback="light"
            onPress={() => {
              action.onPress();
              hide();
            }}
          >
            <Text variant="subhead" weight="semibold" color={accentId === 'mono' || accentId === 'custom' ? '#FFFFFF' : colors.accent}>
              {action.label}
            </Text>
          </PressableScale>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  check: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: RADIUS.pill,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
});
