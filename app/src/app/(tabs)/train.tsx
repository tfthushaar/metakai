import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useQuery } from '../../core/db/useQuery';
import { useTheme } from '../../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../../core/theme/typography';
import { addDays, dateKey, relativeDay } from '../../lib/dates';
import { formatDurationWords } from '../../lib/strength';
import { weightUnit } from '../../lib/units';
import { ElapsedText, formatVolume, useUnits } from '../../modules/workouts/components';
import { activeWorkout, getExercise, listRoutines, listWorkouts, startWorkout, workoutsSince } from '../../modules/workouts/repo';
import { Button } from '../../ui/Button';
import { Card, SectionHeader } from '../../ui/Card';
import { haptic } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { ListGroup, ListRow } from '../../ui/List';
import { PressableScale } from '../../ui/PressableScale';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';

const TABLES = ['workouts', 'workout_exercises', 'workout_sets'] as const;

export default function Train() {
  const router = useRouter();
  const { colors } = useTheme();
  const units = useUnits();
  const active = useQuery([...TABLES], activeWorkout);
  const routines = useQuery(['routines', 'routine_items'], listRoutines);
  const history = useQuery([...TABLES], () => listWorkouts(12));
  const weekStart = addDays(dateKey(), -6);
  const weekCount = useQuery([...TABLES], () => workoutsSince(weekStart), [weekStart]);
  const weekVolume = history.filter((w) => w.dateKey >= weekStart).reduce((s, w) => s + w.volumeKg, 0);

  const start = (routineId?: string) => {
    haptic.medium();
    startWorkout({ routineId });
    router.push('/workout');
  };

  return (
    <Screen
      title="Train"
      tabBar
      accessory={
        <PressableScale feedback="selection" onPress={() => router.push('/settings/gym')} style={[styles.gear, { backgroundColor: colors.fill }]}>
          <Icon name="settings" size={17} color={colors.text} />
        </PressableScale>
      }
    >
      {active ? (
        <Card index={0} onPress={() => router.push('/workout')} style={{ backgroundColor: colors.accent }}>
          <View style={styles.activeRow}>
            <View style={{ flex: 1 }}>
              <Text variant="footnote" tone="onAccent" weight="semibold" style={{ opacity: 0.8 }}>
                IN PROGRESS
              </Text>
              <Text variant="title3" tone="onAccent">
                {active.name}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <ElapsedText since={active.startedAt} variant="title2" color={colors.onAccent} />
              <Text variant="footnote" tone="onAccent" style={{ opacity: 0.8 }}>
                Tap to resume
              </Text>
            </View>
          </View>
        </Card>
      ) : (
        <Card index={0}>
          <View style={styles.stats}>
            <View style={{ flex: 1 }}>
              <Text variant="footnote" tone="secondary">
                Last 7 days
              </Text>
              <Text variant="title1" tabular>{`${weekCount} ${weekCount === 1 ? 'workout' : 'workouts'}`}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="footnote" tone="secondary">
                Volume
              </Text>
              <Text variant="title3" tabular>{`${formatVolume(weekVolume, units)} ${weightUnit(units)}`}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg }}>
            <View style={{ flex: 1 }}>
              <Button title="Start workout" icon="dumbbell" onPress={() => start()} />
            </View>
          </View>
        </Card>
      )}

      <SectionHeader
        title="Routines"
        action={<Button title="New" icon="plus" size="sm" variant="tinted" full={false} onPress={() => router.push('/routine')} />}
      />
      {routines.length === 0 ? (
        <Card index={1}>
          <Text variant="headline">Save your split</Text>
          <Text variant="subhead" tone="secondary" style={{ marginTop: 4 }}>
            Create routines like Push, Pull and Legs to start workouts in one tap. Metakai fills in your last weights.
          </Text>
        </Card>
      ) : (
        routines.map((r, i) => (
          <Card key={r.id} index={i + 1} style={{ marginBottom: SPACE.md }} onPress={() => router.push({ pathname: '/routine', params: { id: r.id } })}>
            <View style={styles.routineRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="headline">{r.name}</Text>
                <Text variant="footnote" tone="secondary" numberOfLines={2}>
                  {r.items.length ? r.items.map((it) => getExercise(it.exerciseId).name).join(' · ') : 'No exercises yet'}
                </Text>
              </View>
              <PressableScale
                feedback="medium"
                disabled={!!active || r.items.length === 0}
                onPress={() => start(r.id)}
                style={[styles.play, { backgroundColor: colors.accentSoft }]}
                accessibilityLabel={`Start ${r.name}`}
              >
                <Icon name="play" size={18} color={colors.accent} strokeWidth={2.6} fill={colors.accent} />
              </PressableScale>
            </View>
          </Card>
        ))
      )}

      <ListGroup index={routines.length + 2}>
        <ListRow icon="dumbbell" title="Exercise library" subtitle="876 exercises with demos and your history" onPress={() => router.push('/exercises')} />
        <ListRow icon="ruler" iconColor={colors.text} title="Plate calculator" onPress={() => router.push('/plates')} />
      </ListGroup>

      {history.length > 0 && (
        <>
          <SectionHeader title="History" />
          <Card padded={false} index={routines.length + 3}>
            {history.map((w, i) => (
              <View key={w.id}>
                {i > 0 && <View style={[styles.sep, { backgroundColor: colors.separator }]} />}
                <PressableScale scaleTo={0.99} onPress={() => router.push({ pathname: '/workout-summary', params: { id: w.id } })} style={styles.historyRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body" numberOfLines={1}>
                      {w.name}
                    </Text>
                    <Text variant="footnote" tone="secondary" numberOfLines={1}>
                      {`${relativeDay(w.dateKey)} · ${formatDurationWords(new Date(w.endedAt!).getTime() - new Date(w.startedAt).getTime())} · ${w.setCount} sets`}
                    </Text>
                  </View>
                  <Text variant="subhead" weight="semibold" tabular>{`${formatVolume(w.volumeKg, units)} ${weightUnit(units)}`}</Text>
                  <Icon name="chevronRight" size={16} color={colors.textTertiary} />
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
  gear: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  stats: { flexDirection: 'row', alignItems: 'flex-end' },
  routineRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  play: { width: 44, height: 44, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: SPACE.lg },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
});
