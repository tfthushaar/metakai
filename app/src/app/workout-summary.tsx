import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { useQuery } from '../core/db/useQuery';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { formatLong } from '../lib/dates';
import { bestSet, formatDurationWords, setVolume } from '../lib/strength';
import { weightUnit } from '../lib/units';
import { ExerciseThumb, formatVolume, formatWeight, useUnits } from '../modules/workouts/components';
import { MUSCLE_LABEL } from '../modules/workouts/exercises';
import { discardWorkout, getExercise, getWorkout, rateWorkout, saveWorkoutAsRoutine, workoutPrs } from '../modules/workouts/repo';
import { Button } from '../ui/Button';
import { Card, SectionHeader } from '../ui/Card';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

const TABLES = ['workouts', 'workout_exercises', 'workout_sets'] as const;
const FEEL = ['Rough', 'Hard', 'Solid', 'Great', 'Best ever'];

export default function WorkoutSummary() {
  const { colors } = useTheme();
  const router = useRouter();
  const units = useUnits();
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const workout = useQuery([...TABLES], () => getWorkout(id), [id]);
  const [savedRoutine, setSavedRoutine] = useState(false);
  const prs = useMemo(() => (workout ? workoutPrs(workout) : []), [workout]);

  if (!workout) {
    return (
      <Screen title="Workout" back>
        <Text tone="secondary">This workout was deleted.</Text>
      </Screen>
    );
  }

  const working = workout.exercises.flatMap((e) => e.sets.filter((s) => s.kind !== 'warmup' && s.weightKg != null && s.reps != null));
  const volume = setVolume(working.map((s) => ({ weight: s.weightKg!, reps: s.reps! })));
  const duration = workout.endedAt ? new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime() : 0;
  const muscles = [...new Set(workout.exercises.flatMap((e) => getExercise(e.exerciseId).primary))];

  const saveRoutine = () => {
    const routineId = saveWorkoutAsRoutine(workout.id);
    if (routineId) {
      setSavedRoutine(true);
      haptic.success();
      toast('Saved as a routine');
    }
  };

  const remove = () =>
    Alert.alert('Delete workout?', 'This removes it from your history and records.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          discardWorkout(workout.id);
          router.back();
        },
      },
    ]);

  const stats = [
    { label: 'Duration', value: formatDurationWords(duration) },
    { label: 'Volume', value: `${formatVolume(volume, units)} ${weightUnit(units)}` },
    { label: 'Sets', value: String(working.length) },
    { label: 'Burned', value: workout.kcal != null ? `≈ ${Math.round(workout.kcal)} kcal` : '—' },
  ];

  return (
    <Screen title={fresh ? 'Workout complete' : workout.name} subtitle={formatLong(workout.dateKey)} back={!fresh}>
      {fresh && (
        <Animated.View entering={ZoomIn.springify().damping(14)} style={[styles.badge, { backgroundColor: colors.accent }]}>
          <Icon name={prs.length ? 'trophy' : 'check'} size={40} color={colors.onAccent} strokeWidth={2.6} />
        </Animated.View>
      )}
      {fresh && (
        <Text variant="title2" align="center" style={{ marginBottom: SPACE.lg }}>
          {prs.length ? `${prs.length} new ${prs.length === 1 ? 'record' : 'records'}` : workout.name}
        </Text>
      )}

      <View style={styles.grid}>
        {stats.map((s, i) => (
          <Card key={s.label} index={i} containerStyle={styles.statWrap} style={styles.stat}>
            <Text variant="footnote" tone="secondary">
              {s.label}
            </Text>
            <Text variant="title2" tabular>
              {s.value}
            </Text>
          </Card>
        ))}
      </View>

      {prs.length > 0 && (
        <>
          <SectionHeader title="Personal records" />
          <Card padded={false} index={4}>
            {prs.map((pr, i) => (
              <View key={`${pr.exerciseId}-${pr.kind}`} style={[styles.prRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}>
                <Icon name="trophy" size={18} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text variant="body">{getExercise(pr.exerciseId).name}</Text>
                  <Text variant="footnote" tone="secondary">
                    {pr.kind === 'weight' ? 'Heaviest weight' : pr.kind === '1rm' ? 'Estimated 1RM' : 'Best set volume'}
                  </Text>
                </View>
                <Text variant="headline" tabular>
                  {pr.kind === 'volume' ? formatVolume(pr.value, units) : formatWeight(pr.value, units)} {weightUnit(units)}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}

      {fresh && (
        <>
          <SectionHeader title="How did it feel?" />
          <View style={styles.feel}>
            {FEEL.map((label, i) => {
              const selected = workout.rating === i + 1;
              return (
                <PressableScale
                  key={label}
                  feedback="selection"
                  onPress={() => rateWorkout(workout.id, i + 1)}
                  style={[styles.feelOption, { backgroundColor: selected ? colors.text : colors.surface }]}
                >
                  <Text variant="caption" weight="semibold" color={selected ? colors.background : colors.text} align="center">
                    {label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </>
      )}

      <SectionHeader title="Exercises" />
      <Card padded={false} index={5}>
        {workout.exercises.map((e, i) => {
          const ex = getExercise(e.exerciseId);
          const valid = e.sets.filter((s) => s.kind !== 'warmup' && s.weightKg != null && s.reps != null).map((s) => ({ weight: s.weightKg!, reps: s.reps! }));
          const best = bestSet(valid);
          return (
            <PressableScale
              key={e.id}
              scaleTo={0.99}
              onPress={() => router.push({ pathname: '/exercise', params: { id: e.exerciseId } })}
              style={[styles.exRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}
            >
              <ExerciseThumb exercise={ex} size={40} />
              <View style={{ flex: 1 }}>
                <Text variant="body" numberOfLines={1}>
                  {ex.name}
                </Text>
                <Text variant="footnote" tone="secondary" tabular numberOfLines={2}>
                  {e.sets.map((s) => `${s.kind === 'warmup' ? 'W ' : ''}${formatWeight(s.weightKg, units)}×${s.reps ?? '—'}`).join('  ')}
                </Text>
              </View>
              {best && (
                <Text variant="subhead" weight="semibold" tabular>
                  {`${formatWeight(best.weight, units)}×${best.reps}`}
                </Text>
              )}
            </PressableScale>
          );
        })}
      </Card>

      {muscles.length > 0 && (
        <Text variant="footnote" tone="secondary" style={{ marginTop: SPACE.md, paddingHorizontal: SPACE.sm }}>
          {`Muscles worked: ${muscles.map(MUSCLE_LABEL).join(', ')}`}
        </Text>
      )}

      <View style={{ gap: SPACE.sm, marginTop: SPACE.xl }}>
        {fresh && <Button title="Done" onPress={() => router.back()} />}
        {!workout.routineId && (
          <Button title={savedRoutine ? 'Saved to routines' : 'Save as routine'} variant="gray" icon={savedRoutine ? 'check' : 'plus'} onPress={saveRoutine} disabled={savedRoutine} />
        )}
        {!fresh && <Button title="Delete workout" variant="destructive" icon="trash" onPress={remove} />}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'center', width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: SPACE.md },
  statWrap: { width: '48.5%' },
  stat: { gap: 2 },
  prRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.lg },
  feel: { flexDirection: 'row', gap: SPACE.sm },
  feelOption: { flex: 1, paddingVertical: SPACE.md, borderRadius: RADIUS.md },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
});
