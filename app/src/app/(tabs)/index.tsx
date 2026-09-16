import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useBody } from '../../core/goals/useBody';
import { addWater, listLog, MEAL_SLOTS, undoLastWater, waterTotal } from '../../core/db/repo';
import { useQuery } from '../../core/db/useQuery';
import { useFeature, useSettings } from '../../core/store/settings';
import { useAuth } from '../../core/auth/auth';
import { useSync } from '../../core/sync/sync';
import { useTheme } from '../../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../../core/theme/typography';
import { addDays, dateKey, formatLong, formatShort, relativeDay } from '../../lib/dates';
import { GOALS } from '../../lib/goals';
import { displayWeight, weightUnit } from '../../lib/units';
import { MacroInline, MacroSummary } from '../../modules/food/components';
import { sumMacros } from '../../modules/food/parse';
import { ElapsedText } from '../../modules/workouts/components';
import { activeWorkout, listWorkouts, startWorkout } from '../../modules/workouts/repo';
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
  const active = useQuery(['workouts'], activeWorkout);
  const lastWorkout = useQuery(['workouts', 'workout_sets'], () => listWorkouts(1)[0] ?? null);
  const today = dateKey();

  const body = useBody();
  const log = useQuery(['log_entries'], () => listLog(today), [today]);
  const water = useQuery(['water_entries'], () => waterTotal(today), [today]);
  const eaten = useMemo(() => sumMacros(log), [log]);

  const { phase, targets, currentKg, weeklyChange, trend, progress, etaDate, aheadKg } = body;
  const goalDef = phase ? GOALS[phase.goalType] : null;
  const wu = weightUnit(units);

  const recentStart = addDays(today, -30);
  const lastWeighIn = trend.filter((t) => t.kg != null).pop();
  const weighedToday = lastWeighIn?.date === today;

  let cardIndex = 0;

  return (
    <Screen title="Today" subtitle={`${greeting()} · ${formatShort(today)}`} tabBar accessory={<SyncBadge />}>
      {foodOn && targets && (
        <Card index={cardIndex++} onPress={() => router.navigate('/(tabs)/food')}>
          <MacroSummary eaten={eaten} targets={targets} />
        </Card>
      )}

      {foodOn && (
        <Card index={cardIndex++} style={{ marginTop: SPACE.md }} padded={false}>
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
      )}

      {currentKg != null && (
        <Card index={cardIndex++} style={{ marginTop: SPACE.md }} onPress={() => router.navigate('/(tabs)/progress')}>
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
            <View style={{ marginTop: SPACE.md }}>
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
      )}

      {trainOn && (
        <Card index={cardIndex++} style={{ marginTop: SPACE.md }}>
          <View style={styles.weightHeader}>
            <View style={[styles.logIcon, { backgroundColor: active ? colors.accent : colors.fill }]}>
              <Icon name="dumbbell" size={20} color={active ? colors.onAccent : colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="headline" numberOfLines={1}>
                {active ? active.name : 'Training'}
              </Text>
              {active ? (
                <ElapsedText since={active.startedAt} variant="footnote" color={colors.textSecondary} />
              ) : (
                <Text variant="footnote" tone="secondary" numberOfLines={1}>
                  {lastWorkout ? `Last: ${lastWorkout.name} · ${relativeDay(lastWorkout.dateKey)}` : 'No workouts logged yet'}
                </Text>
              )}
            </View>
            <Button
              title={active ? 'Resume' : 'Start'}
              icon={active ? 'play' : 'plus'}
              size="sm"
              variant={active ? 'filled' : 'tinted'}
              full={false}
              onPress={() => {
                startWorkout();
                router.push('/workout');
              }}
            />
          </View>
        </Card>
      )}

      {waterOn && (
        <Card index={cardIndex++} style={{ marginTop: SPACE.md }}>
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
          <View style={{ marginTop: SPACE.md }}>
            <ProgressBar progress={water / waterGoal} color={colors.text} height={5} />
          </View>
        </Card>
      )}

      {!phase && (
        <Card index={cardIndex++} style={{ marginTop: SPACE.md }}>
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
  round: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
