import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBody } from '../core/goals/useBody';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE, TYPE } from '../core/theme/typography';
import { CARDIO_KINDS, cardioCalories, formatPace, paceMinPerKm, type CardioKind } from '../lib/cardio';
import { addDays, dateKey, relativeDay } from '../lib/dates';
import { addCardio } from '../modules/cardio/repo';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

const KM_PER_MI = 1.609344;
const DAY_OFFSETS = [0, -1, -2];
const EFFORT = [
  { rpe: 3, label: 'Easy' },
  { rpe: 5, label: 'Moderate' },
  { rpe: 7, label: 'Hard' },
  { rpe: 9, label: 'All out' },
];

function Stepper({ label, value, onChange, step, min, format }: { label: string; value: number; onChange: (v: number) => void; step: number; min: number; format: (v: number) => string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stepRow, { backgroundColor: colors.surface }]}>
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      <PressableScale feedback="selection" onPress={() => onChange(Math.max(min, value - step))} style={[styles.step, { backgroundColor: colors.fill }]}>
        <Icon name="minus" size={16} color={colors.text} />
      </PressableScale>
      <Text variant="headline" tabular style={{ minWidth: 72, textAlign: 'center' }}>
        {format(value)}
      </Text>
      <PressableScale feedback="selection" onPress={() => onChange(value + step)} style={[styles.step, { backgroundColor: colors.fill }]}>
        <Icon name="plus" size={16} color={colors.text} />
      </PressableScale>
    </View>
  );
}

export default function LogCardio() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const units = useSettings((s) => s.units);
  const { currentKg } = useBody();
  const [kind, setKind] = useState<CardioKind>('walk');
  const [minutes, setMinutes] = useState(30);
  const [distance, setDistance] = useState('');
  const [hr, setHr] = useState('');
  const [rpe, setRpe] = useState(5);
  const [dayOffset, setDayOffset] = useState(0);

  const def = CARDIO_KINDS.find((k) => k.id === kind)!;
  const distUnit = units === 'metric' ? 'km' : 'mi';
  const distanceValue = Number(distance.replace(',', '.'));
  const distanceKm = def.distance && distanceValue > 0 ? (units === 'metric' ? distanceValue : distanceValue * KM_PER_MI) : null;
  const avgHr = Number(hr) > 30 && Number(hr) < 230 ? Number(hr) : null;
  const kcal = cardioCalories({ kind, durationMin: minutes, distanceKm, rpe, bodyweightKg: currentKg ?? 75 });
  const pace = paceMinPerKm(minutes, distanceKm);

  const save = () => {
    addCardio({ dateKey: addDays(dateKey(), dayOffset), kind, durationMin: minutes, distanceKm, avgHr, rpe, kcal, intervals: null, note: null });
    haptic.success();
    toast(`${def.label} saved · ≈${kcal} kcal`);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ padding: SPACE.lg, paddingTop: insets.top + SPACE.sm, paddingBottom: 180, gap: SPACE.md }} keyboardShouldPersistTaps="handled">
        <View style={[styles.grabber, { backgroundColor: colors.textTertiary }]} />
        <View style={styles.headerRow}>
          <Text variant="title2">Log cardio</Text>
          <PressableScale onPress={() => router.back()} hitSlop={10} style={[styles.close, { backgroundColor: colors.fill }]}>
            <Icon name="close" size={18} color={colors.textSecondary} strokeWidth={2.6} />
          </PressableScale>
        </View>

        <View style={styles.chips}>
          {CARDIO_KINDS.map((k) => (
            <Chip key={k.id} label={k.label} selected={kind === k.id} onPress={() => setKind(k.id)} />
          ))}
        </View>

        <Stepper label="Duration" value={minutes} onChange={setMinutes} step={5} min={5} format={(v) => `${v} min`} />

        {def.distance && (
          <View style={[styles.stepRow, { backgroundColor: colors.surface }]}>
            <View style={{ flex: 1 }}>
              <Text variant="body">Distance</Text>
              <Text variant="caption" tone="tertiary">
                {pace ? `Pace ${formatPace(units === 'metric' ? pace : pace * KM_PER_MI)} /${distUnit}` : 'Optional, makes the estimate more accurate'}
              </Text>
            </View>
            <TextInput
              value={distance}
              onChangeText={setDistance}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor={colors.textTertiary}
              selectionColor={colors.accent}
              style={[TYPE.headline, styles.input, { color: colors.text, backgroundColor: colors.fill }]}
            />
            <Text variant="subhead" tone="secondary" numberOfLines={1} style={{ minWidth: 34 }}>
              {distUnit}
            </Text>
          </View>
        )}

        <Text variant="footnote" tone="secondary" style={styles.label}>
          EFFORT
        </Text>
        <View style={styles.chips}>
          {EFFORT.map((e) => (
            <Chip key={e.rpe} label={e.label} selected={rpe === e.rpe} onPress={() => setRpe(e.rpe)} />
          ))}
        </View>

        <View style={[styles.stepRow, { backgroundColor: colors.surface }]}>
          <View style={{ flex: 1 }}>
            <Text variant="body">Average heart rate</Text>
            <Text variant="caption" tone="tertiary">
              Optional
            </Text>
          </View>
          <TextInput
            value={hr}
            onChangeText={setHr}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor={colors.textTertiary}
            selectionColor={colors.accent}
            style={[TYPE.headline, styles.input, { color: colors.text, backgroundColor: colors.fill }]}
          />
          <Text variant="subhead" tone="secondary" numberOfLines={1} style={{ minWidth: 34 }}>
            bpm
          </Text>
        </View>

        <Text variant="footnote" tone="secondary" style={styles.label}>
          WHEN
        </Text>
        <View style={styles.chips}>
          {DAY_OFFSETS.map((o) => (
            <Chip key={o} label={relativeDay(addDays(dateKey(), o))} selected={dayOffset === o} onPress={() => setDayOffset(o)} />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACE.md, backgroundColor: colors.background, borderTopColor: colors.separator }]}>
        <View style={styles.totals}>
          <View>
            <Text variant="title3" tabular>{`≈ ${kcal} kcal`}</Text>
            <Text variant="caption" tone="secondary">
              burned
            </Text>
          </View>
          <Text variant="caption" tone="tertiary" align="right" style={{ flex: 1, marginLeft: SPACE.lg }}>
            Your calorie target already allows for your activity level, so this isn’t added to it.
          </Text>
        </View>
        <Button title={`Save ${def.label.toLowerCase()}`} onPress={save} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, opacity: 0.5 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  label: { marginTop: SPACE.sm, paddingHorizontal: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, padding: SPACE.md, paddingLeft: SPACE.lg, borderRadius: RADIUS.lg },
  step: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  input: { width: 80, height: 40, borderRadius: RADIUS.sm, textAlign: 'center', paddingVertical: 0 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, gap: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth },
  totals: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
