import { Tabs, useRouter } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFeature, useSettings } from '../../core/store/settings';
import { activeWorkout, startWorkout } from '../../modules/workouts/repo';
import { EASE_OUT, SPRING } from '../../ui/motion';
import { useTheme } from '../../core/theme/ThemeProvider';
import { useLive } from '../../modules/gps/tracker';
import { BarBackground } from '../../ui/BarBackground';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { Text } from '../../ui/Text';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TAB_ICONS: Record<string, IconName> = {
  index: 'home',
  food: 'utensils',
  train: 'dumbbell',
  progress: 'chart',
  you: 'user',
};

function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const foodOn = useFeature('food');
  const trainOn = useFeature('workouts');
  const cardioOn = useFeature('cardio');
  const healthOn = useFeature('health');
  const gpsOn = useFeature('gps');
  const recording = useLive((s) => s.status !== 'idle');
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withSpring(menuOpen ? 1 : 0, SPRING);
  }, [menuOpen, rotation]);
  const plusStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value * 45}deg` }] }));

  const actions: { icon: IconName; label: string; onPress: () => void }[] = [
    ...(foodOn ? [{ icon: 'utensils' as IconName, label: 'Log food', onPress: () => router.push('/log-food') }] : []),
    { icon: 'scale', label: 'Weigh in', onPress: () => router.push('/log-weight') },
    ...(foodOn ? [{ icon: 'flame' as IconName, label: 'Quick add calories', onPress: () => router.push('/quick-add') }] : []),
    ...(trainOn
      ? [
          {
            icon: 'dumbbell' as IconName,
            label: activeWorkout() ? 'Resume workout' : 'Start workout',
            onPress: () => {
              startWorkout();
              router.push('/workout');
            },
          },
          { icon: 'check' as IconName, label: 'Log finished workout', onPress: () => router.push('/quick-workout') },
        ]
      : []),
    ...(gpsOn ? [{ icon: 'navigation' as IconName, label: recording ? 'Return to recording' : 'Record run or ride', onPress: () => router.push('/record') }] : []),
    ...(cardioOn ? [{ icon: 'footprints' as IconName, label: 'Log cardio', onPress: () => router.push('/log-cardio') }] : []),
    ...(healthOn ? [{ icon: 'heartPulse' as IconName, label: 'Log health marker', onPress: () => router.push('/log-marker') }] : []),
  ];

  const routes = state.routes.filter((r) => (descriptors[r.key].options as { href?: string | null }).href !== null);
  const middle = Math.ceil(routes.length / 2);

  const renderTab = (route: (typeof routes)[number]) => {
    const index = state.routes.indexOf(route);
    const focused = state.index === index;
    const { options } = descriptors[route.key];
    const color = focused ? colors.text : colors.textTertiary;
    return (
      <PressableScale
        key={route.key}
        feedback="selection"
        scaleTo={0.9}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={options.title}
        style={styles.tab}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        }}
      >
        <Icon name={TAB_ICONS[route.name] ?? 'grid'} size={23} color={color} strokeWidth={focused ? 2.4 : 2} />
        <Text variant="caption" color={color} weight={focused ? 'semibold' : 'medium'} style={{ fontSize: 10.5 }}>
          {options.title}
        </Text>
      </PressableScale>
    );
  };

  return (
    <>
      {menuOpen && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} accessibilityLabel="Close menu" />
          <View style={[styles.menu, { bottom: Math.max(insets.bottom, 10) + 80 }]} pointerEvents="box-none">
            {actions.map((a, i) => (
              <Animated.View key={a.label} entering={FadeInDown.duration(260).delay((actions.length - 1 - i) * 40).easing(EASE_OUT)}>
                <PressableScale
                  feedback="light"
                  onPress={() => {
                    setMenuOpen(false);
                    a.onPress();
                  }}
                  style={[styles.menuItem, { backgroundColor: colors.surfaceRaised }]}
                >
                  <View style={[styles.menuIcon, { backgroundColor: colors.accentSoft }]}>
                    <Icon name={a.icon} size={18} color={colors.accent} />
                  </View>
                  <Text variant="headline">{a.label}</Text>
                </PressableScale>
              </Animated.View>
            ))}
          </View>
        </Animated.View>
      )}
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View style={[styles.bar, { borderColor: colors.separator }]}>
          <BarBackground />
        {routes.slice(0, middle).map(renderTab)}
        <PressableScale
          feedback="medium"
          scaleTo={0.88}
          accessibilityLabel="Quick actions"
          onPress={() => setMenuOpen((o) => !o)}
          style={[styles.plus, { backgroundColor: colors.accent }]}
        >
          <Animated.View style={plusStyle}>
            <Icon name="plus" size={26} color={colors.onAccent} strokeWidth={2.6} />
          </Animated.View>
        </PressableScale>
        {routes.slice(middle).map(renderTab)}
      </View>
    </View>
    </>
  );
}

export default function TabsLayout() {
  const foodEnabled = useSettings((s) => s.enabledModules.includes('food'));
  const trainEnabled = useSettings((s) => s.enabledModules.includes('workouts') || s.enabledModules.includes('cardio') || s.enabledModules.includes('gps'));
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="food" options={{ title: 'Food', href: foodEnabled ? undefined : null }} />
      <Tabs.Screen name="train" options={{ title: 'Train', href: trainEnabled ? undefined : null }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
      <Tabs.Screen name="you" options={{ title: 'You' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 16 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 66,
    width: '100%',
    maxWidth: 440,
    borderRadius: 33,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, height: '100%' },
  menu: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 10 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 20,
    borderRadius: 999,
    width: 250,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  menuIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  plus: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginHorizontal: 6 },
});
