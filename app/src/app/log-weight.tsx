import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBody } from '../core/goals/useBody';
import { addWeight } from '../core/db/repo';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { SPACE } from '../core/theme/typography';
import { dateKey, relativeDay } from '../lib/dates';
import { kgToLb, lbToKg, weightUnit } from '../lib/units';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { Button } from '../ui/Button';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { RulerPicker } from '../ui/RulerPicker';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

export default function LogWeight() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const units = useSettings((s) => s.units);
  const { latestRawKg, trend } = useBody();
  const [width, setWidth] = useState(0);
  const startKg = latestRawKg ?? 75;
  const toDisplay = (kg: number) => Math.round((units === 'metric' ? kg : kgToLb(kg)) * 10) / 10;
  const [value, setValue] = useState(toDisplay(startKg));
  const lastWeighIn = trend.filter((t) => t.kg != null).pop();

  const save = () => {
    const kg = units === 'metric' ? value : lbToKg(value);
    addWeight(dateKey(), kg);
    haptic.success();
    toast('Weight logged');
    router.back();
  };

  const nudge = (delta: number) => setValue((v) => Math.round((v + delta) * 10) / 10);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + SPACE.sm, paddingBottom: insets.bottom + SPACE.lg }]}>
      <View style={[styles.grabber, { backgroundColor: colors.textTertiary }]} />
      <View style={styles.headerRow}>
        <Text variant="title2">Weigh in</Text>
        <PressableScale onPress={() => router.back()} hitSlop={10} style={[styles.close, { backgroundColor: colors.fill }]}>
          <Icon name="close" size={18} color={colors.textSecondary} strokeWidth={2.6} />
        </PressableScale>
      </View>
      <Text variant="subhead" tone="secondary">
        {lastWeighIn ? `Last: ${toDisplay(lastWeighIn.kg!)} ${weightUnit(units)} · ${relativeDay(lastWeighIn.date)}` : 'First weigh-in'}
      </Text>

      <View style={styles.center} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.valueRow}>
          <PressableScale onPress={() => nudge(-0.1)} feedback="selection" style={[styles.nudge, { backgroundColor: colors.fill }]}>
            <Icon name="minus" size={22} color={colors.text} />
          </PressableScale>
          <View style={styles.value}>
            <AnimatedNumber value={value} decimals={1} variant="display" style={{ fontSize: 64, lineHeight: 72, textAlign: 'center', minWidth: 170 }} />
            <Text variant="title3" tone="secondary">
              {weightUnit(units)}
            </Text>
          </View>
          <PressableScale onPress={() => nudge(0.1)} feedback="selection" style={[styles.nudge, { backgroundColor: colors.fill }]}>
            <Icon name="plus" size={22} color={colors.text} />
          </PressableScale>
        </View>
        <RulerPicker
          key={String(width)}
          width={width}
          min={units === 'metric' ? 30 : 66}
          max={units === 'metric' ? 250 : 550}
          step={units === 'metric' ? 0.1 : 0.2}
          majorEvery={units === 'metric' ? 10 : 25}
          value={value}
          onChange={setValue}
        />
        <Text variant="footnote" tone="tertiary" align="center" style={{ marginTop: SPACE.xl }}>
          Weigh yourself after waking, before eating. Daily swings are normal; the trend line smooths them out.
        </Text>
      </View>

      <Button title="Save" onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: SPACE.lg, gap: SPACE.sm },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, opacity: 0.5, marginBottom: SPACE.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, justifyContent: 'center' },
  valueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.xxl },
  value: { alignItems: 'center' },
  nudge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
