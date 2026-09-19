import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useBody } from '../core/goals/useBody';
import { useQuery } from '../core/db/useQuery';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { SPACE } from '../core/theme/typography';
import { dateKey } from '../lib/dates';
import { addHabit, AUTO_HABITS, habitAvailable, listHabits, removeHabit, streak, SUGGESTED_MANUAL } from '../modules/habits/repo';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { ListGroup, ListRow } from '../ui/List';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';

const HABIT_TABLES = ['habits', 'habit_logs', 'log_entries', 'water_entries', 'workouts', 'cardio_sessions', 'weight_entries'] as const;

export default function Habits() {
  const { colors } = useTheme();
  const waterGoal = useSettings((s) => s.waterGoalMl);
  const { targets } = useBody();
  const modules = useSettings((s) => s.enabledModules);
  const all = useQuery([...HABIT_TABLES], listHabits);
  const habits = all.filter((h) => habitAvailable(h.kind, modules));
  const [name, setName] = useState('');
  const today = dateKey();
  const t = targets ? { protein: targets.protein, kcal: targets.kcal, waterMl: waterGoal } : null;

  const autoKinds = new Set(all.map((h) => h.kind));
  const names = new Set(all.map((h) => h.name.toLowerCase()));
  const autoOptions = AUTO_HABITS.filter((a) => !autoKinds.has(a.kind) && habitAvailable(a.kind, modules));

  const add = (label: string, kind: Parameters<typeof addHabit>[1] = 'manual') => {
    if (!label.trim()) return;
    addHabit(label, kind);
    haptic.success();
    setName('');
  };

  return (
    <Screen title="Habits" back>
      <Text variant="subhead" tone="secondary">
        Small daily wins that add up. Automatic habits tick themselves off from what you log.
      </Text>

      {habits.length > 0 && (
        <ListGroup header="Your habits">
          {habits.map((h) => (
            <ListRow
              key={h.id}
              title={h.name}
              subtitle={`${h.kind === 'manual' ? 'Tap to check off on Today' : 'Automatic'} · ${streak(h, today, t)} day streak`}
              accessory={
                <PressableScale hitSlop={8} onPress={() => removeHabit(h.id)} style={[styles.remove, { backgroundColor: colors.fill }]}>
                  <Icon name="minus" size={16} color={colors.danger} strokeWidth={2.6} />
                </PressableScale>
              }
            />
          ))}
        </ListGroup>
      )}

      {autoOptions.length > 0 && (
        <ListGroup header="Automatic">
          {autoOptions.map((a) => (
            <ListRow
              key={a.kind}
              title={a.name}
              subtitle={a.description}
              accessory={<Button title="Add" size="sm" variant="tinted" full={false} onPress={() => add(a.name, a.kind)} />}
            />
          ))}
        </ListGroup>
      )}

      <Text variant="footnote" tone="secondary" style={{ marginTop: SPACE.xl, marginBottom: SPACE.sm, paddingHorizontal: SPACE.lg }}>
        CUSTOM
      </Text>
      <View style={styles.addRow}>
        <View style={{ flex: 1 }}>
          <TextField value={name} onChangeText={setName} placeholder="e.g. 10 minutes of mobility" onSubmitEditing={() => add(name)} returnKeyType="done" />
        </View>
        <Button title="Add" size="md" full={false} onPress={() => add(name)} disabled={!name.trim()} />
      </View>
      <View style={styles.chips}>
        {SUGGESTED_MANUAL.filter((s) => !names.has(s.toLowerCase())).map((s) => (
          <Chip key={s} label={s} icon="plus" onPress={() => add(s)} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  remove: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.md },
});
