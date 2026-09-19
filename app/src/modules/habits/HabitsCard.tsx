import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';

import { useBody } from '../../core/goals/useBody';
import { useQuery } from '../../core/db/useQuery';
import { useSettings } from '../../core/store/settings';
import { useTheme } from '../../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../../core/theme/typography';
import { dateKey } from '../../lib/dates';
import { GOALS } from '../../lib/goals';
import { Card } from '../../ui/Card';
import { haptic } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { SPRING } from '../../ui/motion';
import { PressableScale } from '../../ui/PressableScale';
import { Text } from '../../ui/Text';
import { toast } from '../../ui/Toast';
import { dayFacts, habitAvailable, isDone, listHabits, manualDone, seedHabits, setManualDone, type Habit } from './repo';

const TABLES = ['habits', 'habit_logs', 'log_entries', 'water_entries', 'workouts', 'cardio_sessions', 'weight_entries'] as const;

const AUTO_HINT: Record<Exclude<Habit['kind'], 'manual'>, string> = {
  protein: 'Checks itself when you log enough protein',
  calories: 'Checks itself when calories land within 10% of target',
  water: 'Checks itself when you reach your water goal',
  workout: 'Checks itself when you finish a workout',
  weigh_in: 'Checks itself when you log your weight',
};

function HabitPill({ habit, done, onToggle }: { habit: Habit; done: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const fill = useAnimatedStyle(() => ({
    backgroundColor: withTiming(done ? colors.accent : colors.fill, { duration: 220 }),
    transform: [{ scale: withSpring(done ? 1 : 0.96, SPRING) }],
  }));
  return (
    <PressableScale onPress={onToggle} scaleTo={0.94} feedback="none">
      <Animated.View style={[styles.pill, fill]}>
        <View style={[styles.dot, { borderColor: done ? colors.onAccent : colors.textTertiary, backgroundColor: done ? colors.onAccent : 'transparent' }]}>
          {done && <Icon name="check" size={10} color={colors.accent} strokeWidth={3.5} />}
        </View>
        <Text variant="subhead" weight="medium" color={done ? colors.onAccent : colors.text} numberOfLines={1}>
          {habit.name}
        </Text>
        {habit.kind !== 'manual' && !done && <Icon name="zap" size={12} color={colors.textTertiary} />}
      </Animated.View>
    </PressableScale>
  );
}

export function HabitsCard({ index }: { index: number }) {
  const router = useRouter();
  const waterGoal = useSettings((s) => s.waterGoalMl);
  const { targets, phase } = useBody();
  const today = dateKey();

  useEffect(() => {
    seedHabits(phase ? GOALS[phase.goalType].direction !== 0 : true);
  }, [phase]);

  const modules = useSettings((s) => s.enabledModules);
  const habits = useQuery([...TABLES], listHabits).filter((h) => habitAvailable(h.kind, modules));
  const facts = useQuery([...TABLES], () => dayFacts(today), [today]);
  const manual = useQuery([...TABLES], () => manualDone(today), [today]);
  const t = targets ? { protein: targets.protein, kcal: targets.kcal, waterMl: waterGoal } : null;

  if (habits.length === 0) return null;
  const doneCount = habits.filter((h) => isDone(h, facts, manual, t)).length;

  return (
    <Card index={index}>
      <PressableScale onPress={() => router.push('/habits')} scaleTo={0.99} style={styles.header}>
        <Text variant="headline">Habits</Text>
        <Text variant="subhead" tone={doneCount === habits.length ? 'accent' : 'secondary'} weight="semibold" tabular>
          {doneCount === habits.length ? 'All done' : `${doneCount} of ${habits.length}`}
        </Text>
      </PressableScale>
      <View style={styles.pills}>
        {habits.map((h) => {
          const done = isDone(h, facts, manual, t);
          return (
            <HabitPill
              key={h.id}
              habit={h}
              done={done}
              onToggle={() => {
                if (h.kind !== 'manual') {
                  haptic.selection();
                  toast(AUTO_HINT[h.kind]);
                  return;
                }
                if (done) haptic.selection();
                else haptic.success();
                setManualDone(h.id, today, !done);
              }}
            />
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.md },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, paddingRight: 14, height: 36, borderRadius: RADIUS.pill },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
