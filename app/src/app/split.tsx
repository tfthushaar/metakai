import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useQuery } from '../core/db/useQuery';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE, TYPE } from '../core/theme/typography';
import { ExerciseThumb } from '../modules/workouts/components';
import { useExercisePicker } from '../modules/workouts/picker';
import {
  activateSplit,
  addRoutineItems,
  addSplitDay,
  createSplit,
  createSplitFromPreset,
  deleteSplit,
  deleteSplitDay,
  getExercise,
  listSplits,
  removeRoutineItem,
  renameRoutine,
  renameSplit,
  setDayGroups,
  setRoutineWeekdays,
  type Routine,
} from '../modules/workouts/repo';
import { GROUP_LABEL, groupForMuscles, SPLIT_GROUPS, SPLIT_PRESETS, type SplitGroup } from '../modules/workouts/splits';
import { Button } from '../ui/Button';
import { Card, SectionHeader } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { layout } from '../ui/motion';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const TABLES = ['splits', 'routines', 'routine_items'] as const;

function DayCard({ day, index }: { day: Routine; index: number }) {
  const { colors } = useTheme();
  const router = useRouter();
  const openPicker = useExercisePicker((s) => s.open);
  const [editingName, setEditingName] = useState(false);

  const byGroup = new Map<SplitGroup | 'other', Routine['items']>();
  for (const item of day.items) {
    const g = groupForMuscles(getExercise(item.exerciseId).primary);
    const key = g && day.muscleGroups.includes(g) ? g : 'other';
    byGroup.set(key, [...(byGroup.get(key) ?? []), item]);
  }
  const sections: (SplitGroup | 'other')[] = [...day.muscleGroups, ...(byGroup.has('other') ? (['other'] as const) : [])];

  const addFor = (group: SplitGroup) => {
    openPicker((ids) => addRoutineItems(day.id, ids.filter((id) => !day.items.some((i) => i.exerciseId === id))));
    router.push({ pathname: '/exercises', params: { mode: 'pick', group } });
  };

  const toggleGroup = (g: SplitGroup) => {
    haptic.selection();
    setDayGroups(day.id, day.muscleGroups.includes(g) ? day.muscleGroups.filter((x) => x !== g) : [...day.muscleGroups, g]);
  };

  const confirmDelete = () =>
    Alert.alert(`Delete ${day.name}?`, 'Past workouts stay in your history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSplitDay(day.id) },
    ]);

  return (
    <Card index={index} style={{ marginBottom: SPACE.md }}>
      <View style={styles.dayHeader}>
        {editingName ? (
          <TextInput
            autoFocus
            defaultValue={day.name}
            onEndEditing={(e) => {
              if (e.nativeEvent.text.trim()) renameRoutine(day.id, e.nativeEvent.text);
              setEditingName(false);
            }}
            selectionColor={colors.accent}
            style={[TYPE.title3, { flex: 1, color: colors.text, padding: 0 }]}
          />
        ) : (
          <PressableScale onPress={() => setEditingName(true)} style={{ flex: 1 }} scaleTo={0.99}>
            <Text variant="title3">{day.name}</Text>
          </PressableScale>
        )}
        <PressableScale onPress={confirmDelete} hitSlop={8} style={[styles.iconButton, { backgroundColor: colors.fill }]}>
          <Icon name="trash" size={15} color={colors.textSecondary} />
        </PressableScale>
      </View>

      <View style={styles.days}>
        {DAYS.map((d, i) => {
          const on = day.weekdays.includes(i);
          return (
            <PressableScale
              key={i}
              feedback="selection"
              onPress={() => setRoutineWeekdays(day.id, on ? day.weekdays.filter((x) => x !== i) : [...day.weekdays, i])}
              style={[styles.day, { backgroundColor: on ? colors.text : colors.fill }]}
            >
              <Text variant="footnote" weight="semibold" color={on ? colors.background : colors.textSecondary}>
                {d}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ marginTop: SPACE.md }}>
        {SPLIT_GROUPS.map((g) => (
          <Chip key={g} label={GROUP_LABEL[g]} selected={day.muscleGroups.includes(g)} onPress={() => toggleGroup(g)} />
        ))}
      </ScrollView>

      {sections.map((g) => (
        <Animated.View key={g} layout={layout} entering={FadeIn.duration(200)} style={[styles.section, { borderTopColor: colors.separator }]}>
          <View style={styles.sectionHeader}>
            <Text variant="footnote" weight="semibold" tone="secondary">
              {g === 'other' ? 'OTHER' : GROUP_LABEL[g].toUpperCase()}
            </Text>
            {g !== 'other' && (
              <PressableScale onPress={() => addFor(g)} hitSlop={8} feedback="selection" style={styles.add}>
                <Icon name="plus" size={14} color={colors.accent} strokeWidth={2.6} />
                <Text variant="footnote" tone="accent" weight="semibold">
                  Add
                </Text>
              </PressableScale>
            )}
          </View>
          {(byGroup.get(g) ?? []).map((item) => {
            const ex = getExercise(item.exerciseId);
            return (
              <View key={item.id} style={styles.exerciseRow}>
                <ExerciseThumb exercise={ex} size={32} />
                <View style={{ flex: 1 }}>
                  <Text variant="subhead" numberOfLines={1}>
                    {ex.name}
                  </Text>
                  <Text variant="caption" tone="tertiary">{`${item.sets} × ${item.repMin}–${item.repMax}`}</Text>
                </View>
                <PressableScale onPress={() => removeRoutineItem(item.id)} hitSlop={8}>
                  <Icon name="close" size={16} color={colors.textTertiary} />
                </PressableScale>
              </View>
            );
          })}
          {(byGroup.get(g) ?? []).length === 0 && (
            <Text variant="caption" tone="tertiary">
              No exercises yet
            </Text>
          )}
        </Animated.View>
      ))}

      <Button title="Sets, reps & order" variant="gray" size="sm" onPress={() => router.push({ pathname: '/routine', params: { id: day.id } })} style={{ marginTop: SPACE.md }} />
    </Card>
  );
}

export default function SplitScreen() {
  const { colors } = useTheme();
  const splits = useQuery([...TABLES], listSplits);
  const active = splits.find((s) => s.active) ?? null;
  const others = splits.filter((s) => !s.active);
  const [choosing, setChoosing] = useState(false);
  const [editingName, setEditingName] = useState(false);

  const applyPreset = (id: string) => {
    createSplitFromPreset(id);
    haptic.success();
    toast('Split ready. Adjust days and exercises below.');
    setChoosing(false);
  };

  const buildOwn = () => {
    createSplit('My split', [{ name: 'Day 1', groups: ['chest', 'triceps'], weekdays: [1], repMin: 8, repMax: 12, perGroup: 2 }]);
    haptic.success();
    setChoosing(false);
  };

  const showPresets = !active || choosing;

  return (
    <Screen title="Split" back>
      {active && !choosing && (
        <>
          <View style={styles.splitHeader}>
            {editingName ? (
              <TextInput
                autoFocus
                defaultValue={active.name}
                onEndEditing={(e) => {
                  if (e.nativeEvent.text.trim()) renameSplit(active.id, e.nativeEvent.text);
                  setEditingName(false);
                }}
                selectionColor={colors.accent}
                style={[TYPE.title2, { flex: 1, color: colors.text, padding: 0 }]}
              />
            ) : (
              <PressableScale onPress={() => setEditingName(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text variant="title2">{active.name}</Text>
                <Icon name="pencil" size={14} color={colors.textTertiary} />
              </PressableScale>
            )}
            <Button title="Change" size="sm" variant="gray" full={false} onPress={() => setChoosing(true)} />
          </View>
          <Text variant="subhead" tone="secondary" style={{ marginBottom: SPACE.lg }}>
            {`${active.days.length} ${active.days.length === 1 ? 'day' : 'days'} · ${new Set(active.days.flatMap((d) => d.weekdays)).size} sessions a week. Tap a day to rename it.`}
          </Text>
          {active.days.map((d, i) => (
            <DayCard key={d.id} day={d} index={i} />
          ))}
          <Button
            title="Add day"
            icon="plus"
            variant="tinted"
            onPress={() => addSplitDay(active.id, `Day ${active.days.length + 1}`, ['back', 'biceps'], [])}
          />
        </>
      )}

      {showPresets && (
        <>
          <Text variant="subhead" tone="secondary" style={{ marginBottom: SPACE.lg }}>
            Start from a proven split or build your own. You can change days, muscle groups and exercises after.
          </Text>
          {SPLIT_PRESETS.map((p, i) => (
            <Card key={p.id} index={i} style={{ marginBottom: SPACE.md }} onPress={() => applyPreset(p.id)}>
              <View style={styles.presetHeader}>
                <Text variant="headline">{p.name}</Text>
                <Text variant="footnote" tone="secondary">{`${p.daysPerWeek} days/week`}</Text>
              </View>
              <Text variant="subhead" tone="secondary" style={{ marginTop: 2 }}>
                {p.description}
              </Text>
              <View style={styles.presetDays}>
                {p.days.map((d) => (
                  <View key={d.name} style={[styles.presetDay, { backgroundColor: colors.fill }]}>
                    <Text variant="caption" weight="semibold">
                      {d.name}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ))}
          <Card index={SPLIT_PRESETS.length} onPress={buildOwn} style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.textTertiary, backgroundColor: 'transparent' }}>
            <View style={styles.presetHeader}>
              <Text variant="headline">Build your own</Text>
              <Icon name="plus" size={18} color={colors.accent} />
            </View>
            <Text variant="subhead" tone="secondary" style={{ marginTop: 2 }}>
              Name your days, pick muscle groups and choose exercises for each.
            </Text>
          </Card>
          {choosing && <Button title="Cancel" variant="plain" onPress={() => setChoosing(false)} style={{ marginTop: SPACE.md }} />}
        </>
      )}

      {others.length > 0 && (
        <>
          <SectionHeader title="Saved splits" />
          <Card padded={false}>
            {others.map((s, i) => (
              <View key={s.id} style={[styles.savedRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{s.name}</Text>
                  <Text variant="footnote" tone="secondary">{`${s.days.length} days`}</Text>
                </View>
                <Button title="Use" size="sm" variant="tinted" full={false} onPress={() => activateSplit(s.id)} />
                <PressableScale
                  hitSlop={8}
                  onPress={() =>
                    Alert.alert(`Delete ${s.name}?`, 'Its days are removed; workout history is kept.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteSplit(s.id) },
                    ])
                  }
                >
                  <Icon name="trash" size={16} color={colors.textTertiary} />
                </PressableScale>
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  splitHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginBottom: 4 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  iconButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.md },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  section: { marginTop: SPACE.md, paddingTop: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth, gap: SPACE.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  presetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  presetDays: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: SPACE.md },
  presetDay: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
});
