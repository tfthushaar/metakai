import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { bodyInput, useBody } from '../core/goals/useBody';
import { startPhase, updatePhase } from '../core/db/repo';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { addDays, dateKey, formatLong } from '../lib/dates';
import { CORE_GOALS, GOALS, type GoalType } from '../lib/goals';
import { predict } from '../lib/prediction';
import { computeTargets, lowCalorieNotice, weeklyChangeAt, withCustomCalories } from '../lib/targets';
import { displayWeight, kgToLb, lbToKg, weightUnit } from '../lib/units';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { ListGroup, ListRow } from '../ui/List';
import { RulerPicker } from '../ui/RulerPicker';
import { Screen } from '../ui/Screen';
import { SegmentedControl } from '../ui/SegmentedControl';
import { NumberPrompt } from '../ui/NumberPrompt';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

const RATE_STEPS: Record<string, number[]> = {
  '-1': [0.25, 0.5, 0.75, 1.0, 1.25],
  '1': [0.1, 0.15, 0.25, 0.35, 0.5, 0.75, 1.0],
};

const PHASE_GOALS: GoalType[] = ['mini_cut', 'diet_break', 'reverse', 'strength', 'event_prep'];
const DIET_BREAK_DAYS = [7, 14];
const MINI_CUT_WEEKS = [2, 4, 6];
const EVENT_WEEKS = [4, 8, 12, 16, 20, 24];
const REVERSE_STEPS = [50, 100, 150];
/** Goals whose calories follow fixed rules (a date, weekly steps or maintenance). */
const FIXED_CALORIE_GOALS: GoalType[] = ['event_prep', 'reverse', 'diet_break'];

type Mode = 'pace' | 'calories';

export default function Goal() {
  const router = useRouter();
  const { colors } = useTheme();
  const units = useSettings((s) => s.units);
  const pregnant = useSettings((s) => s.pregnant);
  const { profile, phase, currentKg, targets, adaptive } = useBody();
  const [width, setWidth] = useState(0);
  const [kcalWidth, setKcalWidth] = useState(0);
  const [goal, setGoal] = useState<GoalType>(phase?.goalType ?? 'cut');
  const def = GOALS[goal];
  const weight = currentKg ?? phase?.startKg ?? 75;
  const sameGoal = phase?.goalType === goal;
  const [targetKg, setTargetKg] = useState<number>(sameGoal && phase?.targetKg != null ? phase.targetKg : Math.round(weight * (def.direction < 0 ? 0.92 : 1.05)));
  const [rate, setRate] = useState<number>(sameGoal && phase ? phase.ratePctWeek : def.defaultRate);
  const [breakDays, setBreakDays] = useState(14);
  const [miniWeeks, setMiniWeeks] = useState(4);
  const [eventWeeks, setEventWeeks] = useState(12);
  const [reverseStep, setReverseStep] = useState(phase?.overrides.reverseStepKcal ?? 100);
  const [mode, setMode] = useState<Mode>(phase?.overrides.kcal != null ? 'calories' : 'pace');
  const [typing, setTyping] = useState<'target' | 'calories' | null>(null);
  const [customKcal, setCustomKcal] = useState(phase?.overrides.kcal ?? targets?.kcal ?? 2000);

  const choose = (g: GoalType) => {
    haptic.selection();
    const d = GOALS[g];
    setGoal(g);
    if (phase?.goalType === g) {
      setTargetKg(phase.targetKg ?? weight);
      setRate(phase.ratePctWeek);
      setMode(phase.overrides.kcal != null ? 'calories' : 'pace');
    } else {
      setRate(d.defaultRate);
      if (d.direction !== 0) setTargetKg(Math.round(weight * (d.direction < 0 ? (g === 'mini_cut' ? 0.96 : 0.92) : 1.05)));
    }
  };

  // Event prep derives its rate from the date and target.
  const eventRate = goal === 'event_prep' && targetKg < weight ? Math.round(((weight - targetKg) / weight / eventWeeks) * 10000) / 100 : 0;
  const effectiveRate = def.direction === 0 ? 0 : goal === 'event_prep' ? eventRate : rate;
  const endDate =
    goal === 'diet_break' ? addDays(dateKey(), breakDays) : goal === 'mini_cut' ? addDays(dateKey(), miniWeeks * 7) : goal === 'event_prep' ? addDays(dateKey(), eventWeeks * 7) : null;

  const byCalories = mode === 'calories' && !FIXED_CALORIE_GOALS.includes(goal);
  const adaptiveTdee = adaptive?.applied ? adaptive.tdee : null;

  const preview = useMemo(() => {
    if (!profile) return null;
    const input = {
      ...bodyInput(profile, weight),
      goal,
      ratePctWeek: effectiveRate,
      adaptiveTdee,
      reverse: goal === 'reverse' && targets ? { startKcal: targets.kcal, stepKcal: reverseStep, weeksElapsed: 0 } : null,
    };
    const paced = computeTargets(input);
    const t = byCalories ? withCustomCalories(paced, input, customKcal) : paced;
    const p = predict({ ...input, startDate: dateKey(), targetKg: def.direction !== 0 ? targetKg : null, intakeKcal: t.kcal, maxWeeks: 156 });
    return { targets: t, paced, eta: p.etaDate, weeklyKg: weeklyChangeAt(t.kcal, paced.tdee) };
  }, [profile, weight, goal, effectiveRate, adaptiveTdee, targetKg, def.direction, reverseStep, targets, pregnant, byCalories, customKcal]);

  const switchMode = (m: Mode) => {
    // Start the ruler from the calories the current pace gives.
    if (m === 'calories' && mode === 'pace' && preview) setCustomKcal(preview.paced.kcal);
    setMode(m);
  };

  const invalid = def.direction < 0 ? targetKg >= weight : def.direction > 0 ? targetKg <= weight : false;
  const changedOnlySettings = sameGoal && phase && !['diet_break', 'mini_cut', 'event_prep', 'reverse'].includes(goal);

  const save = () => {
    if (!profile || !preview) return;
    const notice = byCalories && !useSettings.getState().lowCalorieNoticeShown ? lowCalorieNotice(bodyInput(profile, weight), preview.paced.tdee, customKcal) : null;
    if (notice) {
      useSettings.getState().set({ lowCalorieNoticeShown: true });
      Alert.alert('Very low calories', notice, [{ text: 'OK', onPress: commit }], { cancelable: false });
      return;
    }
    commit();
  };

  const commit = () => {
    if (!profile) return;
    const target = def.direction !== 0 ? targetKg : null;
    const kcal = byCalories ? customKcal : undefined;
    if (changedOnlySettings) {
      const { kcal: _previous, ...rest } = phase!.overrides;
      updatePhase(phase!.id, { targetKg: target, ratePctWeek: effectiveRate, overrides: kcal != null ? { ...rest, kcal } : rest });
      toast('Goal updated');
    } else {
      const overrides = {
        ...(goal === 'reverse' && targets ? { reverseStartKcal: targets.kcal, reverseStepKcal: reverseStep } : {}),
        ...(kcal != null ? { kcal } : {}),
      };
      startPhase({ goalType: goal, startDate: dateKey(), endDate, startKg: weight, targetKg: target, ratePctWeek: effectiveRate, overrides });
      toast(`${def.title} started`);
    }
    haptic.success();
    router.back();
  };

  const toDisplay = (kg: number) => Math.round((units === 'metric' ? kg : kgToLb(kg)) * 10) / 10;
  const steps = (RATE_STEPS[String(def.direction)] ?? []).filter((r) => r >= def.minRate && r <= def.maxRate);

  const goalRow = (g: GoalType) => (
    <ListRow key={g} title={GOALS[g].title} subtitle={GOALS[g].tagline} selected={goal === g} onPress={() => choose(g)} chevron={false} />
  );

  return (
    <Screen title="Goal" back>
      <ListGroup header="Main goals" footer={phase && !sameGoal ? 'Switching goal starts a new phase from your current trend weight. Your history is kept.' : undefined}>
        {CORE_GOALS.map((g) => goalRow(g.type))}
      </ListGroup>
      <ListGroup header="Phases">{PHASE_GOALS.map(goalRow)}</ListGroup>

      {def.direction !== 0 && (
        <Card style={{ marginTop: SPACE.xl }}>
          <Text variant="footnote" tone="secondary">
            Target weight
          </Text>
          <PressableScale scaleTo={0.99} feedback="selection" onPress={() => setTyping('target')} style={styles.editRow}>
            <Text variant="largeTitle" tabular>{`${toDisplay(targetKg).toFixed(1)} ${weightUnit(units)}`}</Text>
            <Icon name="pencil" size={16} color={colors.textTertiary} />
          </PressableScale>
          <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ marginTop: SPACE.md }}>
            <RulerPicker
              key={`${goal}-${width}`}
              width={width}
              min={units === 'metric' ? 30 : 66}
              max={units === 'metric' ? 250 : 550}
              step={units === 'metric' ? 0.1 : 0.2}
              majorEvery={units === 'metric' ? 10 : 25}
              value={toDisplay(targetKg)}
              onChange={(v) => setTargetKg(units === 'metric' ? v : lbToKg(v))}
            />
          </View>
        </Card>
      )}

      {!FIXED_CALORIE_GOALS.includes(goal) && (
        <Card style={{ marginTop: SPACE.md }}>
          <SegmentedControl<Mode>
            value={mode}
            onChange={switchMode}
            segments={[
              { value: 'pace', label: def.direction === 0 ? 'Recommended' : 'Set pace' },
              { value: 'calories', label: 'Set calories' },
            ]}
          />
          {mode === 'calories' ? (
            <>
              <PressableScale scaleTo={0.99} feedback="selection" onPress={() => setTyping('calories')} style={[styles.editRow, { marginTop: SPACE.md }]}>
                <Text variant="largeTitle" tabular>{`${customKcal.toLocaleString('en-US')} kcal`}</Text>
                <Icon name="pencil" size={16} color={colors.textTertiary} />
              </PressableScale>
              <View onLayout={(e) => setKcalWidth(e.nativeEvent.layout.width)} style={{ marginTop: SPACE.sm }}>
                <RulerPicker key={`kcal-${kcalWidth}`} width={kcalWidth} min={0} max={6000} step={25} majorEvery={20} value={customKcal} onChange={setCustomKcal} />
              </View>
              {preview && (
                <Text variant="subhead" tone="secondary" tabular style={{ marginTop: SPACE.sm }}>
                  {def.direction === 0
                    ? `${preview.targets.kcal >= preview.paced.tdee ? '+' : '−'}${Math.abs(preview.targets.kcal - preview.paced.tdee)} kcal vs maintenance (${preview.paced.tdee.toLocaleString('en-US')})`
                    : `About ${preview.weeklyKg > 0 ? '+' : preview.weeklyKg < 0 ? '−' : ''}${displayWeight(Math.abs(preview.weeklyKg), units, 2)} ${weightUnit(units)} per week · maintenance ${preview.paced.tdee.toLocaleString('en-US')} kcal`}
                </Text>
              )}
            </>
          ) : def.direction !== 0 ? (
            <>
              <View style={styles.chips}>
                {steps.map((r) => (
                  <Chip key={r} label={`${r}%`} selected={Math.abs(r - rate) < 1e-6} onPress={() => setRate(r)} />
                ))}
              </View>
              <Text variant="subhead" tone="secondary" tabular>
                {`${def.direction < 0 ? '−' : '+'}${displayWeight((weight * rate) / 100, units, 2)} ${weightUnit(units)} per week`}
              </Text>
            </>
          ) : (
            <Text variant="subhead" tone="secondary" style={{ marginTop: SPACE.md }}>
              Calories follow your goal and update as your weight changes.
            </Text>
          )}
        </Card>
      )}

      {goal === 'event_prep' && (
        <Card style={{ marginTop: SPACE.md }}>
          <Text variant="footnote" tone="secondary">
            Weeks until the event
          </Text>
          <View style={styles.chips}>
            {EVENT_WEEKS.map((w) => (
              <Chip key={w} label={`${w}`} selected={eventWeeks === w} onPress={() => setEventWeeks(w)} />
            ))}
          </View>
          <Text variant="subhead" tone={eventRate > def.warnRate ? 'warning' : 'secondary'} tabular>
            {invalid ? 'Pick a target below your current weight' : `Event ${formatLong(endDate!)} · needs ${eventRate}% per week`}
          </Text>
        </Card>
      )}

      {goal === 'mini_cut' && (
        <Card style={{ marginTop: SPACE.md }}>
          <Text variant="footnote" tone="secondary">
            Length
          </Text>
          <View style={styles.chips}>
            {MINI_CUT_WEEKS.map((w) => (
              <Chip key={w} label={`${w} weeks`} selected={miniWeeks === w} onPress={() => setMiniWeeks(w)} />
            ))}
          </View>
          <Text variant="subhead" tone="secondary">
            {`Ends ${formatLong(endDate!)}. Then return to your bulk.`}
          </Text>
        </Card>
      )}

      {goal === 'diet_break' && (
        <Card style={{ marginTop: SPACE.xl }}>
          <Text variant="footnote" tone="secondary">
            Length
          </Text>
          <View style={styles.chips}>
            {DIET_BREAK_DAYS.map((d) => (
              <Chip key={d} label={`${d / 7} ${d === 7 ? 'week' : 'weeks'}`} selected={breakDays === d} onPress={() => setBreakDays(d)} />
            ))}
          </View>
          <Text variant="subhead" tone="secondary">
            {`Eat at maintenance until ${formatLong(endDate!)}. Expect a small, temporary rise in scale weight from water and food volume.`}
          </Text>
        </Card>
      )}

      {goal === 'reverse' && (
        <Card style={{ marginTop: SPACE.xl }}>
          <Text variant="footnote" tone="secondary">
            Weekly increase
          </Text>
          <View style={styles.chips}>
            {REVERSE_STEPS.map((k) => (
              <Chip key={k} label={`+${k} kcal`} selected={reverseStep === k} onPress={() => setReverseStep(k)} />
            ))}
          </View>
          <Text variant="subhead" tone="secondary">
            {targets ? `Starts at today’s ${targets.kcal} kcal and rises each week until maintenance.` : 'Rises each week until maintenance.'}
          </Text>
        </Card>
      )}

      {preview && (
        <Card style={{ marginTop: SPACE.md }}>
          <View style={styles.previewRow}>
            <View>
              <Text variant="footnote" tone="secondary">
                Daily calories
              </Text>
              <Text variant="title1" tabular>
                {preview.targets.kcal.toLocaleString('en-US')}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="footnote" tone="secondary">
                {def.direction === 0 ? 'Maintenance' : 'Goal date'}
              </Text>
              <Text variant="title3">
                {def.direction === 0 ? `${preview.targets.tdee} kcal` : invalid ? '—' : endDate && goal !== 'mini_cut' ? formatLong(endDate) : preview.eta ? formatLong(preview.eta) : '3+ years'}
              </Text>
            </View>
          </View>
          <View style={[styles.macros, { borderTopColor: colors.separator }]}>
            <Text variant="subhead" tabular>{`Protein ${preview.targets.protein} g`}</Text>
            <Text variant="subhead" tabular>{`Carbs ${preview.targets.carbs} g`}</Text>
            <Text variant="subhead" tabular>{`Fat ${preview.targets.fat} g`}</Text>
          </View>
          {[...preview.targets.warnings, ...(goal === 'event_prep' && eventRate > def.warnRate ? ['This deadline needs a fast cut. Consider a later date or a smaller target.'] : [])].map((w) => (
            <Text key={w} variant="footnote" tone="warning" style={{ marginTop: SPACE.sm }}>
              {w}
            </Text>
          ))}
        </Card>
      )}

      <NumberPrompt
        visible={typing != null}
        title={typing === 'calories' ? 'Daily calories' : 'Target weight'}
        unit={typing === 'calories' ? 'kcal' : weightUnit(units)}
        value={typing === 'calories' ? customKcal : toDisplay(targetKg)}
        decimals={typing === 'calories' ? 0 : 1}
        min={typing === 'calories' ? 0 : units === 'metric' ? 30 : 66}
        max={typing === 'calories' ? 12000 : units === 'metric' ? 250 : 550}
        onClose={() => setTyping(null)}
        onSubmit={(v) => (typing === 'calories' ? setCustomKcal(Math.round(v)) : setTargetKg(units === 'metric' ? v : lbToKg(v)))}
      />

      <View style={{ marginTop: SPACE.xl, gap: SPACE.sm }}>
        <Button title={changedOnlySettings ? 'Save changes' : `Start ${def.title.toLowerCase()}`} onPress={save} disabled={invalid || !profile} />
        <Button title="Plan my physique" variant="plain" icon="target" onPress={() => router.push('/physique')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  editRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginVertical: SPACE.md },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  macros: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.lg, paddingTop: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.sm },
});
