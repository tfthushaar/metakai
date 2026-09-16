import { useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { useQuery } from '../../core/db/useQuery';
import { useFeature } from '../../core/store/settings';
import { useTheme } from '../../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../../core/theme/typography';
import { addDays, dateKey, relativeDay } from '../../lib/dates';
import { cardioLabel, formatPace, paceMinPerKm } from '../../lib/cardio';
import { formatDurationWords } from '../../lib/strength';
import { weightUnit } from '../../lib/units';
import { cardioStats, deleteCardio, listCardio, type CardioSession } from '../../modules/cardio/repo';
import { ElapsedText, formatVolume, formatWeight, useUnits } from '../../modules/workouts/components';
import {
  activeSplit,
  activeWorkout,
  getExercise,
  listRoutines,
  listWorkouts,
  overloadSummary,
  startWorkout,
  trainingStats,
  type Routine,
} from '../../modules/workouts/repo';
import { Button } from '../../ui/Button';
import { Card, SectionHeader } from '../../ui/Card';
import { haptic } from '../../ui/haptics';
import { Icon, type IconName } from '../../ui/Icon';
import { ListGroup, ListRow } from '../../ui/List';
import { PressableScale } from '../../ui/PressableScale';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';

const TABLES = ['workouts', 'workout_exercises', 'workout_sets', 'routines', 'routine_items', 'splits'] as const;
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const CARDIO_ICON: Partial<Record<CardioSession['kind'], IconName>> = { cycle: 'bike', hiit: 'timer', walk: 'footprints', run: 'footprints' };

/** "Push" → "Push", "Full body A" → "FBA", "Chest & back" → "CB". */
function shortName(name: string): string {
  const words = name.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  if (words.length <= 1) return name.slice(0, 4);
  return words
    .map((w) => w[0].toUpperCase())
    .join('')
    .slice(0, 4);
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="title2" tabular numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

export default function Train() {
  const router = useRouter();
  const { colors } = useTheme();
  const units = useUnits();
  const today = dateKey();
  const weekday = new Date().getDay();
  const active = useQuery([...TABLES], activeWorkout);
  const split = useQuery([...TABLES], activeSplit);
  const routines = useQuery([...TABLES], listRoutines);
  const history = useQuery([...TABLES], () => listWorkouts(8));
  const liftOn = useFeature('workouts');
  const cardioOn = useFeature('cardio');
  const recoveryOn = useFeature('recovery');
  const lifting = useQuery([...TABLES], () => trainingStats(addDays(today, -6)), [today]);
  const cardioWeek = useQuery(['cardio_sessions'], () => cardioStats(addDays(today, -6)), [today]);
  const cardio = useQuery(['cardio_sessions'], () => listCardio(5));
  const week = {
    sessions: (liftOn ? lifting.workouts : 0) + (cardioOn ? cardioWeek.sessions : 0),
    kcal: (liftOn ? lifting.kcal : 0) + (cardioOn ? cardioWeek.kcal : 0),
  };
  const overload = useQuery([...TABLES], () => overloadSummary(addDays(today, -56)), [today]);

  const todayDays = (split?.days ?? routines).filter((r) => r.weekdays.includes(weekday) && r.items.length > 0);
  const todayDay: Routine | undefined = todayDays[0];
  const nextDay = split?.days.flatMap((d) => d.weekdays.map((w) => ({ d, offset: (w - weekday + 7) % 7 || 7 }))).sort((a, b) => a.offset - b.offset)[0];
  const ownRoutines = routines.filter((r) => !r.splitId);
  const progressing = overload.filter((o) => o.status === 'progressing').length;

  const cardioSummary = (c: CardioSession) => {
    const metric = units === 'metric';
    const pace = paceMinPerKm(c.durationMin, c.distanceKm);
    const dist = c.distanceKm == null ? null : metric ? c.distanceKm : c.distanceKm / 1.609344;
    return [
      relativeDay(c.dateKey),
      `${Math.round(c.durationMin)} min`,
      dist != null ? `${dist.toFixed(1)} ${metric ? 'km' : 'mi'}` : null,
      pace != null ? `${formatPace(metric ? pace : pace * 1.609344)} /${metric ? 'km' : 'mi'}` : null,
      c.intervals ? c.intervals.name : null,
    ]
      .filter(Boolean)
      .join(' · ');
  };

  const confirmDeleteCardio = (c: CardioSession) =>
    Alert.alert(`Delete ${cardioLabel(c.kind).toLowerCase()}?`, cardioSummary(c), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCardio(c.id) },
    ]);

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
      <Card index={0}>
        <Text variant="footnote" tone="secondary" style={{ marginBottom: SPACE.sm }}>
          LAST 7 DAYS
        </Text>
        <View style={styles.stats}>
          <Stat value={String(week.sessions)} label={week.sessions === 1 ? 'session' : 'sessions'} />
          <View style={[styles.divider, { backgroundColor: colors.separator }]} />
          <Stat value={week.kcal.toLocaleString('en-US')} label="kcal burned" />
          <View style={[styles.divider, { backgroundColor: colors.separator }]} />
          {liftOn ? (
            <Stat value={formatVolume(lifting.volumeKg, units)} label={`${weightUnit(units)} lifted`} />
          ) : (
            <Stat value={String(cardioWeek.minutes)} label="cardio min" />
          )}
        </View>
        {liftOn && cardioOn && cardioWeek.sessions > 0 && (
          <Text variant="caption" tone="tertiary" align="center" style={{ marginTop: SPACE.sm }}>
            {`Includes ${cardioWeek.sessions} cardio ${cardioWeek.sessions === 1 ? 'session' : 'sessions'} · ${cardioWeek.minutes} min`}
          </Text>
        )}
      </Card>

      {cardioOn && !liftOn && (
        <View style={[styles.actions, { marginTop: SPACE.md }]}>
          <View style={{ flex: 1 }}>
            <Button title="Log cardio" icon="plus" onPress={() => router.push('/log-cardio')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Intervals" icon="timer" variant="gray" onPress={() => router.push('/interval-timer')} />
          </View>
        </View>
      )}

      {liftOn && (
        <>
          {active ? (
            <Card index={1} onPress={() => router.push('/workout')} style={{ marginTop: SPACE.md, backgroundColor: colors.accent }}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text variant="footnote" tone="onAccent" weight="semibold" style={{ opacity: 0.8 }}>
                    IN PROGRESS
                  </Text>
                  <Text variant="title3" tone="onAccent">
                    {active.name}
                  </Text>
                </View>
                <ElapsedText since={active.startedAt} variant="title2" color={colors.onAccent} />
              </View>
            </Card>
          ) : (
            <Card index={1} style={{ marginTop: SPACE.md }}>
              <Text variant="footnote" tone="secondary">
                {todayDay || !split ? 'TODAY' : 'REST DAY'}
              </Text>
              <Text variant="title2" style={{ marginTop: 2 }}>
                {todayDay
                  ? todayDay.name
                  : split
                    ? nextDay
                      ? `Next: ${nextDay.d.name} ${nextDay.offset === 1 ? 'tomorrow' : `in ${nextDay.offset} days`}`
                      : 'No days scheduled'
                    : 'Free training'}
              </Text>
              {todayDay && (
                <Text variant="footnote" tone="secondary" numberOfLines={2} style={{ marginTop: 2 }}>
                  {todayDay.items.map((i) => getExercise(i.exerciseId).name).join(' · ')}
                </Text>
              )}
              <View style={styles.actions}>
                <View style={{ flex: 1 }}>
                  <Button title="Start" icon="play" onPress={() => start(todayDay?.id)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Log done" icon="check" variant="gray" onPress={() => router.push('/quick-workout')} />
                </View>
              </View>
            </Card>
          )}

          <SectionHeader
            title="Split"
            action={<Button title={split ? 'Edit' : 'Choose'} size="sm" variant="tinted" full={false} onPress={() => router.push('/split')} />}
          />
          <Card index={2} onPress={() => router.push('/split')}>
            {split ? (
              <>
                <Text variant="headline">{split.name}</Text>
                <View style={styles.week}>
                  {DAY_LETTERS.map((l, i) => {
                    const day = split.days.find((d) => d.weekdays.includes(i));
                    const isToday = i === weekday;
                    return (
                      <View key={i} style={styles.weekCell}>
                        <Text variant="caption" tone={isToday ? 'accent' : 'tertiary'} weight={isToday ? 'bold' : 'medium'}>
                          {l}
                        </Text>
                        <View style={[styles.weekPill, { backgroundColor: day ? (isToday ? colors.accent : colors.text) : colors.fill }]}>
                          <Text
                            variant="caption"
                            weight="semibold"
                            numberOfLines={1}
                            color={day ? (isToday ? colors.onAccent : colors.background) : colors.textTertiary}
                          >
                            {day ? shortName(day.name) : '—'}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                <Text variant="headline">Pick your split</Text>
                <Text variant="subhead" tone="secondary" style={{ marginTop: 2 }}>
                  Push/Pull/Legs, Upper/Lower, Full body, PHUL, Arnold, Bro split, or build your own with the exercises you like.
                </Text>
              </>
            )}
          </Card>

          <SectionHeader
            title="Progressive overload"
            action={<Button title="All" size="sm" variant="tinted" full={false} onPress={() => router.push('/overload')} />}
          />
          <Card index={3} padded={false} onPress={() => router.push('/overload')}>
            {overload.length === 0 ? (
              <View style={{ padding: SPACE.lg }}>
                <Text variant="subhead" tone="secondary">
                  Log workouts to see which lifts are going up.
                </Text>
              </View>
            ) : (
              <>
                <View style={[styles.overloadHead, { borderBottomColor: colors.separator }]}>
                  <Text variant="subhead" tone="secondary">{`${progressing} of ${overload.length} lifts progressing`}</Text>
                </View>
                {overload.slice(0, 4).map((o) => {
                  const color = o.status === 'progressing' ? colors.success : o.status === 'slipping' ? colors.warning : colors.textSecondary;
                  return (
                    <View key={o.exerciseId} style={styles.overloadRow}>
                      <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                        {getExercise(o.exerciseId).name}
                      </Text>
                      <Text variant="subhead" tabular>{`${formatWeight(Math.round(o.current * 2) / 2, units)} ${weightUnit(units)}`}</Text>
                      <Text variant="subhead" weight="semibold" tabular color={color} style={{ minWidth: 64, textAlign: 'right' }}>
                        {o.changePct == null ? 'new' : `${o.changePct > 0 ? '↑' : o.changePct < 0 ? '↓' : ''} ${Math.abs(o.changePct).toFixed(1)}%`}
                      </Text>
                    </View>
                  );
                })}
              </>
            )}
          </Card>
        </>
      )}

      {cardioOn && (
        <>
          <SectionHeader
            title="Cardio"
            action={
              liftOn ? (
                <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                  <Button title="Intervals" icon="timer" size="sm" variant="gray" full={false} onPress={() => router.push('/interval-timer')} />
                  <Button title="Log" icon="plus" size="sm" variant="tinted" full={false} onPress={() => router.push('/log-cardio')} />
                </View>
              ) : undefined
            }
          />
          <Card index={4} padded={false}>
            {cardio.length === 0 ? (
              <PressableScale scaleTo={0.99} onPress={() => router.push('/log-cardio')} style={{ padding: SPACE.lg, gap: 2 }}>
                <Text variant="headline">No cardio yet</Text>
                <Text variant="subhead" tone="secondary">
                  Log walks, runs, rides or classes, or run a Tabata, HIIT or EMOM timer.
                </Text>
              </PressableScale>
            ) : (
              cardio.map((c, i) => (
                <PressableScale
                  key={c.id}
                  scaleTo={0.99}
                  onLongPress={() => confirmDeleteCardio(c)}
                  style={[styles.listRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}
                >
                  <View style={[styles.cardioIcon, { backgroundColor: colors.fill }]}>
                    <Icon name={CARDIO_ICON[c.kind] ?? 'activity'} size={18} color={colors.text} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body">{cardioLabel(c.kind)}</Text>
                    <Text variant="footnote" tone="secondary" numberOfLines={1}>
                      {cardioSummary(c)}
                    </Text>
                  </View>
                  {c.kcal != null && <Text variant="subhead" weight="semibold" tabular>{`${Math.round(c.kcal)} kcal`}</Text>}
                </PressableScale>
              ))
            )}
          </Card>
          {cardio.length > 0 && (
            <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.sm, paddingHorizontal: SPACE.lg }}>
              Press and hold a session to delete it.
            </Text>
          )}
        </>
      )}

      {liftOn && ownRoutines.length > 0 && (
        <>
          <SectionHeader
            title="Routines"
            action={<Button title="New" icon="plus" size="sm" variant="tinted" full={false} onPress={() => router.push('/routine')} />}
          />
          <Card padded={false} index={4}>
            {ownRoutines.map((r, i) => (
              <PressableScale
                key={r.id}
                scaleTo={0.99}
                onPress={() => router.push({ pathname: '/routine', params: { id: r.id } })}
                style={[styles.listRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="body">{r.name}</Text>
                  <Text variant="footnote" tone="secondary" numberOfLines={1}>{`${r.items.length} exercises`}</Text>
                </View>
                <PressableScale
                  feedback="medium"
                  disabled={!!active || r.items.length === 0}
                  onPress={() => start(r.id)}
                  style={[styles.play, { backgroundColor: colors.accentSoft }]}
                >
                  <Icon name="play" size={16} color={colors.accent} fill={colors.accent} />
                </PressableScale>
              </PressableScale>
            ))}
          </Card>
        </>
      )}

      {liftOn && (
        <ListGroup index={5}>
          <ListRow icon="dumbbell" title="Exercise library" subtitle="876 exercises with demos" onPress={() => router.push('/exercises')} />
          <ListRow icon="activity" iconColor={colors.text} title="Muscle volume" subtitle="Weekly sets per muscle" onPress={() => router.push('/volume')} />
          <ListRow icon="ruler" iconColor={colors.fill} title="Plate calculator" onPress={() => router.push('/plates')} />
          {recoveryOn && <ListRow icon="heartPulse" title="Recovery" subtitle="Readiness and muscle recovery" onPress={() => router.push('/recovery')} />}
          {ownRoutines.length === 0 && <ListRow icon="plus" iconColor={colors.fill} title="New routine" onPress={() => router.push('/routine')} />}
        </ListGroup>
      )}

      {liftOn && history.length > 0 && (
        <>
          <SectionHeader title="History" />
          <Card padded={false} index={6}>
            {history.map((w, i) => (
              <PressableScale
                key={w.id}
                scaleTo={0.99}
                onPress={() => router.push({ pathname: '/workout-summary', params: { id: w.id } })}
                style={[styles.listRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="body" numberOfLines={1}>
                    {w.name}
                  </Text>
                  <Text variant="footnote" tone="secondary" numberOfLines={1}>
                    {`${relativeDay(w.dateKey)} · ${formatDurationWords(new Date(w.endedAt!).getTime() - new Date(w.startedAt).getTime())} · ${w.setCount} sets`}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="subhead" weight="semibold" tabular>{`${formatVolume(w.volumeKg, units)} ${weightUnit(units)}`}</Text>
                  {w.kcal != null && <Text variant="caption" tone="secondary" tabular>{`${Math.round(w.kcal)} kcal`}</Text>}
                </View>
              </PressableScale>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gear: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stats: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  divider: { width: StyleSheet.hairlineWidth, height: 36 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  actions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg },
  week: { flexDirection: 'row', gap: 4, marginTop: SPACE.md },
  weekCell: { flex: 1, alignItems: 'center', gap: 4 },
  weekPill: { width: '100%', height: 28, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  overloadHead: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderBottomWidth: StyleSheet.hairlineWidth },
  overloadRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: 10 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
  cardioIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  play: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
