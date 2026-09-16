import { Tabs, useRouter } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addWater } from '../../core/db/repo';
import { useLayout } from '../../core/store/layouts';
import { useSettings } from '../../core/store/settings';
import { dateKey } from '../../lib/dates';
import { activeWorkout, startWorkout } from '../../modules/workouts/repo';
import { EASE_OUT, SPRING } from '../../ui/motion';
import { useTheme } from '../../core/theme/ThemeProvider';
import { useLive } from '../../modules/gps/tracker';
import { AchievementWatcher, LeaderboardSync } from '../../modules/ranks/RanksSummary';
import { BarBackground } from '../../ui/BarBackground';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { Text } from '../../ui/Text';
import { toast } from '../../ui/Toast';

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
  const { height } = useWindowDimensions();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const recording = useLive((s) => s.status !== 'idle');
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withSpring(menuOpen ? 1 : 0, SPRING);
  }, [menuOpen, rotation]);
  const plusStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value * 45}deg` }] }));

  const quick = useLayout('quick');
  const ACTIONS: Record<string, { icon: IconName; label: string; onPress: () => void }> = {
    logFood: { icon: 'utensils', label: 'Log food', onPress: () => router.push('/log-food') },
    weighIn: { icon: 'scale', label: 'Weigh in', onPress: () => router.push('/log-weight') },
    quickAdd: { icon: 'flame', label: 'Quick add calories', onPress: () => router.push('/quick-add') },
    water: {
      icon: 'droplet',
      label: 'Add a glass of water',
      onPress: () => {
        addWater(dateKey(), 250);
        toast('Added 250 ml');
      },
    },
    workout: {
      icon: 'dumbbell',
      label: activeWorkout() ? 'Resume workout' : 'Start workout',
      onPress: () => {
        startWorkout();
        router.push('/workout');
      },
    },
    logWorkout: { icon: 'check', label: 'Log finished workout', onPress: () => router.push('/quick-workout') },
    record: { icon: 'navigation', label: recording ? 'Return to recording' : 'Record run or ride', onPress: () => router.push('/record') },
    logCardio: { icon: 'footprints', label: 'Log cardio', onPress: () => router.push('/log-cardio') },
    intervals: { icon: 'timer', label: 'Interval timer', onPress: () => router.push('/interval-timer') },
    checkIn: { icon: 'heartPulse', label: 'Readiness check-in', onPress: () => router.push('/recovery') },
    logMarker: { icon: 'heartPulse', label: 'Log health marker', onPress: () => router.push('/log-marker') },
    photo: { icon: 'user', label: 'Progress photo', onPress: () => router.push('/photos') },
    measure: { icon: 'ruler', label: 'Measurements', onPress: () => router.push('/log-measurements') },
  };
  const actions = quick.map((id) => ACTIONS[id]).filter(Boolean);

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
          <ScrollView
            style={[styles.menu, { bottom: Math.max(insets.bottom, 10) + 80, maxHeight: height - insets.top - Math.max(insets.bottom, 10) - 100 }]}
            contentContainerStyle={styles.menuContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.menuColumn}>
              {actions.map((a, i) => (
                <Animated.View
                  key={a.label}
                  entering={FadeInDown.duration(260)
                    .delay((actions.length - 1 - i) * 40)
                    .easing(EASE_OUT)}
                >
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
          </ScrollView>
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

let startApplied = false;

export default function TabsLayout() {
  const router = useRouter();
  const startTab = useSettings((s) => s.startTab);
  useEffect(() => {
    if (startApplied) return;
    startApplied = true;
    if (startTab !== 'index') router.navigate(`/(tabs)/${startTab}` as never);
  }, [router, startTab]);
  const foodEnabled = useSettings((s) => s.enabledModules.includes('food'));
  const trainEnabled = useSettings((s) => s.enabledModules.some((m) => m === 'workouts' || m === 'cardio' || m === 'gps'));
  return (
    <>
      <AchievementWatcher />
      <LeaderboardSync />
      <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Tabs.Screen name="index" options={{ title: 'Today' }} />
        <Tabs.Screen name="food" options={{ title: 'Food', href: foodEnabled ? undefined : null }} />
        <Tabs.Screen name="train" options={{ title: 'Train', href: trainEnabled ? undefined : null }} />
        <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
        <Tabs.Screen name="you" options={{ title: 'You' }} />
      </Tabs>
    </>
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
  menu: { position: 'absolute', left: 0, right: 0, flexGrow: 0 },
  menuContent: { alignItems: 'center', paddingTop: 10, flexGrow: 1, justifyContent: 'flex-end' },
  menuColumn: { gap: 10, alignItems: 'stretch', minWidth: 250, maxWidth: '92%' },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 20,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  menuIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  plus: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginHorizontal: 6 },
});
