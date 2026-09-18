import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { plateLoad, warmupSets } from '../lib/strength';
import { kgToLb, lbToKg, weightUnit } from '../lib/units';
import { formatWeight } from '../modules/workouts/components';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { Chip } from '../ui/Chip';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { NumberPrompt } from '../ui/NumberPrompt';
import { Text } from '../ui/Text';

const BARS = [20, 15, 10];

export default function Plates() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ kg?: string }>();
  const units = useSettings((s) => s.units);
  const gym = useSettings((s) => s.gym);
  const [bar, setBar] = useState(gym.barKg);
  const [target, setTarget] = useState(Math.max(gym.barKg, Number(params.kg) || 60));

  const step = units === 'metric' ? gym.incrementKg : lbToKg(5);
  const load = plateLoad(target, bar, gym.plates);
  const warmups = warmupSets(target, bar, gym.incrementKg);
  const maxPlate = Math.max(...gym.plates.map((p) => p.weight));
  const display = units === 'metric' ? target : kgToLb(target);

  const [typing, setTyping] = useState(false);

  const nudge = (dir: 1 | -1) => {
    haptic.selection();
    setTarget((t) => Math.max(bar, Math.round((t + dir * step) * 100) / 100));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + SPACE.sm }}>
      <View style={styles.header}>
        <Text variant="title2">Plate calculator</Text>
        <PressableScale onPress={() => router.back()} hitSlop={10} style={[styles.close, { backgroundColor: colors.fill }]}>
          <Icon name="close" size={18} color={colors.textSecondary} strokeWidth={2.6} />
        </PressableScale>
      </View>

      <NumberPrompt
        visible={typing}
        title="Total weight"
        unit={weightUnit(units)}
        value={display}
        decimals={1}
        min={0}
        onClose={() => setTyping(false)}
        onSubmit={(v) => setTarget(units === 'metric' ? v : lbToKg(v))}
      />

      <ScrollView contentContainerStyle={{ padding: SPACE.lg, gap: SPACE.lg, paddingBottom: insets.bottom + SPACE.xl }}>
        <View style={styles.targetRow}>
          <PressableScale onPress={() => nudge(-1)} style={[styles.nudge, { backgroundColor: colors.fill }]}>
            <Icon name="minus" size={22} color={colors.text} />
          </PressableScale>
          <View style={{ alignItems: 'center' }}>
            <PressableScale scaleTo={0.97} feedback="selection" onPress={() => setTyping(true)}>
              <AnimatedNumber value={display} decimals={display % 1 ? 1 : 0} variant="display" style={{ textAlign: 'center', minWidth: 150 }} />
            </PressableScale>
            <Text variant="subhead" tone="secondary">
              {weightUnit(units)} total
            </Text>
          </View>
          <PressableScale onPress={() => nudge(1)} style={[styles.nudge, { backgroundColor: colors.fill }]}>
            <Icon name="plus" size={22} color={colors.text} />
          </PressableScale>
        </View>

        <View style={styles.chips}>
          {BARS.map((b) => (
            <Chip key={b} label={`${formatWeight(b, units)} ${weightUnit(units)} bar`} selected={bar === b} onPress={() => setBar(b)} />
          ))}
        </View>

        <View style={[styles.barbell, { backgroundColor: colors.surface }]}>
          <View style={[styles.sleeve, { backgroundColor: colors.textTertiary }]} />
          <View style={[styles.collar, { backgroundColor: colors.textSecondary }]} />
          <Animated.View layout={LinearTransition.duration(220)} style={styles.plates}>
            {load.perSide.map((w, i) => {
              const h = 40 + (w / maxPlate) * 110;
              const heavy = w >= 20;
              return (
                <Animated.View
                  key={`${i}-${w}`}
                  entering={FadeIn.duration(200).delay(i * 40)}
                  style={[
                    styles.plate,
                    {
                      height: h,
                      width: w >= 10 ? 22 : 14,
                      backgroundColor: heavy ? colors.accent : w >= 10 ? colors.text : colors.textSecondary,
                    },
                  ]}
                />
              );
            })}
          </Animated.View>
          <View style={[styles.sleeveEnd, { backgroundColor: colors.textTertiary }]} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text variant="footnote" tone="secondary">
            EACH SIDE
          </Text>
          <Text variant="title2" tabular>
            {load.perSide.length ? load.perSide.map((w) => formatWeight(w, units)).join(' + ') : 'Empty bar'}
          </Text>
          {load.remainder > 0.01 && (
            <Text variant="footnote" tone="warning">
              {`Closest you can load is ${formatWeight(load.achieved, units)} ${weightUnit(units)}.`}
            </Text>
          )}
        </View>

        {warmups.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text variant="footnote" tone="secondary">
              WARM-UP
            </Text>
            {warmups.map((w, i) => (
              <View key={i} style={styles.warmRow}>
                <Text variant="body" tabular>{`${formatWeight(w.weight, units)} ${weightUnit(units)} × ${w.reps}`}</Text>
                <Text variant="footnote" tone="tertiary" tabular>
                  {plateLoad(w.weight, bar, gym.plates).perSide.map((p) => formatWeight(p, units)).join(' + ') || 'bar'}
                </Text>
              </View>
            ))}
          </View>
        )}
        <Text variant="footnote" tone="tertiary" align="center">
          Plates and increments can be changed in Train → Settings.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.lg },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  targetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nudge: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: SPACE.sm, justifyContent: 'center' },
  barbell: { height: 190, borderRadius: RADIUS.xl, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.lg, overflow: 'hidden' },
  sleeve: { width: 60, height: 10, borderRadius: 3 },
  collar: { width: 8, height: 30, borderRadius: 2 },
  plates: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 3 },
  plate: { borderRadius: 4 },
  sleeveEnd: { flex: 1, height: 10, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  card: { borderRadius: RADIUS.xl, padding: SPACE.lg, gap: SPACE.sm },
  warmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
