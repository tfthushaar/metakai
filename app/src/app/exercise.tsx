import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useQuery } from '../core/db/useQuery';
import { useTheme } from '../core/theme/ThemeProvider';
import { SPACE } from '../core/theme/typography';
import { formatShort, relativeDay } from '../lib/dates';
import { bestSet, estimate1RM, PERCENT_TABLE, weightForReps } from '../lib/strength';
import { weightUnit } from '../lib/units';
import { ExercisePreview, formatWeight, MiniLineChart, useUnits } from '../modules/workouts/components';
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '../modules/workouts/exercises';
import { exerciseHistory, exerciseRecords, getExercise } from '../modules/workouts/repo';
import { Card, SectionHeader } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';

const TABLES = ['workouts', 'workout_exercises', 'workout_sets', 'custom_exercises'] as const;

export default function ExerciseDetail() {
  const { colors } = useTheme();
  const units = useUnits();
  const { id } = useLocalSearchParams<{ id: string }>();
  const exercise = useQuery([...TABLES], () => getExercise(id), [id]);
  const history = useQuery([...TABLES], () => exerciseHistory(id), [id]);
  const records = useQuery([...TABLES], () => exerciseRecords(id), [id]);
  const wu = weightUnit(units);

  const trend = useMemo(
    () =>
      [...history]
        .reverse()
        .map((s) => {
          const best = bestSet(s.sets.filter((x) => x.kind !== 'warmup' && x.weightKg != null && x.reps != null).map((x) => ({ weight: x.weightKg!, reps: x.reps! })));
          return best ? estimate1RM(best.weight, best.reps) : 0;
        })
        .filter((v) => v > 0),
    [history],
  );

  const tags = [
    ...exercise.primary.map(MUSCLE_LABEL),
    EQUIPMENT_LABEL[exercise.equipment],
    exercise.level ? exercise.level[0].toUpperCase() + exercise.level.slice(1) : null,
  ].filter(Boolean) as string[];

  return (
    <Screen title={exercise.name} back>
      <ExercisePreview exercise={exercise} />

      <View style={styles.tags}>
        {tags.map((t) => (
          <View key={t} style={[styles.tag, { backgroundColor: colors.fill }]}>
            <Text variant="footnote" weight="medium">
              {t}
            </Text>
          </View>
        ))}
      </View>
      {exercise.secondary.length > 0 && (
        <Text variant="footnote" tone="secondary" style={{ marginTop: SPACE.sm }}>
          {`Also works ${exercise.secondary.map(MUSCLE_LABEL).join(', ')}`}
        </Text>
      )}

      {records.best1RM > 0 ? (
        <>
          <View style={styles.stats}>
            <Card style={styles.stat}>
              <Text variant="footnote" tone="secondary">
                Est. 1RM
              </Text>
              <Text variant="title2" tabular>{`${formatWeight(records.best1RM, units)} ${wu}`}</Text>
            </Card>
            <Card style={styles.stat}>
              <Text variant="footnote" tone="secondary">
                Heaviest
              </Text>
              <Text variant="title2" tabular>{`${formatWeight(records.heaviest, units)} ${wu}`}</Text>
            </Card>
            <Card style={styles.stat}>
              <Text variant="footnote" tone="secondary">
                Sessions
              </Text>
              <Text variant="title2" tabular>
                {history.length}
              </Text>
            </Card>
          </View>

          {trend.length > 1 && (
            <>
              <SectionHeader title="Estimated 1RM" />
              <Card>
                <MiniLineChart values={trend} />
                <View style={styles.chartLabels}>
                  <Text variant="caption" tone="tertiary">
                    {formatShort(history[history.length - 1].dateKey)}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    {formatShort(history[0].dateKey)}
                  </Text>
                </View>
              </Card>
            </>
          )}

          <SectionHeader title="Rep maxes" />
          <Card padded={false}>
            <View style={styles.table}>
              {[1, 3, 5, 8, 10, 12].map((reps) => (
                <View key={reps} style={styles.tableCell}>
                  <Text variant="caption" tone="secondary">{`${reps} RM`}</Text>
                  <Text variant="headline" tabular>
                    {formatWeight(Math.round(weightForReps(records.best1RM, reps) * 2) / 2, units)}
                  </Text>
                </View>
              ))}
            </View>
            <View style={[styles.table, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}>
              {PERCENT_TABLE.slice(1, 7).map((pct) => (
                <View key={pct} style={styles.tableCell}>
                  <Text variant="caption" tone="secondary">{`${pct}%`}</Text>
                  <Text variant="subhead" tabular>
                    {formatWeight(Math.round(((records.best1RM * pct) / 100) * 2) / 2, units)}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          <SectionHeader title="History" />
          <Card padded={false}>
            {history.slice(0, 15).map((s, i) => (
              <View key={s.workoutId} style={[styles.session, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}>
                <Text variant="subhead" weight="semibold" style={{ width: 96 }}>
                  {relativeDay(s.dateKey)}
                </Text>
                <Text variant="subhead" tone="secondary" tabular style={{ flex: 1 }}>
                  {s.sets.map((x) => `${x.kind === 'warmup' ? 'W ' : ''}${formatWeight(x.weightKg, units)}×${x.reps ?? '—'}`).join('  ')}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : (
        <Card style={{ marginTop: SPACE.xl }}>
          <Text variant="headline">No sets logged yet</Text>
          <Text variant="subhead" tone="secondary">
            Your records, estimated 1RM and history appear after your first session.
          </Text>
        </Card>
      )}

      {exercise.instructions.length > 0 && (
        <>
          <SectionHeader title="How to" />
          <Card>
            <View style={{ gap: SPACE.md }}>
              {exercise.instructions.map((step, i) => (
                <View key={i} style={styles.step}>
                  <View style={[styles.stepNumber, { backgroundColor: colors.fill }]}>
                    <Text variant="caption" weight="bold">
                      {i + 1}
                    </Text>
                  </View>
                  <Text variant="subhead" style={{ flex: 1 }}>
                    {step}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
          <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.sm, paddingHorizontal: SPACE.sm }}>
            Exercise data and images from free-exercise-db (public domain).
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.lg },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  stats: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xl },
  stat: { flex: 1, gap: 2, padding: SPACE.md },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  table: { flexDirection: 'row', paddingVertical: SPACE.md },
  tableCell: { flex: 1, alignItems: 'center', gap: 2 },
  session: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, gap: SPACE.sm },
  step: { flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' },
  stepNumber: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
