import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { useSettings } from '../../core/store/settings';
import { useTheme } from '../../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../../core/theme/typography';
import { formatDuration } from '../../lib/strength';
import { kgToLb, type UnitSystem } from '../../lib/units';
import { Icon } from '../../ui/Icon';
import { EASE_OUT } from '../../ui/motion';
import { PressableScale } from '../../ui/PressableScale';
import { Text } from '../../ui/Text';
import { exerciseImageUrl, type Exercise } from './exercises';
import { useRestTimer } from './restTimer';

/** Weight in display units, rounded for inputs. */
export function kgToUnits(kg: number, units: UnitSystem): number {
  const v = units === 'metric' ? kg : kgToLb(kg);
  return Math.round(v * 100) / 100;
}

export function formatWeight(kg: number | null | undefined, units: UnitSystem): string {
  if (kg == null) return '—';
  const v = kgToUnits(kg, units);
  return `${Number.isInteger(v) ? v : v.toFixed(v * 10 === Math.round(v * 10) ? 1 : 2)}`;
}

export function formatVolume(kg: number, units: UnitSystem): string {
  const v = units === 'metric' ? kg : kgToLb(kg);
  if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
  return Math.round(v).toLocaleString('en-US');
}

export function ExerciseThumb({ exercise, size = 44 }: { exercise: Exercise; size?: number }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const showImage = exercise.imageCount > 0 && !failed;
  return (
    <View style={[styles.thumb, { width: size, height: size, backgroundColor: colors.fill }]}>
      {showImage ? (
        <Image source={{ uri: exerciseImageUrl(exercise.id) }} style={StyleSheet.absoluteFill} onError={() => setFailed(true)} resizeMode="cover" />
      ) : (
        <Icon name="dumbbell" size={size * 0.45} color={colors.textTertiary} />
      )}
    </View>
  );
}

/** Alternates the two demo frames to read like a short animation. */
export function ExercisePreview({ exercise, height = 220 }: { exercise: Exercise; height?: number }) {
  const { colors } = useTheme();
  const [frame, setFrame] = useState(0);
  const [failed, setFailed] = useState(false);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (exercise.imageCount < 2) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % 2), 1400);
    return () => clearInterval(t);
  }, [exercise.imageCount]);

  useEffect(() => {
    opacity.value = withTiming(frame, { duration: 450, easing: EASE_OUT });
  }, [frame, opacity]);

  const second = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (exercise.imageCount === 0 || failed) {
    return (
      <View style={[styles.preview, { height, backgroundColor: colors.fill }]}>
        <Icon name="dumbbell" size={48} color={colors.textTertiary} />
      </View>
    );
  }
  return (
    <View style={[styles.preview, { height, backgroundColor: '#FFFFFF' }]}>
      <Image source={{ uri: exerciseImageUrl(exercise.id, 0) }} style={StyleSheet.absoluteFill} resizeMode="contain" onError={() => setFailed(true)} />
      {exercise.imageCount > 1 && (
        <Animated.Image source={{ uri: exerciseImageUrl(exercise.id, 1) }} style={[StyleSheet.absoluteFill, second]} resizeMode="contain" />
      )}
    </View>
  );
}

function useNow(active: boolean, interval = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [active, interval]);
  return now;
}

export function ElapsedText({ since, variant = 'headline', color }: { since: string; variant?: 'headline' | 'title2' | 'subhead' | 'footnote'; color?: string }) {
  const now = useNow(true, 1000);
  return (
    <Text variant={variant} tabular color={color}>
      {formatDuration(now - new Date(since).getTime())}
    </Text>
  );
}

export function RestTimerBar({ bottomInset = 0 }: { bottomInset?: number }) {
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const { endsAt, duration, adjust, skip, finish } = useRestTimer();
  const now = useNow(endsAt != null);
  const remaining = endsAt ? Math.max(0, endsAt - now) : 0;

  useEffect(() => {
    if (endsAt && remaining <= 0) finish();
  }, [endsAt, remaining, finish]);

  if (!endsAt) return null;
  const progress = duration > 0 ? remaining / (duration * 1000) : 0;
  const size = 44;
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;

  return (
    <Animated.View
      entering={FadeInDown.duration(300).easing(EASE_OUT)}
      exiting={FadeOutDown.duration(200)}
      style={[styles.rest, { bottom: insets.bottom + SPACE.md + bottomInset, backgroundColor: dark ? colors.surfaceRaised : '#111113' }]}
    >
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.15)" strokeWidth={4} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.accent}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - progress)}
        />
      </Svg>
      <View style={{ flex: 1 }}>
        <Text variant="caption" color="rgba(255,255,255,0.6)">
          REST
        </Text>
        <Text variant="title2" color="#FFFFFF" tabular>
          {formatDuration(remaining + 999)}
        </Text>
      </View>
      <PressableScale feedback="selection" onPress={() => adjust(-15)} style={styles.restButton}>
        <Text variant="subhead" weight="semibold" color="#FFFFFF">
          −15
        </Text>
      </PressableScale>
      <PressableScale feedback="selection" onPress={() => adjust(15)} style={styles.restButton}>
        <Text variant="subhead" weight="semibold" color="#FFFFFF">
          +15
        </Text>
      </PressableScale>
      <PressableScale feedback="light" onPress={skip} style={[styles.restButton, { backgroundColor: colors.accent }]}>
        <Text variant="subhead" weight="semibold" color={colors.onAccent}>
          Skip
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

export function useUnits() {
  return useSettings((s) => s.units);
}

/** Minimal line chart for per-exercise progress. */
export function MiniLineChart({ values, height = 120 }: { values: number[]; height?: number }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const path = useMemo(() => {
    if (width === 0 || values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pad = 8;
    const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (width - pad * 2), pad + (1 - (v - min) / span) * (height - pad * 2)]);
    return { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '), last: pts[pts.length - 1] };
  }, [values, width, height]);
  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {path && (
        <Svg width={width} height={height}>
          <Path d={path.d} stroke={colors.text} strokeWidth={2.4} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={path.last[0]} cy={path.last[1]} r={4.5} fill={colors.accent} />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { borderRadius: RADIUS.sm + 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  preview: { borderRadius: RADIUS.xl, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  rest: {
    position: 'absolute',
    left: SPACE.md,
    right: SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: SPACE.md,
    borderRadius: RADIUS.xl,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  restButton: { height: 36, paddingHorizontal: 12, borderRadius: RADIUS.pill, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center' },
});
