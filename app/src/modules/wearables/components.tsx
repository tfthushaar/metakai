import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { useQuery } from '../../core/db/useQuery';
import { useSettings } from '../../core/store/settings';
import { useTheme } from '../../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../../core/theme/typography';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { SPRING } from '../../ui/motion';
import { Text } from '../../ui/Text';
import { useHeartRate } from './heartRate';
import { todayActivity } from './repo';

/** Live heart rate from the paired sensor; the heart gives a small beat on each new reading. */
export function HeartRateBadge() {
  const { colors } = useTheme();
  const paired = useSettings((s) => s.watch.hrDevice != null && s.enabledModules.includes('wearables'));
  const { status, bpm } = useHeartRate();
  const beat = useSharedValue(1);
  useEffect(() => {
    if (bpm != null) beat.value = withSequence(withTiming(1.25, { duration: 90 }), withSpring(1, SPRING));
  }, [bpm, beat]);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: beat.value }] }));
  if (!paired) return null;
  const live = status === 'connected' && bpm != null;
  return (
    <View style={[styles.badge, { backgroundColor: colors.fill }]} accessibilityLabel={live ? `Heart rate ${bpm}` : 'Heart rate sensor connecting'}>
      <Animated.View style={heartStyle}>
        <Icon name="heart" size={14} color={live ? colors.accent : colors.textTertiary} fill={live ? colors.accent : 'transparent'} />
      </Animated.View>
      <Text variant="footnote" weight="semibold" tabular color={live ? colors.text : colors.textTertiary}>
        {live ? String(bpm) : '––'}
      </Text>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="title3" tabular numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

const hoursLabel = (h: number) => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`;

/** Steps, last night's sleep and resting heart rate from the watch, or a prompt to connect one. */
export function WatchTodayCard({ index }: { index: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const connected = useSettings((s) => s.watch.health || s.watch.hrDevice != null);
  const today = useQuery(['health_markers'], () => todayActivity(), []);
  const open = () => router.push('/settings/devices');

  const empty = today.steps == null && today.sleep == null && today.rhr == null;
  if (!connected || empty) {
    return (
      <Card index={index} onPress={open}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: colors.fill }]}>
            <Icon name="watch" size={20} color={colors.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="headline">{connected ? 'Watch connected' : 'Connect your watch'}</Text>
            <Text variant="footnote" tone="secondary" numberOfLines={1}>
              {connected ? 'No steps or sleep yet today' : 'Steps, sleep, heart rate and workouts'}
            </Text>
          </View>
          <Icon name="chevronRight" size={18} color={colors.textTertiary} />
        </View>
      </Card>
    );
  }

  return (
    <Card index={index} onPress={open}>
      <View style={styles.stats}>
        <Stat value={today.steps != null ? Math.round(today.steps).toLocaleString('en-US') : '–'} label="steps" />
        <View style={[styles.divider, { backgroundColor: colors.separator }]} />
        <Stat value={today.sleep != null ? hoursLabel(today.sleep) : '–'} label="sleep" />
        <View style={[styles.divider, { backgroundColor: colors.separator }]} />
        <Stat value={today.rhr != null ? String(Math.round(today.rhr)) : '–'} label="resting bpm" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 11, borderRadius: RADIUS.pill },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  divider: { width: StyleSheet.hairlineWidth, height: 36 },
});
