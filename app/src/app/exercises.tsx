import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQuery } from '../core/db/useQuery';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE, TYPE } from '../core/theme/typography';
import { ExerciseThumb } from '../modules/workouts/components';
import { EQUIPMENT_LABEL, MUSCLE_GROUPS, MUSCLE_LABEL, searchExercises, type Equipment, type Exercise } from '../modules/workouts/exercises';
import { useExercisePicker } from '../modules/workouts/picker';
import { GROUP_LABEL, GROUP_MUSCLES, type SplitGroup } from '../modules/workouts/splits';
import { addCustomExercise, allExercises } from '../modules/workouts/repo';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';

const EQUIPMENT_FILTERS: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'ez_bar'];

const Row = ({ exercise, selected, onPress }: { exercise: Exercise; selected: boolean; onPress: () => void }) => {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} scaleTo={0.99} style={[styles.row, selected && { backgroundColor: colors.accentSoft }]}>
      <ExerciseThumb exercise={exercise} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" numberOfLines={1}>
          {exercise.name}
        </Text>
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {[exercise.primary.map(MUSCLE_LABEL).join(', '), EQUIPMENT_LABEL[exercise.equipment]].filter(Boolean).join(' · ')}
          {exercise.custom ? ' · Custom' : ''}
        </Text>
      </View>
      {selected && (
        <View style={[styles.check, { backgroundColor: colors.accent }]}>
          <Icon name="check" size={14} color={colors.onAccent} strokeWidth={3} />
        </View>
      )}
    </PressableScale>
  );
};

export default function Exercises() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode, group: splitGroup } = useLocalSearchParams<{ mode?: 'pick'; group?: SplitGroup }>();
  const picking = mode === 'pick';
  const onPick = useExercisePicker((s) => s.onPick);
  const clearPicker = useExercisePicker((s) => s.clear);

  const all = useQuery(['custom_exercises'], allExercises);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => () => clearPicker(), [clearPicker]);

  const results = useMemo(() => {
    const found = searchExercises(all, query, group, equipment);
    if (!splitGroup || !GROUP_MUSCLES[splitGroup]) return found;
    const muscles = GROUP_MUSCLES[splitGroup];
    return found.filter((e) => e.primary.some((m) => muscles.includes(m)));
  }, [all, query, group, equipment, splitGroup]);

  const press = (e: Exercise) => {
    if (!picking) {
      router.push({ pathname: '/exercise', params: { id: e.id } });
      return;
    }
    haptic.selection();
    setSelected((s) => (s.includes(e.id) ? s.filter((x) => x !== e.id) : [...s, e.id]));
  };

  const createCustom = () => {
    const name = query.trim();
    if (!name) return;
    const muscles = group ? MUSCLE_GROUPS.find((g) => g.id === group)!.muscles.slice(0, 1) : [];
    const id = addCustomExercise(name, muscles, equipment ?? 'other');
    haptic.success();
    if (picking) setSelected((s) => [...s, id]);
  };

  const confirm = () => {
    onPick?.(selected);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + SPACE.sm }}>
      <View style={styles.header}>
        <PressableScale onPress={() => router.back()} hitSlop={10} style={styles.headerButton}>
          <Icon name={picking ? 'close' : 'chevronLeft'} size={24} color={colors.accent} strokeWidth={2.4} />
        </PressableScale>
        <Text variant="headline">{picking ? (splitGroup ? `Add ${GROUP_LABEL[splitGroup]} exercises` : 'Add exercises') : 'Exercises'}</Text>
        <View style={styles.headerButton} />
      </View>

      <View style={[styles.search, { backgroundColor: colors.fill }]}>
        <Icon name="search" size={16} color={colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search 876 exercises"
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.accent}
          style={[TYPE.body, { flex: 1, color: colors.text, paddingVertical: 8 }]}
          autoCorrect={false}
        />
        {query !== '' && (
          <PressableScale onPress={() => setQuery('')} hitSlop={8}>
            <Icon name="close" size={16} color={colors.textTertiary} />
          </PressableScale>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0, display: splitGroup ? 'none' : 'flex' }}>
        {MUSCLE_GROUPS.map((g) => (
          <Chip key={g.id} label={g.label} selected={group === g.id} onPress={() => setGroup(group === g.id ? null : g.id)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { paddingTop: 0 }]} style={{ flexGrow: 0 }}>
        {EQUIPMENT_FILTERS.map((e) => (
          <Chip key={e} label={EQUIPMENT_LABEL[e]} selected={equipment === e} onPress={() => setEquipment(equipment === e ? null : e)} />
        ))}
      </ScrollView>

      <FlatList
        data={results}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        windowSize={9}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.separator }]} />}
        renderItem={({ item }) => <Row exercise={item} selected={selected.includes(item.id)} onPress={() => press(item)} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="headline">No matches</Text>
            <Text variant="subhead" tone="secondary" align="center">
              {query.trim() ? `Create “${query.trim()}” as a custom exercise.` : 'Try another filter.'}
            </Text>
            {query.trim() !== '' && <Button title="Create exercise" size="md" full={false} icon="plus" onPress={createCustom} />}
          </View>
        }
        ListFooterComponent={
          results.length > 0 && query.trim() !== '' ? (
            <View style={{ padding: SPACE.lg }}>
              <Button title={`Create “${query.trim()}”`} variant="gray" size="md" icon="plus" onPress={createCustom} />
            </View>
          ) : null
        }
      />

      {picking && selected.length > 0 && (
        <Animated.View entering={FadeIn.duration(200)} style={[styles.footer, { paddingBottom: insets.bottom + SPACE.md, backgroundColor: colors.background, borderTopColor: colors.separator }]}>
          <Button title={`Add ${selected.length} ${selected.length === 1 ? 'exercise' : 'exercises'}`} onPress={confirm} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.sm, height: 44 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginHorizontal: SPACE.lg, paddingHorizontal: SPACE.md, borderRadius: RADIUS.md },
  chips: { gap: SPACE.sm, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: 10 },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: SPACE.lg + 44 + SPACE.md },
  empty: { alignItems: 'center', gap: SPACE.sm, padding: SPACE.xxl },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: SPACE.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
