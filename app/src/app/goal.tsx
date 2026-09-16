import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { bodyInput, useBody } from '../core/goals/useBody';
import { startPhase, updatePhase } from '../core/db/repo';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { dateKey, formatLong } from '../lib/dates';
import { AVAILABLE_GOALS, GOALS, type GoalType } from '../lib/goals';
import { predict } from '../lib/prediction';
import { computeTargets } from '../lib/targets';
import { displayWeight, kgToLb, lbToKg, weightUnit } from '../lib/units';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { haptic } from '../ui/haptics';
import { ListGroup, ListRow } from '../ui/List';
import { RulerPicker } from '../ui/RulerPicker';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

const RATE_STEPS: Record<string, number[]> = {
  '-1': [0.25, 0.5, 0.75, 1.0, 1.25],
  '1': [0.1, 0.15, 0.25, 0.35, 0.5, 0.75, 1.0],
};

export default function Goal() {
  const router = useRouter();
  const { colors } = useTheme();
  const units = useSettings((s) => s.units);
  const { profile, phase, currentKg } = useBody();
  const [width, setWidth] = useState(0);
  const [goal, setGoal] = useState<GoalType>(phase?.goalType ?? 'cut');
  const def = GOALS[goal];
  const weight = currentKg ?? phase?.startKg ?? 75;
  const sameGoal = phase?.goalType === goal;
  const [targetKg, setTargetKg] = useState<number>(
    sameGoal && phase?.targetKg != null ? phase.targetKg : Math.round(weight * (def.direction < 0 ? 0.92 : 1.05)),
  );
  const [rate, setRate] = useState<number>(sameGoal && phase ? phase.ratePctWeek : def.defaultRate);

  const choose = (g: GoalType) => {
    haptic.selection();
    const d = GOALS[g];
    setGoal(g);
    if (phase?.goalType === g) {
      setTargetKg(phase.targetKg ?? weight);
      setRate(phase.ratePctWeek);
    } else {
      setRate(d.defaultRate);
      if (d.direction !== 0) setTargetKg(Math.round(weight * (d.direction < 0 ? 0.92 : 1.05)));
    }
  };

  const preview = useMemo(() => {
    if (!profile) return null;
    const t = computeTargets({ ...bodyInput(profile, weight), goal, ratePctWeek: def.direction === 0 ? 0 : rate });
    const p = predict({ ...bodyInput(profile, weight), goal, startDate: dateKey(), targetKg: def.direction !== 0 ? targetKg : null, intakeKcal: t.kcal, maxWeeks: 156 });
    return { targets: t, eta: p.etaDate };
  }, [profile, weight, goal, rate, targetKg, def.direction]);

  const invalid = def.direction < 0 ? targetKg >= weight : def.direction > 0 ? targetKg <= weight : false;
  const changedOnlySettings = sameGoal && phase;

  const save = () => {
    if (!profile) return;
    const ratePct = def.direction === 0 ? 0 : rate;
    const target = def.direction !== 0 ? targetKg : null;
    if (changedOnlySettings) {
      updatePhase(phase!.id, { targetKg: target, ratePctWeek: ratePct });
      toast('Goal updated');
    } else {
      startPhase({ goalType: goal, startDate: dateKey(), startKg: weight, targetKg: target, ratePctWeek: ratePct, overrides: {} });
      toast(`${def.title} started`);
    }
    haptic.success();
    router.back();
  };

  const toDisplay = (kg: number) => Math.round((units === 'metric' ? kg : kgToLb(kg)) * 10) / 10;
  const steps = RATE_STEPS[String(def.direction)] ?? [];

  return (
    <Screen title="Goal" back>
      <ListGroup header="Phase" footer={phase && !sameGoal ? 'Switching goal starts a new phase from your current trend weight. Your history is kept.' : undefined}>
        {AVAILABLE_GOALS.map((g) => (
          <ListRow key={g.type} title={g.title} subtitle={g.tagline} selected={goal === g.type} onPress={() => choose(g.type)} chevron={false} />
        ))}
      </ListGroup>

      {def.direction !== 0 && (
        <>
          <Card style={{ marginTop: SPACE.xl }}>
            <Text variant="footnote" tone="secondary">
              Target weight
            </Text>
            <Text variant="largeTitle" tabular>{`${toDisplay(targetKg).toFixed(1)} ${weightUnit(units)}`}</Text>
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

          <Card style={{ marginTop: SPACE.md }}>
            <Text variant="footnote" tone="secondary">
              Pace per week
            </Text>
            <View style={styles.rates}>
              {steps.map((r) => {
                const selected = Math.abs(r - rate) < 1e-6;
                const warn = r > def.warnRate;
                return (
                  <Button
                    key={r}
                    title={`${r}%`}
                    size="sm"
                    full={false}
                    variant={selected ? 'filled' : 'gray'}
                    onPress={() => setRate(r)}
                    style={warn && !selected ? { opacity: 0.7 } : undefined}
                  />
                );
              })}
            </View>
            <Text variant="subhead" tone="secondary" tabular>
              {`${def.direction < 0 ? '−' : '+'}${displayWeight((weight * rate) / 100, units, 2)} ${weightUnit(units)} per week`}
            </Text>
          </Card>
        </>
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
                {def.direction === 0 ? `${preview.targets.tdee} kcal` : invalid ? '—' : preview.eta ? formatLong(preview.eta) : '3+ years'}
              </Text>
            </View>
          </View>
          <View style={[styles.macros, { borderTopColor: colors.separator }]}>
            <Text variant="subhead" tabular>{`Protein ${preview.targets.protein} g`}</Text>
            <Text variant="subhead" tabular>{`Carbs ${preview.targets.carbs} g`}</Text>
            <Text variant="subhead" tabular>{`Fat ${preview.targets.fat} g`}</Text>
          </View>
          {preview.targets.warnings.map((w) => (
            <Text key={w} variant="footnote" tone="warning" style={{ marginTop: SPACE.sm }}>
              {w}
            </Text>
          ))}
          {invalid && (
            <Text variant="footnote" tone="warning" style={{ marginTop: SPACE.sm }}>
              {`Target must be ${def.direction < 0 ? 'below' : 'above'} your current weight.`}
            </Text>
          )}
        </Card>
      )}

      <View style={{ marginTop: SPACE.xl }}>
        <Button title={changedOnlySettings ? 'Save changes' : `Start ${def.title.toLowerCase()}`} onPress={save} disabled={invalid || !profile} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rates: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginVertical: SPACE.md },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  macros: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.lg, paddingTop: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.sm },
});
