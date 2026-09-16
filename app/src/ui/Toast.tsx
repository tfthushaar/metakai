import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS } from '../core/theme/typography';
import { EASE_OUT } from './motion';
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
        entering={FadeInDown.duration(320).easing(EASE_OUT).withInitialValues({ opacity: 0, transform: [{ translateY: 16 }] })}
        exiting={FadeOutDown.duration(200)}
        style={[styles.toast, { backgroundColor: dark ? colors.surfaceRaised : '#1C1C1E' }]}
      >
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
            <Text variant="subhead" weight="semibold" color={accentId === 'mono' ? '#FFFFFF' : colors.accent}>
              {action.label}
            </Text>
          </PressableScale>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
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
