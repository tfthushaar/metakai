import { useRouter } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useBody } from '../../core/goals/useBody';
import { addWater, listLog, MEAL_SLOTS, undoLastWater, waterTotal } from '../../core/db/repo';
import { useQuery } from '../../core/db/useQuery';
import { useLayout } from '../../core/store/layouts';
import { useFeature, useSettings } from '../../core/store/settings';
import { useTheme } from '../../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../../core/theme/typography';
import { addDays, dateKey, formatShort } from '../../lib/dates';
import { GOALS } from '../../lib/goals';
import { displayWeight, weightUnit } from '../../lib/units';
import { MacroInline, MacroSummary } from '../../modules/food/components';
import { sumMacros } from '../../modules/food/parse';
import { HabitsCard } from '../../modules/habits/HabitsCard';
import { listSupplements, setTaken, takenOn } from '../../modules/health/repo';
import { RanksTodayCard } from '../../modules/ranks/RanksSummary';
import { readinessFor } from '../../modules/recovery/repo';
import { ElapsedText } from '../../modules/workouts/components';
import { activeWorkout, listWorkouts, routinesForWeekday, startWorkout } from '../../modules/workouts/repo';
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
  const recoveryOn = useFeature('recovery');
  const healthOn = useFeature('health');
  const active = useQuery(['workouts'], activeWorkout);
  const lastWorkout = useQuery(['workouts', 'workout_sets'], () => listWorkouts(1)[0] ?? null);
  const todayDay = useQuery(['routines', 'routine_items', 'splits'], () => routinesForWeekday(new Date().getDay()).find((r) => r.items.length > 0) ?? null);
  const today = dateKey();

  const body = useBody();
  const log = useQuery(['log_entries'], () => listLog(today), [today]);
  const water = useQuery(['water_entries'], () => waterTotal(today), [today]);
  const eaten = useMemo(() => sumMacros(log), [log]);
  const ready = useQuery(['recovery_checkins', 'workout_sets'], () => readinessFor(today), [today]);
  const supplements = useQuery(['supplements'], listSupplements);
  const taken = useQuery(['supplement_logs'], () => takenOn(today), [today]);

  const { phase, targets, currentKg, weeklyChange, trend, progress, etaDate, phaseEnded, dayType } = body;
  const goalDef = phase ? GOALS[phase.goalType] : null;
  const wu = weightUnit(units);

  const recentStart = addDays(today, -30);
  const lastWeighIn = trend.filter((t) => t.kg != null).pop();
  const weighedToday = lastWeighIn?.date === today;

  const visibleCards = useLayout('today');
  const idx = (id: string) => visibleCards.indexOf(id);

  const blocks: Record<string, ReactNode> = {
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
              {weeklyChange != null && (
                <Text variant="footnote" tone="secondary" tabular>
                  {`${weeklyChange > 0 ? '+' : weeklyChange < 0 ? '−' : ''}${displayWeight(Math.abs(weeklyChange), units, 2)} ${wu} per week`}
                </Text>
              )}
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
            <View style={{ marginTop: SPACE.md, gap: SPACE.sm }}>
              <View style={styles.goalRow}>
                <Text variant="footnote" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {`${goalDef.title} to ${displayWeight(phase.targetKg, units)} ${wu}${progress >= 1 ? ' · reached' : etaDate ? ` · ${formatShort(etaDate)}` : ''}`}
                </Text>
                <Text variant="footnote" weight="semibold" tabular>{`${Math.round(progress * 100)}%`}</Text>
              </View>
              <ProgressBar progress={progress} height={6} />
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
              <Text variant="headline" numberOfLines={1}>
                {active ? active.name : todayDay ? todayDay.name : 'Workout'}
              </Text>
              {active ? (
                <ElapsedText since={active.startedAt} variant="footnote" color={colors.textSecondary} />
              ) : (
                <Text variant="footnote" tone="secondary" numberOfLines={1}>
                  {todayDay ? 'Planned for today' : lastWorkout ? `Last: ${lastWorkout.name}` : 'No workouts yet'}
                </Text>
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
              style={{ alignSelf: 'center' }}
              onPress={() => {
                startWorkout({ routineId: todayDay?.id });
                router.push('/workout');
              }}
            />
          </View>
        </Card>
    ) : null,
    ranks: <RanksTodayCard index={idx('ranks')} />,
    readiness: recoveryOn ? (
        <Card index={idx('readiness')} onPress={() => router.push('/recovery')}>
          <View style={styles.weightHeader}>
            <View style={[styles.logIcon, { backgroundColor: colors.fill }]}>
              <Icon name="heartPulse" size={20} color={ready ? (ready.band === 'high' ? colors.success : ready.band === 'moderate' ? colors.warning : colors.danger) : colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="headline">{ready ? `Readiness ${ready.score}` : 'Readiness'}</Text>
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                {ready ? (ready.band === 'high' ? 'Ready to push' : ready.band === 'moderate' ? 'Train smart' : 'Take it easy') : 'Check in: how do you feel today?'}
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.textTertiary} />
          </View>
        </Card>
    ) : null,
    supplements: healthOn && supplements.length > 0 ? (
        <Card index={idx('supplements')}>
          <PressableScale scaleTo={0.99} onPress={() => router.push('/health')} style={[styles.weightHeader, { marginBottom: SPACE.md }]}>
            <View style={[styles.logIcon, { backgroundColor: colors.fill }]}>
              <Icon name="pill" size={20} color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="headline">Supplements</Text>
              <Text variant="footnote" tone="secondary">{`${supplements.filter((s) => taken.has(s.id)).length} of ${supplements.length} taken`}</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.textTertiary} />
          </PressableScale>
          <View style={styles.suppRow}>
            {supplements.map((s) => {
              const on = taken.has(s.id);
              return (
                <PressableScale
                  key={s.id}
                  feedback="selection"
                  scaleTo={0.95}
                  onPress={() => setTaken(s.id, today, !on)}
                  style={[styles.supp, { backgroundColor: on ? colors.accent : colors.fill }]}
                >
                  {on && <Icon name="check" size={14} color={colors.onAccent} strokeWidth={3} />}
                  <Text variant="subhead" weight="medium" color={on ? colors.onAccent : colors.text}>
                    {s.name}
                  </Text>
                </PressableScale>
              );
            })}
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
    <Screen title="Today" subtitle={`${greeting()} · ${formatShort(today)}`} tabBar>
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
  suppRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  supp: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: RADIUS.pill },
  round: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
