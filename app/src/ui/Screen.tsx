import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../core/theme/ThemeProvider';
import { SPACE } from '../core/theme/typography';
import { BarBackground } from './BarBackground';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export const TAB_BAR_SPACE = 96;

export interface ScreenProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Element shown at the right of the large title. */
  accessory?: ReactNode;
  back?: boolean;
  /** Adds bottom space for the floating tab bar. */
  tabBar?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}

const COMPACT_HEIGHT = 44;

/** Scroll screen with an iOS-style large title that condenses into a blurred bar. */
export function Screen({ title, subtitle, children, accessory, back, tabBar, contentStyle, footer }: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [24, 56], [0, 1], Extrapolation.CLAMP),
  }));
  const compactTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [36, 60], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [36, 60], [6, 0], Extrapolation.CLAMP) }],
  }));
  const largeTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 40], [1, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(scrollY.value, [-120, 0], [1.08, 1], Extrapolation.CLAMP) },
      { translateY: interpolate(scrollY.value, [-120, 0], [4, 0], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          {
            paddingTop: insets.top + COMPACT_HEIGHT + (back ? 0 : 4),
            paddingBottom: (tabBar ? TAB_BAR_SPACE : 32) + insets.bottom,
            paddingHorizontal: SPACE.lg,
          },
          contentStyle,
        ]}
      >
        <Animated.View style={[styles.largeTitle, largeTitleStyle]}>
          <View style={{ flex: 1 }}>
            {subtitle && (
              <Text variant="footnote" tone="secondary" weight="semibold" style={styles.subtitle}>
                {subtitle.toUpperCase()}
              </Text>
            )}
            <Text variant="largeTitle">{title}</Text>
          </View>
          {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
        </Animated.View>
        {children}
      </Animated.ScrollView>

      <View style={[styles.bar, { paddingTop: insets.top, height: insets.top + COMPACT_HEIGHT }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, barStyle]} pointerEvents="none">
          <BarBackground />
          <View style={[styles.hairline, { backgroundColor: colors.separator }]} />
        </Animated.View>
        <View style={styles.barContent} pointerEvents="box-none">
          {back ? (
            <PressableScale onPress={() => router.back()} hitSlop={12} feedback="selection" style={styles.back}>
              <Icon name="chevronLeft" size={26} color={colors.accent} strokeWidth={2.4} />
            </PressableScale>
          ) : (
            <View style={styles.back} />
          )}
          <Animated.View style={[styles.compactTitle, compactTitleStyle]} pointerEvents="none">
            <Text variant="headline" numberOfLines={1} align="center">
              {title}
            </Text>
          </Animated.View>
          <View style={styles.back} />
        </View>
      </View>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  largeTitle: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: SPACE.lg, transformOrigin: 'left' },
  subtitle: { letterSpacing: 0.4, marginBottom: 2 },
  accessory: { marginLeft: SPACE.md },
  compactTitle: { flex: 1 },
  bar: { position: 'absolute', top: 0, left: 0, right: 0 },
  barContent: { height: COMPACT_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hairline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});
