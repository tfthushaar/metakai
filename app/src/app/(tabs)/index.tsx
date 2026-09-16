import { useRouter } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useBody } from '../../core/goals/useBody';
import { addWater, listLog, MEAL_SLOTS, undoLastWater, waterTotal } from '../../core/db/repo';
import { useQuery } from '../../core/db/useQuery';
import { orderedTodayCards, useFeature, useSettings, type TodayCardId } from '../../core/store/settings';
import { useAuth } from '../../core/auth/auth';
import { useSync } from '../../core/sync/sync';
import { useTheme } from '../../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../../core/theme/typography';
import { addDays, dateKey, formatLong, formatShort, relativeDay } from '../../lib/dates';
import { GOALS } from '../../lib/goals';
import { displayWeight, weightUnit } from '../../lib/units';
import { MacroInline, MacroSummary } from '../../modules/food/components';
import { sumMacros } from '../../modules/food/parse';
import { HabitsCard } from '../../modules/habits/HabitsCard';
import { ElapsedText } from '../../modules/workouts/components';
import { activeWorkout, listWorkouts, overloadSummary, routinesForWeekday, startWorkout, trainingStats } from '../../modules/workouts/repo';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { ProgressBar } from '../../ui/ProgressBar';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { WeightChart } from '../../ui/WeightChart';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function SyncBadge() {
  const { colors } = useTheme();
  const session = useAuth((s) => s.session);
  const status = useSync((s) => s.status);
  if (!session) return null;
  const offline = status === 'offline' || status === 'error';
  return (
    <View style={[styles.syncBadge, { backgroundColor: colors.fill }]}>
      <Icon name={offline ? 'cloudOff' : 'cloud'} size={16} color={offline ? colors.warning : colors.textSecondary} />
    </View>
  );
}

export default function Today() {
  const router = useRouter();
  const { colors } = useTheme();
  const units = useSettings((s) => s.units);
  const waterGoal = useSettings((s) => s.waterGoalMl);
  const foodOn = useFeature('food');
  const waterOn = useFeature('water');
  const predictionsOn = useFeature('predictions');
  const trainOn = useFeature('workouts');
  const habitsOn = useFeature('habits');
  const active = useQuery(['workouts'], activeWorkout);
  const lastWorkout = useQuery(['workouts', 'workout_sets'], () => listWorkouts(1)[0] ?? null);
  const todayDay = useQuery(['routines', 'routine_items', 'splits'], () => routinesForWeekday(new Date().getDay()).find((r) => r.items.length > 0) ?? null);
  const weekTraining = useQuery(['workouts', 'workout_sets'], () => trainingStats(addDays(dateKey(), -6)));
  const overloadRows = useQuery(['workouts', 'workout_sets'], () => overloadSummary(addDays(dateKey(), -56)));
  const overloadTotal = overloadRows.filter((o) => o.status !== 'new').length;
  const overloadUp = overloadRows.filter((o) => o.status === 'progressing').length;
  const today = dateKey();

  const body = useBody();
  const log = useQuery(['log_entries'], () => listLog(today), [today]);
  const water = useQuery(['water_entries'], () => waterTotal(today), [today]);
  const eaten = useMemo(() => sumMacros(log), [log]);

  const { phase, targets, currentKg, weeklyChange, trend, progress, etaDate, aheadKg, phaseEnded, dayType } = body;
  const goalDef = phase ? GOALS[phase.goalType] : null;
  const wu = weightUnit(units);

  const recentStart = addDays(today, -30);
  const lastWeighIn = trend.filter((t) => t.kg != null).pop();
  const weighedToday = lastWeighIn?.date === today;

  const todayOrder = useSettings((st) => st.todayOrder);
  const todayHidden = useSettings((st) => st.todayHidden);
  const visibleCards = orderedTodayCards(todayOrder).filter((id) => !todayHidden.includes(id));
  const idx = (id: TodayCardId) => visibleCards.indexOf(id);

  const blocks: Record<TodayCardId, ReactNode> = {
    macros: foodOn && targets ? (
        <Card index={idx('macros')} onPress={() => router.navigate('/(tabs)/food')}>
          <MacroSummary eaten={eaten} targets={targets} />
          {dayType && (
            <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.md }}>
              {dayType === 'training' ? 'Training day · extra carbs today' : 'Rest day · fewer carbs today'}
            </Text>
          )}
        </Card>
    ) : null,
    logPrompt: foodOn ? (
        <Card index={idx('logPrompt')} padded={false}>
          <PressableScale onPress={() => router.push('/log-food')} feedback="light" scaleTo={0.985} style={styles.logPrompt}>
            <View style={[styles.logIcon, { backgroundColor: colors.accentSoft }]}>
              <Icon name="sparkles" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="headline">What did you eat?</Text>
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                “2 rotis, 1 katori dal and 150g paneer”
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.textTertiary} />
          </PressableScale>
          {log.length > 0 && (
            <View style={[styles.meals, { borderTopColor: colors.separator }]}>
              {MEAL_SLOTS.map((slot) => {
                const entries = log.filter((e) => e.mealSlot === slot.id);
                if (entries.length === 0) return null;
                const totals = sumMacros(entries);
                return (
                  <View key={slot.id} style={styles.mealRow}>
                    <View style={{ flex: 1 }}>
                      <Text variant="subhead" weight="semibold">
                        {slot.title}
                      </Text>
                      <Text variant="footnote" tone="secondary" numberOfLines={1}>
                        {entries.map((e) => e.name).join(', ')}
                      </Text>
                    </View>
                    <MacroInline macros={totals} showKcal={false} />
                    <Text variant="subhead" weight="semibold" tabular style={{ minWidth: 56, textAlign: 'right' }}>
                      {Math.round(totals.kcal)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </Card>
    ) : null,
    weight: currentKg != null ? (
        <Card index={idx('weight')} onPress={() => router.navigate('/(tabs)/progress')}>
          <View style={styles.weightHeader}>
            <View style={{ flex: 1 }}>
              <Text variant="footnote" tone="secondary" weight="medium">
                Trend weight
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
                <Text variant="title1" tabular>
                  {displayWeight(currentKg, units)}
                </Text>
                <Text variant="callout" tone="secondary" style={{ marginBottom: 4 }}>
                  {wu}
                </Text>
              </View>
              <Text variant="footnote" tone="secondary" tabular>
                {weeklyChange == null
                  ? 'Weigh in daily to see your weekly rate'
                  : `${weeklyChange > 0 ? '+' : weeklyChange < 0 ? '−' : ''}${displayWeight(Math.abs(weeklyChange), units, 2)} ${wu} per week`}
              </Text>
            </View>
            <Button
              title={weighedToday ? 'Logged' : 'Weigh in'}
              icon={weighedToday ? 'check' : 'scale'}
              size="sm"
              variant={weighedToday ? 'gray' : 'tinted'}
              full={false}
              onPress={() => router.push('/log-weight')}
            />
          </View>
          {trend.length > 1 && (
            <View>
              <WeightChart
                compact
                height={72}
                trend={trend}
                startDate={recentStart < trend[0].date ? trend[0].date : recentStart}
                endDate={today}
                units={units}
              />
            </View>
          )}
          {predictionsOn && phase && goalDef && goalDef.direction !== 0 && phase.targetKg != null && progress != null && (
            <View style={{ marginTop: SPACE.lg, gap: SPACE.sm }}>
              <View style={styles.goalRow}>
                <Text variant="footnote" tone="secondary">
                  {`${goalDef.title} · ${displayWeight(phase.startKg, units)} → ${displayWeight(phase.targetKg, units)} ${wu}`}
                </Text>
                <Text variant="footnote" weight="semibold" tabular>{`${Math.round(progress * 100)}%`}</Text>
              </View>
              <ProgressBar progress={progress} height={6} />
              <Text variant="footnote" tone="secondary">
                {progress >= 1
                  ? 'Goal reached. Choose your next phase in You → Goal.'
                  : etaDate
                    ? `On pace for ${formatLong(etaDate)}${aheadKg != null && Math.abs(aheadKg) >= 0.3 ? ` · ${displayWeight(Math.abs(aheadKg), units)} ${wu} ${aheadKg > 0 ? 'ahead' : 'behind'}` : ''}`
                    : 'Keep logging to estimate your goal date'}
              </Text>
            </View>
          )}
        </Card>
    ) : null,
    habits: habitsOn ? (
      <HabitsCard index={idx('habits')} />
    ) : null,
    training: trainOn ? (
        <Card index={idx('training')}>
          <View style={styles.weightHeader}>
            <View style={[styles.logIcon, { backgroundColor: active ? colors.accent : colors.fill }]}>
              <Icon name="dumbbell" size={20} color={active ? colors.onAccent : colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="footnote" tone="secondary">
                {active ? 'In progress' : todayDay ? 'Today' : 'Training'}
              </Text>
              <Text variant="headline" numberOfLines={1}>
                {active ? active.name : todayDay ? todayDay.name : lastWorkout ? `Last: ${lastWorkout.name}` : 'No workouts yet'}
              </Text>
              {active ? (
                <ElapsedText since={active.startedAt} variant="footnote" color={colors.textSecondary} />
              ) : (
                !todayDay &&
                lastWorkout && (
                  <Text variant="footnote" tone="secondary" numberOfLines={1}>
                    {relativeDay(lastWorkout.dateKey)}
                  </Text>
                )
              )}
            </View>
            {!active && (
              <PressableScale feedback="selection" onPress={() => router.push('/quick-workout')} style={[styles.round, { backgroundColor: colors.fill }]}>
                <Icon name="check" size={18} color={colors.text} />
              </PressableScale>
            )}
            <Button
              title={active ? 'Resume' : 'Start'}
              icon="play"
              size="sm"
              variant={active ? 'filled' : 'tinted'}
              full={false}
              onPress={() => {
                startWorkout({ routineId: todayDay?.id });
                router.push('/workout');
              }}
            />
          </View>
          <View style={[styles.trainStats, { borderTopColor: colors.separator }]}>
            <View style={styles.trainStat}>
              <Text variant="headline" tabular>
                {weekTraining.workouts}
              </Text>
              <Text variant="caption" tone="secondary">
                this week
              </Text>
            </View>
            <View style={styles.trainStat}>
              <Text variant="headline" tabular>
                {weekTraining.kcal.toLocaleString('en-US')}
              </Text>
              <Text variant="caption" tone="secondary">
                kcal burned
              </Text>
            </View>
            <View style={styles.trainStat}>
              <Text variant="headline" tabular color={overloadUp > 0 ? colors.success : colors.text}>
                {overloadTotal ? `${overloadUp}/${overloadTotal}` : '—'}
              </Text>
              <Text variant="caption" tone="secondary">
                lifts up
              </Text>
            </View>
          </View>
        </Card>
    ) : null,
    water: waterOn ? (
        <Card index={idx('water')}>
          <View style={styles.weightHeader}>
            <View style={[styles.logIcon, { backgroundColor: colors.fill }]}>
              <Icon name="droplet" size={20} color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="headline" tabular>{`${(water / 1000).toFixed(2)} L`}</Text>
              <Text variant="footnote" tone="secondary">{`of ${(waterGoal / 1000).toFixed(1)} L`}</Text>
            </View>
            <PressableScale feedback="light" onPress={() => undoLastWater(today)} disabled={water <= 0} style={[styles.round, { backgroundColor: colors.fill }]}>
              <Icon name="minus" size={18} color={colors.text} />
            </PressableScale>
            <PressableScale feedback="light" onPress={() => addWater(today, 250)} style={[styles.round, { backgroundColor: colors.accent }]}>
              <Icon name="plus" size={18} color={colors.onAccent} strokeWidth={2.6} />
            </PressableScale>
          </View>
          <View>
            <ProgressBar progress={water / waterGoal} color={colors.text} height={5} />
          </View>
        </Card>
    ) : null,
  };

  return (
    <Screen title="Today" subtitle={`${greeting()} · ${formatShort(today)}`} tabBar accessory={<SyncBadge />}>
      {phaseEnded && phase && (
        <Card index={0} style={{ marginBottom: SPACE.md, borderColor: colors.accent, borderWidth: 1.5 }} onPress={() => router.push('/goal')}>
          <Text variant="headline">{`${GOALS[phase.goalType].title} complete`}</Text>
          <Text variant="subhead" tone="secondary" style={{ marginTop: 2 }}>
            {phase.goalType === 'diet_break' ? 'Ready to get back to your plan? Tap to choose your next phase.' : 'Tap to choose your next phase.'}
          </Text>
        </Card>
      )}

      {visibleCards
        .filter((id) => blocks[id])
        .map((id, i) => (
          <View key={id} style={i > 0 && { marginTop: SPACE.md }}>
            {blocks[id]}
          </View>
        ))}

      {!phase && (
        <Card index={visibleCards.length} style={{ marginTop: SPACE.md }}>
          <Text variant="headline">Set a goal</Text>
          <Text variant="subhead" tone="secondary" style={{ marginVertical: SPACE.sm }}>
            Choose cut, bulk, recomp or maintain to get calorie targets.
          </Text>
          <Button title="Choose goal" size="md" onPress={() => router.push('/goal')} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  syncBadge: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  logPrompt: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.lg },
  logIcon: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  meals: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.sm },
  weightHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  trainStats: { flexDirection: 'row', marginTop: SPACE.md, paddingTop: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth },
  trainStat: { flex: 1, alignItems: 'center', gap: 2 },
  round: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
