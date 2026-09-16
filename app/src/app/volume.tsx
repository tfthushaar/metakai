import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useBody } from '../core/goals/useBody';
import { getDb } from '../core/db/database';
import { useQuery } from '../core/db/useQuery';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { addDays, dateKey } from '../lib/dates';
import { GOALS } from '../lib/goals';
import { VOLUME_GROUPS, volumeRangeForGoal, volumeStatus, weeklyVolume, type VolumeStatus } from '../lib/training';
import { getExercise } from '../modules/workouts/repo';
import { Card } from '../ui/Card';
import { ProgressBar } from '../ui/ProgressBar';
import { Screen } from '../ui/Screen';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Text } from '../ui/Text';

type Window = '7' | '14';

/** Completed working sets per exercise since a date. */
function setsSince(from: string): { exerciseId: string; sets: number }[] {
  return getDb().getAllSync<{ exerciseId: string; sets: number }>(
    `SELECT we.exercise_id AS exerciseId, COUNT(*) AS sets FROM workout_sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN workouts w ON w.id = s.workout_id
     WHERE s.deleted_at IS NULL AND we.deleted_at IS NULL AND w.deleted_at IS NULL
       AND s.completed_at IS NOT NULL AND s.kind != 'warmup' AND w.date_key >= ?
     GROUP BY we.exercise_id`,
    [from],
  );
}

export default function Volume() {
  const { colors } = useTheme();
  const { phase } = useBody();
  const [window, setWindow] = useState<Window>('7');
  const days = Number(window);
  const from = addDays(dateKey(), -(days - 1));
  const rows = useQuery(['workout_sets', 'workouts'], () => setsSince(from), [from]);
  const range = volumeRangeForGoal(phase ? GOALS[phase.goalType].direction : 0);

  const volume = useMemo(() => {
    const weekly = weeklyVolume(rows.map((r) => ({ ...getExercise(r.exerciseId), sets: r.sets })));
    // Normalise a two-week window to sets per week.
    return Object.fromEntries(Object.entries(weekly).map(([k, v]) => [k, v / (days / 7)]));
  }, [rows, days]);

  const statusColor: Record<VolumeStatus, string> = { none: colors.textTertiary, low: colors.warning, good: colors.success, high: colors.accent };
  const statusLabel: Record<VolumeStatus, string> = { none: 'Not trained', low: 'Below range', good: 'In range', high: 'Above range' };
  const max = Math.max(range.high + 4, ...Object.values(volume));

  return (
    <Screen title="Muscle volume" back>
      <Text variant="subhead" tone="secondary" style={{ marginBottom: SPACE.md }}>
        {`Hard sets per muscle each week. ${phase ? GOALS[phase.goalType].title : 'Your goal'} target: ${range.low}–${range.high} sets. Secondary muscles count as half a set.`}
      </Text>
      <SegmentedControl<Window>
        value={window}
        onChange={setWindow}
        segments={[
          { value: '7', label: 'Last 7 days' },
          { value: '14', label: 'Last 14 days' },
        ]}
      />
      <Card style={{ marginTop: SPACE.md }}>
        <Animated.View key={window} entering={FadeIn.duration(250)} style={{ gap: SPACE.lg }}>
          {VOLUME_GROUPS.map((g, i) => {
            const sets = volume[g.id] ?? 0;
            const status = volumeStatus(sets, range);
            return (
              <View key={g.id} style={{ gap: 6 }}>
                <View style={styles.rowHeader}>
                  <Text variant="headline">{g.label}</Text>
                  <Text variant="subhead" tabular color={statusColor[status]}>
                    {`${sets % 1 ? sets.toFixed(1) : sets} sets · ${statusLabel[status]}`}
                  </Text>
                </View>
                <View>
                  <ProgressBar progress={sets / max} color={statusColor[status]} height={8} delay={i * 30} />
                  <View
                    pointerEvents="none"
                    style={[styles.band, { left: `${(range.low / max) * 100}%`, width: `${((range.high - range.low) / max) * 100}%`, borderColor: colors.textTertiary }]}
                  />
                </View>
              </View>
            );
          })}
        </Animated.View>
      </Card>
      <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.md, paddingHorizontal: SPACE.sm }}>
        The outlined band marks the target range. On a cut, keep lifting heavy and trim volume rather than weight.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  band: { position: 'absolute', top: -3, height: 14, borderWidth: 1, borderStyle: 'dashed', borderRadius: RADIUS.sm },
});
