import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useQuery } from '../core/db/useQuery';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE, TYPE } from '../core/theme/typography';
import { ExerciseThumb } from '../modules/workouts/components';
import { useExercisePicker } from '../modules/workouts/picker';
import {
  activeWorkout,
  addRoutineItems,
  createRoutine,
  deleteRoutine,
  getExercise,
  getRoutine,
  moveRoutineItem,
  removeRoutineItem,
  renameRoutine,
  setRoutineWeekdays,
  startWorkout,
  updateRoutineItem,
  type RoutineItem,
} from '../modules/workouts/repo';
import { Button } from '../ui/Button';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { layout } from '../ui/motion';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';

const REST_OPTIONS = [60, 90, 120, 180];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function Stepper({ label, value, onChange, min = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <View style={[styles.stepper, { backgroundColor: colors.fill }]}>
        <PressableScale feedback="selection" hitSlop={6} onPress={() => onChange(Math.max(min, value - 1))} style={styles.stepperButton}>
          <Icon name="minus" size={14} color={colors.text} />
        </PressableScale>
        <Text variant="headline" tabular style={{ minWidth: 24, textAlign: 'center' }}>
          {value}
        </Text>
        <PressableScale feedback="selection" hitSlop={6} onPress={() => onChange(value + 1)} style={styles.stepperButton}>
          <Icon name="plus" size={14} color={colors.text} />
        </PressableScale>
      </View>
    </View>
  );
}

function ItemCard({ routineId, item, first, last }: { routineId: string; item: RoutineItem; first: boolean; last: boolean }) {
  const { colors } = useTheme();
  const defaultRest = useSettings((s) => s.gym.restSeconds);
  const exercise = getExercise(item.exerciseId);
  const rest = item.restS ?? defaultRest;
  const nextRest = REST_OPTIONS[(REST_OPTIONS.indexOf(rest) + 1) % REST_OPTIONS.length] ?? REST_OPTIONS[0];
  return (
    <Animated.View layout={layout} entering={FadeIn.duration(220)} exiting={FadeOut.duration(150)} style={[styles.item, { backgroundColor: colors.surface }]}>
      <View style={styles.itemHeader}>
        <ExerciseThumb exercise={exercise} size={40} />
        <Text variant="headline" style={{ flex: 1 }} numberOfLines={2}>
          {exercise.name}
        </Text>
        <PressableScale disabled={first} onPress={() => moveRoutineItem(routineId, item.id, -1)} hitSlop={6} style={[styles.iconButton, { backgroundColor: colors.fill }]}>
          <Icon name="arrowUp" size={16} color={colors.text} />
        </PressableScale>
        <PressableScale disabled={last} onPress={() => moveRoutineItem(routineId, item.id, 1)} hitSlop={6} style={[styles.iconButton, { backgroundColor: colors.fill }]}>
          <Icon name="arrowDown" size={16} color={colors.text} />
        </PressableScale>
        <PressableScale onPress={() => removeRoutineItem(item.id)} hitSlop={6} style={[styles.iconButton, { backgroundColor: colors.fill }]}>
          <Icon name="close" size={16} color={colors.danger} />
        </PressableScale>
      </View>
      <View style={styles.controls}>
        <Stepper label="Sets" value={item.sets} onChange={(sets) => updateRoutineItem(item.id, { sets })} />
        <Stepper label="Min reps" value={item.repMin} onChange={(repMin) => updateRoutineItem(item.id, { repMin, repMax: Math.max(repMin, item.repMax) })} />
        <Stepper label="Max reps" value={item.repMax} min={item.repMin} onChange={(repMax) => updateRoutineItem(item.id, { repMax })} />
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text variant="caption" tone="secondary">
            Rest
          </Text>
          <PressableScale feedback="selection" onPress={() => updateRoutineItem(item.id, { restS: nextRest })} style={[styles.rest, { backgroundColor: colors.fill }]}>
            <Text variant="headline" tabular>{`${rest}s`}</Text>
          </PressableScale>
        </View>
      </View>
    </Animated.View>
  );
}

export default function RoutineEditor() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const [id, setId] = useState<string | undefined>(params.id);
  const openPicker = useExercisePicker((s) => s.open);
  const routine = useQuery(['routines', 'routine_items'], () => (id ? getRoutine(id) : null), [id]);
  const active = useQuery(['workouts'], activeWorkout);
  const [name, setName] = useState(routine?.name ?? '');

  useEffect(() => {
    if (routine) setName(routine.name);
  }, [routine?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const ensureRoutine = (): string => {
    if (id) return id;
    const created = createRoutine(name.trim() || 'New routine');
    setId(created);
    return created;
  };

  const addExercises = () => {
    const routineId = ensureRoutine();
    openPicker((ids) => addRoutineItems(routineId, ids));
    router.push({ pathname: '/exercises', params: { mode: 'pick' } });
  };

  const start = () => {
    if (!id) return;
    haptic.medium();
    startWorkout({ routineId: id });
    router.replace('/workout');
  };

  const remove = () =>
    Alert.alert('Delete routine?', 'Past workouts stay in your history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (id) deleteRoutine(id);
          router.back();
        },
      },
    ]);

  const items = routine?.items ?? [];

  return (
    <Screen title={id ? 'Routine' : 'New routine'} back>
      <TextInput
        value={name}
        onChangeText={setName}
        onEndEditing={() => {
          if (id && name.trim()) renameRoutine(id, name);
          else if (!id && name.trim()) ensureRoutine();
        }}
        placeholder="Name, e.g. Push day"
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.accent}
        style={[TYPE.title1, styles.name, { color: colors.text, backgroundColor: colors.surface }]}
      />

      <Text variant="footnote" tone="secondary" style={{ marginTop: SPACE.lg, marginBottom: SPACE.sm, paddingHorizontal: SPACE.sm }}>
        TRAINING DAYS
      </Text>
      <View style={styles.days}>
        {DAYS.map((d, i) => {
          const selected = routine?.weekdays.includes(i) ?? false;
          return (
            <PressableScale
              key={i}
              feedback="selection"
              onPress={() => {
                const routineId = ensureRoutine();
                const current = getRoutine(routineId)?.weekdays ?? [];
                setRoutineWeekdays(routineId, selected ? current.filter((x) => x !== i) : [...current, i]);
              }}
              style={[styles.day, { backgroundColor: selected ? colors.text : colors.surface }]}
            >
              <Text variant="subhead" weight="semibold" color={selected ? colors.background : colors.text}>
                {d}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      <View style={{ gap: SPACE.md, marginTop: SPACE.lg }}>
        {items.map((item, i) => (
          <ItemCard key={item.id} routineId={id!} item={item} first={i === 0} last={i === items.length - 1} />
        ))}
      </View>

      <View style={{ gap: SPACE.sm, marginTop: SPACE.lg }}>
        <Button title="Add exercises" icon="plus" variant="tinted" onPress={addExercises} />
        {id && items.length > 0 && <Button title={active ? 'Finish your current workout first' : 'Start workout'} icon="play" onPress={start} disabled={!!active} />}
        {id && <Button title="Delete routine" variant="plain" size="md" onPress={remove} />}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { borderRadius: RADIUS.lg, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
  item: { borderRadius: RADIUS.xl, padding: SPACE.md, gap: SPACE.md },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  iconButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.pill, paddingHorizontal: 4, height: 34 },
  stepperButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rest: { height: 34, paddingHorizontal: 12, borderRadius: RADIUS.pill, justifyContent: 'center' },
});
