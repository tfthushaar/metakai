import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useBody } from '../core/goals/useBody';
import { getDb } from '../core/db/database';
import { dailyTotals, updatePhase } from '../core/db/repo';
import { useQuery } from '../core/db/useQuery';
import { useFeature, useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { weeklyCheckin, type Checkin, type Verdict } from '../lib/checkin';
import { ageFromBirthDate } from '../lib/energy';
import { addDays, dateKey, formatShort } from '../lib/dates';
import { GOALS } from '../lib/goals';
import { HARD_MIN_KCAL } from '../lib/targets';
import { displayWeight, weightUnit } from '../lib/units';
import { CoachCard } from '../modules/coach/CoachCard';
import { Button } from '../ui/Button';
import { Card, SectionHeader } from '../ui/Card';
import { haptic } from '../ui/haptics';
import { Icon, type IconName } from '../ui/Icon';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

const VERDICT_ICON: Record<Verdict, IconName> = {
  on_track: 'check',
  holding: 'check',
  too_slow: 'activity',
  too_fast: 'warning',
  wrong_direction: 'warning',
  drifting: 'activity',
  not_enough_data: 'info',
};

function workoutsBetween(from: string, to: string): number {
  return (
    getDb().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM workouts WHERE deleted_at IS NULL AND ended_at IS NOT NULL AND date_key >= ? AND date_key <= ?', [from, to])?.n ?? 0
  );
}

function plannedWorkouts(): number {
  const rows = getDb().getAllSync<{ weekdays: string }>("SELECT weekdays FROM routines WHERE deleted_at IS NULL AND weekdays != '[]'");
  const days = new Set<number>();
  rows.forEach((r) => (JSON.parse(r.weekdays) as number[]).forEach((d) => days.add(d)));
  return days.size;
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <View style={styles.metric}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <Text variant="headline" tabular>
        {value}
      </Text>
      {detail && (
        <Text variant="caption" tone="tertiary">
          {detail}
        </Text>
      )}
    </View>
  );
}

export default function CheckinScreen() {
  const { colors } = useTheme();
  const units = useSettings((s) => s.units);
  const adaptiveOn = useSettings((s) => s.adaptiveTargets);
  const coachOn = useFeature('coach');
  const { profile, phase, trend, targets, currentKg, adaptive, plannedWeeklyKg } = useBody();
  const today = dateKey();
  const from = addDays(today, -35);
  const totals = useQuery(['log_entries'], () => dailyTotals(from), [from]);
  const workoutsData = useQuery(['workouts', 'routines'], () => ({
    planned: plannedWorkouts(),
    weeks: [0, 1, 2, 3].map((w) => workoutsBetween(addDays(today, -6 - w * 7), addDays(today, -w * 7))),
  }));

  const checkins = useMemo<Checkin[]>(() => {
    if (!phase || !targets || currentKg == null || plannedWeeklyKg == null) return [];
    return [0, 1, 2, 3].map((w) =>
      weeklyCheckin({
        weekEnd: addDays(today, -w * 7),
        intake: totals.map((d) => ({ date: d.dateKey, kcal: d.kcal })),
        trend,
        targetKcal: targets.kcal,
        targetProtein: targets.protein,
        proteinByDay: totals.map((d) => ({ date: d.dateKey, protein: d.protein })),
        plannedWeeklyKg,
        workouts: workoutsData.weeks[w],
        plannedWorkouts: workoutsData.planned,
      }),
    );
  }, [phase, targets, currentKg, plannedWeeklyKg, totals, trend, today, workoutsData]);

  if (!phase || !targets || checkins.length === 0) {
    return (
      <Screen title="Check-in" back>
        <Text tone="secondary">Set a goal to get weekly check-ins.</Text>
      </Screen>
    );
  }

  const [current, ...previous] = checkins;
  const wu = weightUnit(units);
  const tone = current.verdict === 'on_track' || current.verdict === 'holding' ? colors.success : current.verdict === 'not_enough_data' ? colors.textSecondary : colors.warning;

  const apply = () => {
    const kcal = targets.kcal + current.kcalAdjustment;
    updatePhase(phase.id, { overrides: { ...phase.overrides, kcal } });
    haptic.success();
    toast(`Calories set to ${kcal}`);
  };

  return (
    <Screen title="Check-in" subtitle={`${formatShort(current.weekStart)} – ${formatShort(current.weekEnd)} · ${GOALS[phase.goalType].title}`} back>
      <Card index={0}>
        <View style={styles.verdict}>
          <View style={[styles.verdictIcon, { backgroundColor: tone }]}>
            <Icon name={VERDICT_ICON[current.verdict]} size={20} color="#FFFFFF" strokeWidth={2.6} />
          </View>
          <Text variant="title2" style={{ flex: 1 }}>
            {current.headline}
          </Text>
        </View>
        {current.suggestion && (
          <Text variant="callout" tone="secondary" style={{ marginTop: SPACE.md }}>
            {current.suggestion}
          </Text>
        )}
        {current.kcalAdjustment !== 0 && (
          <View style={{ marginTop: SPACE.lg }}>
            {adaptiveOn && adaptive?.applied ? (
              <Text variant="footnote" tone="secondary">
                Adaptive maintenance is on, so your targets already adjust from your data.
              </Text>
            ) : (
              <Button title={`Apply ${current.kcalAdjustment > 0 ? '+' : ''}${current.kcalAdjustment} kcal`} size="md" onPress={apply} />
            )}
          </View>
        )}
      </Card>

      <Card index={1} style={{ marginTop: SPACE.md }}>
        <View style={styles.metrics}>
          <Metric
            label="Weight trend"
            value={current.weeklyChangeKg == null ? '—' : `${current.weeklyChangeKg > 0 ? '+' : current.weeklyChangeKg < 0 ? '−' : ''}${displayWeight(Math.abs(current.weeklyChangeKg), units, 2)} ${wu}`}
            detail={current.plannedWeeklyKg !== 0 ? `plan ${current.plannedWeeklyKg > 0 ? '+' : '−'}${displayWeight(Math.abs(current.plannedWeeklyKg), units, 2)}` : 'per week'}
          />
          <Metric label="Avg calories" value={current.avgKcal == null ? '—' : Math.round(current.avgKcal).toLocaleString('en-US')} detail={`target ${targets.kcal}`} />
        </View>
        <View style={[styles.metrics, styles.metricsBorder, { borderTopColor: colors.separator }]}>
          <Metric label="Days logged" value={`${current.daysLogged} / 7`} detail={current.kcalAdherence != null ? `${Math.round(current.kcalAdherence * 7)} on target` : undefined} />
          <Metric label="Protein hit" value={`${current.proteinDaysHit} / 7`} detail={`${targets.protein} g goal`} />
          <Metric label="Workouts" value={current.plannedWorkouts ? `${current.workouts} / ${current.plannedWorkouts}` : String(current.workouts)} />
        </View>
      </Card>

      {coachOn && profile && currentKg != null && (
        <CoachCard
          input={{
            goal: GOALS[phase.goalType].title,
            sex: profile.sex,
            age: ageFromBirthDate(profile.birthDate),
            experience: profile.experience,
            weightKg: currentKg,
            targetKcal: targets.kcal,
            targetProtein: targets.protein,
            minimumKcal: HARD_MIN_KCAL[profile.sex],
            maintenanceKcal: adaptive?.tdee ?? null,
            weeks: checkins,
          }}
        />
      )}

      {adaptive && (
        <Card index={2} style={{ marginTop: SPACE.md }}>
          <Text variant="headline">Measured maintenance</Text>
          <Text variant="title1" tabular>{`${adaptive.tdee.toLocaleString('en-US')} kcal`}</Text>
          <Text variant="footnote" tone="secondary">
            {`From ${adaptive.daysUsed} logged days and your weight trend${adaptive.applied ? '. Used for your targets.' : '. Turn on adaptive maintenance in Targets to use it.'}`}
          </Text>
        </Card>
      )}

      <SectionHeader title="Earlier weeks" />
      <Card padded={false}>
        {previous.map((c, i) => (
          <View key={c.weekEnd} style={[styles.historyRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}>
            <View style={{ flex: 1 }}>
              <Text variant="body">{`${formatShort(c.weekStart)} – ${formatShort(c.weekEnd)}`}</Text>
              <Text variant="footnote" tone="secondary">
                {c.headline}
              </Text>
            </View>
            <Text variant="subhead" tabular>
              {c.weeklyChangeKg == null ? '—' : `${c.weeklyChangeKg > 0 ? '+' : c.weeklyChangeKg < 0 ? '−' : ''}${displayWeight(Math.abs(c.weeklyChangeKg), units, 2)}`}
            </Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  verdict: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  verdictIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  metrics: { flexDirection: 'row', gap: SPACE.md },
  metricsBorder: { marginTop: SPACE.md, paddingTop: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth },
  metric: { flex: 1, gap: 2 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderRadius: RADIUS.sm },
});
