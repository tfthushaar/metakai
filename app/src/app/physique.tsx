import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useBody } from '../core/goals/useBody';
import { useQuery } from '../core/db/useQuery';
import { startPhase } from '../core/db/repo';
import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { addDays, dateKey, formatShort } from '../lib/dates';
import { GOALS } from '../lib/goals';
import { planPhysique } from '../lib/physique';
import { displayWeight, weightUnit } from '../lib/units';
import { listBodyComp } from '../modules/body/repo';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

function Stepper({ label, value, onChange, step, format }: { label: string; value: number; onChange: (v: number) => void; step: number; format: (v: number) => string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stepperRow}>
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      <PressableScale feedback="selection" onPress={() => onChange(value - step)} style={[styles.stepButton, { backgroundColor: colors.fill }]}>
        <Icon name="minus" size={16} color={colors.text} />
      </PressableScale>
      <Text variant="headline" tabular style={{ minWidth: 86, textAlign: 'center' }}>
        {format(value)}
      </Text>
      <PressableScale feedback="selection" onPress={() => onChange(value + step)} style={[styles.stepButton, { backgroundColor: colors.fill }]}>
        <Icon name="plus" size={16} color={colors.text} />
      </PressableScale>
    </View>
  );
}

export default function Physique() {
  const router = useRouter();
  const { colors } = useTheme();
  const units = useSettings((s) => s.units);
  const { profile, currentKg } = useBody();
  const bodyComp = useQuery(['body_comp_entries'], listBodyComp);
  const measuredBf = bodyComp[bodyComp.length - 1]?.bfPct ?? profile?.bodyFatPct ?? null;
  const sex = profile?.sex ?? 'male';

  const [currentBf, setCurrentBf] = useState(measuredBf ?? (sex === 'male' ? 20 : 30));
  const [targetBf, setTargetBf] = useState(sex === 'male' ? 12 : 22);
  const [keepWeight, setKeepWeight] = useState(false);
  const [targetKg, setTargetKg] = useState(Math.round(currentKg ?? 75));

  const plan = useMemo(() => {
    if (!profile || currentKg == null) return null;
    return planPhysique({
      sex: profile.sex,
      heightCm: profile.heightCm,
      weightKg: currentKg,
      bodyFatPct: currentBf,
      experience: profile.experience,
      targetBodyFatPct: targetBf,
      targetWeightKg: keepWeight ? targetKg : null,
    });
  }, [profile, currentKg, currentBf, targetBf, keepWeight, targetKg]);

  if (!profile || currentKg == null || !plan) {
    return (
      <Screen title="Physique plan" back>
        <Text tone="secondary">Log your weight first.</Text>
      </Screen>
    );
  }

  const wu = weightUnit(units);
  const clampBf = (v: number) => Math.min(45, Math.max(5, Math.round(v)));
  let cursor = dateKey();

  const startFirst = () => {
    const first = plan.phases[0];
    if (!first) return;
    const def = GOALS[first.goal];
    startPhase({
      goalType: first.goal,
      startDate: dateKey(),
      startKg: currentKg,
      targetKg: def.direction !== 0 ? first.endKg : null,
      ratePctWeek: def.direction !== 0 ? first.ratePctWeek : 0,
      overrides: {},
    });
    haptic.success();
    toast(`${def.title} started`);
    router.dismissTo('/');
  };

  return (
    <Screen title="Physique plan" back>
      <Text variant="subhead" tone="secondary" style={{ marginBottom: SPACE.lg }}>
        Describe the body you want. Metakai works out the muscle you need and the phases to get there.
      </Text>

      <Card index={0}>
        <Stepper label={measuredBf != null ? 'Body fat now' : 'Body fat now (estimate)'} value={currentBf} step={1} onChange={(v) => setCurrentBf(clampBf(v))} format={(v) => `${v}%`} />
        <View style={[styles.sep, { backgroundColor: colors.separator }]} />
        <Stepper label="Target body fat" value={targetBf} step={1} onChange={(v) => setTargetBf(clampBf(v))} format={(v) => `${v}%`} />
        <View style={[styles.sep, { backgroundColor: colors.separator }]} />
        <PressableScale feedback="selection" onPress={() => setKeepWeight((k) => !k)} style={styles.stepperRow}>
          <Text variant="body" style={{ flex: 1 }}>
            Set a target weight too
          </Text>
          <Icon name={keepWeight ? 'check' : 'plus'} size={18} color={colors.accent} />
        </PressableScale>
        {keepWeight && (
          <Stepper label="Target weight" value={targetKg} step={1} onChange={(v) => setTargetKg(Math.max(35, v))} format={(v) => `${displayWeight(v, units, 0)} ${wu}`} />
        )}
      </Card>

      <Animated.View key={`${currentBf}-${targetBf}-${keepWeight}-${targetKg}`} entering={FadeIn.duration(250)}>
        <View style={styles.summary}>
          <Card style={styles.summaryCell}>
            <Text variant="caption" tone="secondary">
              Target
            </Text>
            <Text variant="title3" tabular>{`${displayWeight(plan.targetWeightKg, units)} ${wu}`}</Text>
            <Text variant="caption" tone="tertiary">{`at ${targetBf}% body fat`}</Text>
          </Card>
          <Card style={styles.summaryCell}>
            <Text variant="caption" tone="secondary">
              Muscle to add
            </Text>
            <Text variant="title3" tabular>{`${displayWeight(plan.leanToGainKg, units)} ${wu}`}</Text>
            <Text variant="caption" tone="tertiary">{`FFMI ${plan.targetFfmi}`}</Text>
          </Card>
          <Card style={styles.summaryCell}>
            <Text variant="caption" tone="secondary">
              Timeline
            </Text>
            <Text variant="title3" tabular>{plan.totalWeeks >= 52 ? `${(plan.totalWeeks / 52).toFixed(1)} yrs` : `${plan.totalWeeks} wks`}</Text>
            <Text variant="caption" tone="tertiary">{`${plan.phases.length - 1} ${plan.phases.length - 1 === 1 ? 'phase' : 'phases'}`}</Text>
          </Card>
        </View>

        {plan.note && (
          <Card style={{ marginTop: SPACE.md, borderColor: colors.warning, borderWidth: 1 }}>
            <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
              <Icon name="warning" size={18} color={colors.warning} />
              <Text variant="subhead" style={{ flex: 1 }}>
                {plan.note}
              </Text>
            </View>
          </Card>
        )}

        <Text variant="title3" style={{ marginTop: SPACE.xl, marginBottom: SPACE.md, paddingHorizontal: 4 }}>
          Your phases
        </Text>
        <View>
          {plan.phases.map((p, i) => {
            const start = cursor;
            cursor = addDays(cursor, p.weeks * 7);
            const def = GOALS[p.goal];
            const last = i === plan.phases.length - 1;
            return (
              <View key={i} style={styles.timelineRow}>
                <View style={styles.rail}>
                  <View style={[styles.node, { backgroundColor: i === 0 ? colors.accent : colors.text }]} />
                  {!last && <View style={[styles.line, { backgroundColor: colors.separator }]} />}
                </View>
                <Card style={{ flex: 1, marginBottom: SPACE.md }}>
                  <View style={styles.phaseHeader}>
                    <Text variant="headline">{def.title}</Text>
                    <Text variant="footnote" tone="secondary">
                      {last ? `from ${formatShort(start)}` : `${p.weeks} wks · ${formatShort(start)}`}
                    </Text>
                  </View>
                  <Text variant="subhead" tone="secondary" tabular>
                    {last
                      ? `Hold ${displayWeight(p.startKg, units)} ${wu} at about ${Math.round(p.startBf)}% body fat`
                      : `${displayWeight(p.startKg, units)} → ${displayWeight(p.endKg, units)} ${wu} · ${Math.round(p.startBf)}% → ${Math.round(p.endBf)}%`}
                  </Text>
                </Card>
              </View>
            );
          })}
        </View>
      </Animated.View>

      <Button title={`Start with ${GOALS[plan.phases[0].goal].title.toLowerCase()}`} onPress={startFirst} disabled={plan.phases[0].goal === 'maintain' && plan.phases.length === 1} />
      <Text variant="caption" tone="tertiary" align="center" style={{ marginTop: SPACE.md }}>
        Estimates assume typical rates of muscle gain for your experience. Real progress varies.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 48 },
  stepButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: SPACE.xs },
  summary: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md },
  summaryCell: { flex: 1, padding: SPACE.md, gap: 2 },
  timelineRow: { flexDirection: 'row', gap: SPACE.md },
  rail: { width: 14, alignItems: 'center', paddingTop: 20 },
  node: { width: 12, height: 12, borderRadius: 6 },
  line: { flex: 1, width: 2, marginTop: 4, borderRadius: RADIUS.sm },
  phaseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 },
});
