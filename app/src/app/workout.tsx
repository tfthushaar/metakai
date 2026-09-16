import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQuery } from '../core/db/useQuery';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE, TYPE } from '../core/theme/typography';
import { estimate1RM, warmupSets } from '../lib/strength';
import { lbToKg, weightUnit } from '../lib/units';
import { ElapsedText, ExerciseThumb, formatWeight, RestTimerBar } from '../modules/workouts/components';
import { useExercisePicker } from '../modules/workouts/picker';
import {
  activeWorkout,
  addExercisesToWorkout,
  addSet,
  addWarmupSets,
  deleteSet,
  discardWorkout,
  exerciseRecords,
  finishWorkout,
  getExercise,
  getWorkout,
  moveWorkoutExercise,
  previousSets,
  removeWorkoutExercise,
  renameWorkout,
  setCompleted,
  updateSet,
  type SetKind,
  type WorkoutExercise,
  type WorkoutSet,
} from '../modules/workouts/repo';
import { useRestTimer } from '../modules/workouts/restTimer';
import { Button } from '../ui/Button';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { layout, SPRING } from '../ui/motion';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

const TABLES = ['workouts', 'workout_exercises', 'workout_sets'] as const;
const KIND_ORDER: SetKind[] = ['working', 'warmup', 'drop', 'failure'];
const KIND_LABEL: Record<Exclude<SetKind, 'working'>, string> = { warmup: 'W', drop: 'D', failure: 'F' };

function KeepAwake() {
  useKeepAwake();
  return null;
}

function parseNumber(text: string): number | null {
  const v = Number(text.replace(',', '.'));
  return text.trim() === '' || !Number.isFinite(v) || v < 0 ? null : v;
}

interface SetRowProps {
  set: WorkoutSet;
  label: string;
  previous: WorkoutSet | undefined;
  /** Set above this one in the current workout; used when there is no history. */
  above: WorkoutSet | undefined;
  best1RM: number;
  exerciseName: string;
  restSeconds: number;
  workoutId: string;
}

const SetRow = memo(function SetRow({ set, label, previous: history, above, best1RM, exerciseName, restSeconds }: SetRowProps) {
  const previous = history ?? (above && (above.weightKg != null || above.reps != null) ? above : undefined);
  const { colors } = useTheme();
  const units = useSettings((s) => s.units);
  const startRest = useRestTimer((s) => s.start);
  const done = set.completedAt != null;
  const [weightText, setWeightText] = useState(set.weightKg != null ? formatWeight(set.weightKg, units) : '');
  const [repsText, setRepsText] = useState(set.reps != null ? String(set.reps) : '');
  const pop = useSharedValue(1);

  useEffect(() => setWeightText(set.weightKg != null ? formatWeight(set.weightKg, units) : ''), [set.weightKg, units]);
  useEffect(() => setRepsText(set.reps != null ? String(set.reps) : ''), [set.reps]);

  const commitWeight = (text: string) => {
    setWeightText(text);
    const v = parseNumber(text);
    const kg = v == null ? null : units === 'metric' ? v : lbToKg(v);
    if (kg !== set.weightKg) updateSet(set.id, { weightKg: kg });
  };
  const commitReps = (text: string) => {
    setRepsText(text);
    const v = parseNumber(text);
    const reps = v == null ? null : Math.round(v);
    if (reps !== set.reps) updateSet(set.id, { reps });
  };

  const isPr = done && set.kind !== 'warmup' && best1RM > 0 && set.weightKg != null && (set.reps ?? 0) > 0 && estimate1RM(set.weightKg, set.reps!) > best1RM + 0.01;

  const toggle = () => {
    if (!done) {
      let weightKg = set.weightKg;
      let reps = set.reps;
      if (weightKg == null && previous?.weightKg != null) weightKg = previous.weightKg;
      if (reps == null && previous?.reps != null) reps = previous.reps;
      if (reps == null) {
        toast('Enter reps first');
        haptic.warning();
        return;
      }
      if (weightKg !== set.weightKg || reps !== set.reps) updateSet(set.id, { weightKg, reps });
      setCompleted(set.id, true);
      pop.value = withSequence(withTiming(1.25, { duration: 110 }), withSpring(1, SPRING));
      const pr = set.kind !== 'warmup' && best1RM > 0 && weightKg != null && estimate1RM(weightKg, reps) > best1RM + 0.01;
      if (pr) {
        haptic.success();
        toast(`New PR · ${exerciseName} ${formatWeight(weightKg, units)} ${weightUnit(units)} × ${reps}`);
      } else {
        haptic.light();
      }
      startRest(set.kind === 'warmup' ? Math.min(60, restSeconds) : restSeconds, exerciseName);
    } else {
      setCompleted(set.id, false);
      haptic.selection();
    }
  };

  const cycleKind = () => {
    const next = KIND_ORDER[(KIND_ORDER.indexOf(set.kind) + 1) % KIND_ORDER.length];
    updateSet(set.id, { kind: next });
    haptic.selection();
  };

  const copyPrevious = () => {
    if (!previous || done) return;
    updateSet(set.id, { weightKg: previous.weightKg, reps: previous.reps });
    haptic.selection();
  };

  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const inputStyle = [TYPE.headline, styles.input, { color: colors.text, backgroundColor: done ? 'transparent' : colors.fill }];
  const placeholderWeight = previous?.weightKg != null ? formatWeight(previous.weightKg, units) : '0';
  const placeholderReps = previous?.reps != null ? String(previous.reps) : '0';

  return (
    <ReanimatedSwipeable
      friction={1.6}
      rightThreshold={50}
      overshootRight={false}
      renderRightActions={() => (
        <PressableScale
          onPress={() => {
            haptic.medium();
            deleteSet(set.id);
          }}
          style={[styles.deleteAction, { backgroundColor: colors.danger }]}
        >
          <Icon name="trash" size={18} color="#FFFFFF" />
        </PressableScale>
      )}
    >
      <View style={[styles.setRow, { backgroundColor: done ? colors.accentSoft : colors.surface }]}>
        <PressableScale onPress={cycleKind} hitSlop={6} style={[styles.setLabel, set.kind !== 'working' && { backgroundColor: colors.fill }]}>
          <Text variant="subhead" weight="semibold" tone={set.kind === 'working' ? 'primary' : set.kind === 'warmup' ? 'warning' : 'accent'}>
            {set.kind === 'working' ? label : KIND_LABEL[set.kind]}
          </Text>
        </PressableScale>
        <PressableScale onPress={copyPrevious} style={styles.previous} scaleTo={0.95}>
          <Text variant="footnote" tone="tertiary" tabular numberOfLines={1}>
            {history && (history.weightKg != null || history.reps != null) ? `${formatWeight(history.weightKg, units)} × ${history.reps ?? '—'}` : '—'}
          </Text>
        </PressableScale>
        <TextInput
          value={weightText}
          onChangeText={commitWeight}
          placeholder={placeholderWeight}
          placeholderTextColor={colors.textTertiary}
          keyboardType="decimal-pad"
          selectTextOnFocus
          editable={!done}
          style={inputStyle}
          accessibilityLabel="Weight"
        />
        <TextInput
          value={repsText}
          onChangeText={commitReps}
          placeholder={placeholderReps}
          placeholderTextColor={colors.textTertiary}
          keyboardType="number-pad"
          selectTextOnFocus
          editable={!done}
          style={inputStyle}
          accessibilityLabel="Reps"
        />
        <PressableScale onPress={toggle} hitSlop={6} scaleTo={0.85} accessibilityLabel={done ? 'Mark set not done' : 'Complete set'}>
          <Animated.View style={[styles.check, { backgroundColor: done ? colors.accent : colors.fill }, checkStyle]}>
            {isPr ? (
              <Icon name="trophy" size={16} color={colors.onAccent} strokeWidth={2.6} />
            ) : (
              <Icon name="check" size={17} color={done ? colors.onAccent : colors.textTertiary} strokeWidth={3} />
            )}
          </Animated.View>
        </PressableScale>
      </View>
    </ReanimatedSwipeable>
  );
});

function ExerciseCard({ workoutId, startedAt, item, isFirst, isLast }: { workoutId: string; startedAt: string; item: WorkoutExercise; isFirst: boolean; isLast: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  const units = useSettings((s) => s.units);
  const gym = useSettings((s) => s.gym);
  const [menu, setMenu] = useState(false);
  const exercise = useMemo(() => getExercise(item.exerciseId), [item.exerciseId]);
  const previous = useMemo(() => previousSets(item.exerciseId, workoutId), [item.exerciseId, workoutId]);
  const records = useMemo(() => exerciseRecords(item.exerciseId, startedAt, workoutId), [item.exerciseId, startedAt, workoutId]);
  const previousWorking = previous.filter((s) => s.kind !== 'warmup');
  const previousWarmup = previous.filter((s) => s.kind === 'warmup');
  const restSeconds = item.restS ?? gym.restSeconds;

  let workingIndex = 0;
  let warmIndex = 0;
  const firstWorking = item.sets.find((s) => s.kind !== 'warmup');
  const workingWeight = firstWorking?.weightKg ?? previousWorking[0]?.weightKg ?? null;
  const hasWarmups = item.sets.some((s) => s.kind === 'warmup');
  const usesBar = exercise.equipment === 'barbell';

  const addWarmups = () => {
    if (workingWeight == null) {
      toast('Enter a working weight first');
      return;
    }
    const sets = warmupSets(workingWeight, usesBar ? gym.barKg : 0, usesBar ? gym.incrementKg : 1).filter((s) => s.weight > 0);
    if (sets.length === 0) return;
    addWarmupSets(workoutId, item.id, sets);
    haptic.success();
    setMenu(false);
  };

  return (
    <Animated.View layout={layout} entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHeader}>
        <PressableScale onPress={() => router.push({ pathname: '/exercise', params: { id: item.exerciseId } })} style={styles.cardTitle} scaleTo={0.98}>
          <ExerciseThumb exercise={exercise} size={40} />
          <View style={{ flex: 1 }}>
            <Text variant="headline" numberOfLines={1}>
              {exercise.name}
            </Text>
            <Text variant="caption" tone="secondary">
              {records.best1RM > 0 ? `Best e1RM ${formatWeight(records.best1RM, units)} ${weightUnit(units)}` : 'No history yet'}
            </Text>
          </View>
        </PressableScale>
        <PressableScale onPress={() => setMenu((m) => !m)} hitSlop={8} style={[styles.menuButton, { backgroundColor: menu ? colors.text : colors.fill }]}>
          <Icon name="more" size={18} color={menu ? colors.background : colors.text} />
        </PressableScale>
      </View>

      {menu && (
        <Animated.View entering={FadeIn.duration(180)} style={styles.menu}>
          {!hasWarmups && <Button title="Warm-up sets" icon="zap" size="sm" variant="gray" full={false} onPress={addWarmups} />}
          {usesBar && (
            <Button
              title="Plates"
              size="sm"
              variant="gray"
              full={false}
              onPress={() => router.push({ pathname: '/plates', params: { kg: String(workingWeight ?? gym.barKg) } })}
            />
          )}
          {!isFirst && <Button title="Up" icon="arrowUp" size="sm" variant="gray" full={false} onPress={() => moveWorkoutExercise(workoutId, item.id, -1)} />}
          {!isLast && <Button title="Down" icon="arrowDown" size="sm" variant="gray" full={false} onPress={() => moveWorkoutExercise(workoutId, item.id, 1)} />}
          <Button title="Remove" icon="trash" size="sm" variant="destructive" full={false} onPress={() => removeWorkoutExercise(item.id)} />
        </Animated.View>
      )}

      <View style={styles.columns}>
        <Text variant="caption" tone="tertiary" style={styles.colSet}>
          SET
        </Text>
        <Text variant="caption" tone="tertiary" style={styles.colPrev}>
          PREVIOUS
        </Text>
        <Text variant="caption" tone="tertiary" style={styles.colInput}>
          {weightUnit(units).toUpperCase()}
        </Text>
        <Text variant="caption" tone="tertiary" style={styles.colInput}>
          REPS
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {item.sets.map((s, idx) => {
        const above = idx > 0 ? item.sets[idx - 1] : undefined;
        const prev = s.kind === 'warmup' ? previousWarmup[warmIndex++] : previousWorking[workingIndex];
        const label = s.kind === 'warmup' ? '' : String(++workingIndex);
        return (
          <Animated.View key={s.id} layout={layout} entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
            <SetRow
              set={s}
              label={label}
              previous={prev}
              above={above && above.kind === s.kind ? above : undefined}
              best1RM={records.best1RM}
              exerciseName={exercise.name}
              restSeconds={restSeconds}
              workoutId={workoutId}
            />
          </Animated.View>
        );
      })}

      <PressableScale onPress={() => addSet(workoutId, item.id)} feedback="light" style={[styles.addSet, { backgroundColor: colors.fill }]}>
        <Icon name="plus" size={16} color={colors.text} strokeWidth={2.6} />
        <Text variant="subhead" weight="semibold">
          Add set
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

export default function WorkoutScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const keepAwake = useSettings((s) => s.gym.keepAwake);
  const openPicker = useExercisePicker((s) => s.open);
  const skipRest = useRestTimer((s) => s.skip);
  const active = useQuery([...TABLES], activeWorkout);
  const workout = useQuery([...TABLES], () => (active ? getWorkout(active.id) : null), [active?.id]);
  const [editingName, setEditingName] = useState(false);
  const leaving = useRef(false);

  useEffect(() => {
    if (!active && !leaving.current) {
      leaving.current = true;
      router.back();
    }
  }, [active, router]);

  if (!workout) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  const doneSets = workout.exercises.reduce((n, e) => n + e.sets.filter((s) => s.completedAt).length, 0);
  const totalSets = workout.exercises.reduce((n, e) => n + e.sets.length, 0);

  const addExercises = () => {
    openPicker((ids) => addExercisesToWorkout(workout.id, ids));
    router.push({ pathname: '/exercises', params: { mode: 'pick' } });
  };

  const finish = () => {
    const pending = totalSets - doneSets;
    const run = () => {
      leaving.current = true;
      skipRest();
      const id = workout.id;
      if (finishWorkout(id)) {
        haptic.success();
        router.replace({ pathname: '/workout-summary', params: { id, fresh: '1' } });
      } else {
        toast('Nothing logged, so the workout was discarded');
        router.back();
      }
    };
    if (doneSets === 0) {
      Alert.alert('No sets completed', 'Finishing now will discard this workout.', [
        { text: 'Keep training', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: run },
      ]);
    } else if (pending > 0) {
      Alert.alert('Finish workout?', `${pending} unfinished ${pending === 1 ? 'set' : 'sets'} will be removed.`, [
        { text: 'Keep training', style: 'cancel' },
        { text: 'Finish', onPress: run },
      ]);
    } else {
      run();
    }
  };

  const discard = () => {
    Alert.alert('Discard workout?', 'Everything logged in this session will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          leaving.current = true;
          skipRest();
          discardWorkout(workout.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {keepAwake && <KeepAwake />}
      <View style={[styles.header, { paddingTop: insets.top + SPACE.sm, borderBottomColor: colors.separator }]}>
        <PressableScale onPress={() => router.back()} hitSlop={10} style={[styles.round, { backgroundColor: colors.fill }]}>
          <Icon name="arrowDown" size={18} color={colors.text} />
        </PressableScale>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <ElapsedText since={workout.startedAt} variant="title2" />
          <Text variant="caption" tone="secondary" tabular>{`${doneSets} / ${totalSets} sets`}</Text>
        </View>
        <Button title="Finish" size="sm" full={false} onPress={finish} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACE.lg, paddingBottom: insets.bottom + 140, gap: SPACE.md }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {editingName ? (
          <TextInput
            autoFocus
            defaultValue={workout.name}
            onEndEditing={(e) => {
              renameWorkout(workout.id, e.nativeEvent.text);
              setEditingName(false);
            }}
            selectionColor={colors.accent}
            style={[TYPE.title1, { color: colors.text, padding: 0 }]}
          />
        ) : (
          <PressableScale onPress={() => setEditingName(true)} style={styles.nameRow} scaleTo={0.99}>
            <Text variant="title1" style={{ flexShrink: 1 }}>
              {workout.name}
            </Text>
            <Icon name="pencil" size={16} color={colors.textTertiary} />
          </PressableScale>
        )}

        {workout.exercises.length === 0 && (
          <View style={[styles.empty, { borderColor: colors.separator }]}>
            <Icon name="dumbbell" size={32} color={colors.textTertiary} />
            <Text variant="headline">Add your first exercise</Text>
            <Text variant="subhead" tone="secondary" align="center">
              Your last weights and reps appear next to each set.
            </Text>
          </View>
        )}

        {workout.exercises.map((item, i) => (
          <ExerciseCard
            key={item.id}
            workoutId={workout.id}
            startedAt={workout.startedAt}
            item={item}
            isFirst={i === 0}
            isLast={i === workout.exercises.length - 1}
          />
        ))}

        <Button title="Add exercises" icon="plus" variant="tinted" onPress={addExercises} />
        <Button title="Discard workout" variant="plain" size="md" onPress={discard} />
      </ScrollView>

      <RestTimerBar />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingBottom: SPACE.sm, gap: SPACE.md, borderBottomWidth: StyleSheet.hairlineWidth },
  round: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  empty: { alignItems: 'center', gap: SPACE.sm, padding: SPACE.xxl, borderRadius: RADIUS.xl, borderWidth: 1, borderStyle: 'dashed' },
  card: { borderRadius: RADIUS.xl, paddingVertical: SPACE.md, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.md, gap: SPACE.sm },
  cardTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  menuButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  menu: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, paddingHorizontal: SPACE.md, paddingTop: SPACE.md },
  columns: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.md, paddingTop: SPACE.md, paddingBottom: 4, gap: SPACE.sm },
  colSet: { width: 32, textAlign: 'center' },
  colPrev: { flex: 1 },
  colInput: { width: 72, textAlign: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.md, paddingVertical: 6, gap: SPACE.sm },
  setLabel: { width: 32, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  previous: { flex: 1, justifyContent: 'center', height: 36 },
  input: { width: 72, height: 38, borderRadius: RADIUS.sm, textAlign: 'center', paddingVertical: 0 },
  check: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  deleteAction: { width: 72, alignItems: 'center', justifyContent: 'center' },
  addSet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: SPACE.md, marginTop: SPACE.sm, height: 38, borderRadius: RADIUS.md },
});
