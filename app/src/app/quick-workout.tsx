import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBody } from '../core/goals/useBody';
import { useQuery } from '../core/db/useQuery';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE, TYPE } from '../core/theme/typography';
import { addDays, dateKey, relativeDay } from '../lib/dates';
import { kgToLb, weightUnit } from '../lib/units';
import { estimateDurationMin, workoutCalories } from '../lib/workoutEnergy';
import { EXERCISE_ALIASES, parseWorkoutText } from '../lib/workoutText';
import { ExerciseThumb, formatVolume, formatWeight } from '../modules/workouts/components';
import { searchExercises } from '../modules/workouts/exercises';
import { useExercisePicker } from '../modules/workouts/picker';
import { allExercises, getExercise, listRoutines, logCompletedWorkout, progressionAdvice, type Routine } from '../modules/workouts/repo';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { layout } from '../ui/motion';
import { PressableScale } from '../ui/PressableScale';
import { Stepper } from '../ui/Stepper';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

const DAY_OFFSETS = [0, -1, -2];

function formatSets(sets: { weightKg: number | null; reps: number }[], units: 'metric' | 'imperial'): string {
  const same = sets.every((s) => s.weightKg === sets[0].weightKg && s.reps === sets[0].reps);
  const w = (kg: number | null) => (kg == null ? 'BW' : `${formatWeight(kg, units)}`);
  if (same) return `${sets.length} × ${sets[0].reps}${sets[0].weightKg != null ? ` @ ${w(sets[0].weightKg)} ${weightUnit(units)}` : ''}`;
  return sets.map((s) => `${w(s.weightKg)}×${s.reps}`).join('  ');
}

export default function QuickWorkout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const units = useSettings((s) => s.units);
  const openPicker = useExercisePicker((s) => s.open);
  const { currentKg } = useBody();
  const routines = useQuery(['routines', 'routine_items'], listRoutines);
  const library = useQuery(['custom_exercises'], allExercises);

  const todays = routines.filter((r) => r.weekdays.includes(new Date().getDay()) && r.items.length > 0);
  const [text, setText] = useState('');
  const [name, setName] = useState(todays[0]?.name ?? '');
  const [routineId, setRoutineId] = useState<string | null>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [overrides, setOverrides] = useState<Record<number, string>>({});

  const parsed = useMemo(() => parseWorkoutText(text, units === 'metric' ? 'kg' : 'lb'), [text, units]);
  const matched = useMemo(
    () =>
      parsed.map((p, i) => {
        if (overrides[i]) return overrides[i];
        const key = p.name.toLowerCase().trim();
        if (EXERCISE_ALIASES[key]) return EXERCISE_ALIASES[key];
        return searchExercises(library, p.name, null, null)[0]?.id ?? null;
      }),
    [parsed, overrides, library],
  );

  const totalSets = parsed.reduce((n, p) => n + p.sets.length, 0);
  const volume = parsed.reduce((n, p) => n + p.sets.reduce((v, s) => v + (s.weightKg ?? 0) * s.reps, 0), 0);
  const minutes = duration ?? estimateDurationMin(totalSets);
  const kcal = workoutCalories({ bodyweightKg: currentKg ?? 75, durationMin: minutes, workingSets: totalSets });
  const ready = parsed.length > 0 && matched.every((m) => m != null);

  const fillFrom = (r: Routine) => {
    haptic.selection();
    const toUnits = (kg: number) => Math.round((units === 'metric' ? kg : kgToLb(kg)) * 10) / 10;
    const lines = r.items.map((item) => {
      const ex = getExercise(item.exerciseId);
      const advice = progressionAdvice(item.exerciseId, item.repMin, item.repMax);
      const reps = advice.reps ?? item.repMin;
      const weight = advice.weightKg != null ? ` ${toUnits(advice.weightKg)}` : '';
      return `${ex.name} ${item.sets}x${reps}${weight}`;
    });
    setText(lines.join('\n'));
    setName(r.name);
    setRoutineId(r.id);
    setOverrides(Object.fromEntries(r.items.map((item, i) => [i, item.exerciseId])));
  };

  const choose = (index: number) => {
    openPicker((ids) => ids[0] && setOverrides((o) => ({ ...o, [index]: ids[0] })));
    router.push({ pathname: '/exercises', params: { mode: 'pick' } });
  };

  const save = () => {
    const day = addDays(dateKey(), dayOffset);
    const id = logCompletedWorkout({
      name: name.trim() || 'Workout',
      dateKey: day,
      durationMin: minutes,
      routineId,
      exercises: parsed.map((p, i) => ({ exerciseId: matched[i]!, sets: p.sets })),
    });
    haptic.success();
    toast(`Workout saved · ≈${kcal} kcal`);
    router.replace({ pathname: '/workout-summary', params: { id, fresh: '1' } });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ padding: SPACE.lg, paddingTop: insets.top + SPACE.sm, paddingBottom: 200, gap: SPACE.md }} keyboardShouldPersistTaps="handled">
        <View style={[styles.grabber, { backgroundColor: colors.textTertiary }]} />
        <View style={styles.headerRow}>
          <Text variant="title2">Log workout</Text>
          <PressableScale onPress={() => router.back()} hitSlop={10} style={[styles.close, { backgroundColor: colors.fill }]}>
            <Icon name="close" size={18} color={colors.textSecondary} strokeWidth={2.6} />
          </PressableScale>
        </View>

        {routines.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.sm }}>
            {[...todays, ...routines.filter((r) => !todays.includes(r) && r.items.length > 0)].map((r) => (
              <Chip key={r.id} label={r.name} icon={todays.includes(r) ? 'play' : undefined} selected={routineId === r.id} onPress={() => fillFrom(r)} />
            ))}
          </ScrollView>
        )}

        <View style={[styles.inputCard, { backgroundColor: colors.surface }]}>
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              setOverrides({});
            }}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoFocus={routines.length === 0}
            placeholder={`bench 3x8 ${units === 'metric' ? '60' : '135'}\nsquat 5x5 ${units === 'metric' ? '100' : '225'}\ndeadlift ${units === 'metric' ? '100x5 120x3' : '225x5 275x3'}\npullups 3x10`}
            placeholderTextColor={colors.textTertiary}
            selectionColor={colors.accent}
            style={[TYPE.callout, { color: colors.text, minHeight: 110, textAlignVertical: 'top' }]}
          />
          <Text variant="caption" tone="tertiary">
            One exercise per line: sets×reps then weight, or weight×reps for each set.
          </Text>
        </View>

        <View style={{ gap: SPACE.sm }}>
          {parsed.map((p, i) => {
            const id = matched[i];
            const ex = id ? getExercise(id) : null;
            return (
              <Animated.View key={`${i}-${p.name}`} layout={layout} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
                <PressableScale onPress={() => choose(i)} scaleTo={0.99} style={[styles.row, { backgroundColor: colors.surface, borderColor: ex ? 'transparent' : colors.danger }]}>
                  {ex ? <ExerciseThumb exercise={ex} size={36} /> : <Icon name="search" size={20} color={colors.danger} />}
                  <View style={{ flex: 1 }}>
                    <Text variant="headline" numberOfLines={1}>
                      {ex ? ex.name : `“${p.name}” not found`}
                    </Text>
                    <Text variant="footnote" tone="secondary" tabular numberOfLines={1}>
                      {ex ? formatSets(p.sets, units) : 'Tap to choose the exercise'}
                    </Text>
                  </View>
                  <Icon name="chevronRight" size={16} color={colors.textTertiary} />
                </PressableScale>
              </Animated.View>
            );
          })}
        </View>

        <Text variant="footnote" tone="secondary" style={{ marginTop: SPACE.sm, paddingHorizontal: 4 }}>
          WHEN
        </Text>
        <View style={styles.chips}>
          {DAY_OFFSETS.map((o) => (
            <Chip key={o} label={relativeDay(addDays(dateKey(), o))} selected={dayOffset === o} onPress={() => setDayOffset(o)} />
          ))}
        </View>

        <View style={[styles.durationRow, { backgroundColor: colors.surface }]}>
          <View style={{ flex: 1 }}>
            <Text variant="body">Duration</Text>
            <Text variant="caption" tone="tertiary">
              {duration == null ? 'Estimated from your sets' : 'Set by you'}
            </Text>
          </View>
          <Stepper value={minutes} onChange={setDuration} step={5} min={1} max={600} unit="min" title="Duration" valueWidth={64} />
        </View>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Workout name"
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.accent}
          style={[TYPE.body, styles.nameInput, { color: colors.text, backgroundColor: colors.surface }]}
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACE.md, backgroundColor: colors.background, borderTopColor: colors.separator }]}>
        <View style={styles.totals}>
          <View>
            <Text variant="title3" tabular>{totalSets ? `≈ ${kcal} kcal` : '— kcal'}</Text>
            <Text variant="caption" tone="secondary">
              burned
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="subhead" weight="semibold" tabular>{`${totalSets} sets · ${formatVolume(volume, units)} ${weightUnit(units)}`}</Text>
            <Text variant="caption" tone="secondary">
              volume
            </Text>
          </View>
        </View>
        <Button title="Save workout" onPress={save} disabled={!ready} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, opacity: 0.5 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  inputCard: { borderRadius: RADIUS.xl, padding: SPACE.lg, gap: SPACE.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.md, borderRadius: RADIUS.lg, borderWidth: 1 },
  chips: { flexDirection: 'row', gap: SPACE.sm },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, padding: SPACE.md, paddingLeft: SPACE.lg, borderRadius: RADIUS.lg },
  step: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  nameInput: { borderRadius: RADIUS.lg, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, gap: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth },
  totals: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
});
