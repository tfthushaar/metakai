import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { useBody } from '../core/goals/useBody';
import { useSettings } from '../core/store/settings';
import { Toggle } from '../ui/Toggle';
import { ListRow } from '../ui/List';
import { MACRO_KEYS, updatePhase } from '../core/db/repo';
import { useTheme } from '../core/theme/ThemeProvider';
import { SPACE } from '../core/theme/typography';
import { displayWeight, weightUnit } from '../lib/units';
import { ageFromBirthDate } from '../lib/energy';
import { lowCalorieNotice, type MacroTargets } from '../lib/targets';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { ListGroup } from '../ui/List';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
import { NumberPrompt } from '../ui/NumberPrompt';
import { Text } from '../ui/Text';

const FIELDS: { key: keyof MacroTargets; label: string; unit: string; step: number }[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal', step: 50 },
  { key: 'protein', label: 'Protein', unit: 'g', step: 5 },
  { key: 'carbs', label: 'Carbs', unit: 'g', step: 5 },
  { key: 'fat', label: 'Fat', unit: 'g', step: 5 },
  { key: 'fiber', label: 'Fiber', unit: 'g', step: 1 },
];

export default function Targets() {
  const { colors } = useTheme();
  const adaptiveOn = useSettings((st) => st.adaptiveTargets);
  const carbCycling = useSettings((st) => st.carbCycling);
  const setSettings = useSettings((st) => st.set);
  const units = useSettings((st) => st.units);
  const [typing, setTyping] = useState<keyof MacroTargets | null>(null);
  const { profile, phase, targets, recommended, currentKg, adaptive, dayType, customKcal, plannedWeeklyKg } = useBody();

  if (!profile || !phase || !targets || !recommended || currentKg == null) {
    return (
      <Screen title="Targets" back>
        <Text tone="secondary">Set a goal first.</Text>
      </Screen>
    );
  }

  const overrides = phase.overrides;
  const editing = FIELDS.find((f) => f.key === typing);
  const hasOverrides = MACRO_KEYS.some((k) => overrides[k] != null);

  const set = (key: keyof MacroTargets, value: number) => {
    haptic.selection();
    const next = { ...overrides, [key]: Math.max(0, value) };
    if (next[key] === recommended[key]) delete next[key];
    updatePhase(phase.id, { overrides: next });
    if (key === 'kcal' && !useSettings.getState().lowCalorieNoticeShown) {
      const notice = lowCalorieNotice({ sex: profile.sex, age: ageFromBirthDate(profile.birthDate), pregnant: profile.sex === 'female' && useSettings.getState().pregnant }, recommended.tdee, value);
      if (notice) {
        setSettings({ lowCalorieNoticeShown: true });
        Alert.alert('Very low calories', notice);
      }
    }
  };

  return (
    <Screen title="Targets" back>
      <Card>
        <Text variant="subhead" tone="secondary">
          {adaptive?.applied
            ? `Maintenance measured from your last ${adaptive.daysUsed} logged days: ${recommended.tdee} kcal. Targets adjust as you log.`
            : `Recommended from your goal, weight and activity. Estimated maintenance is ${recommended.tdee} kcal; BMR ${recommended.bmr} kcal.`}
        </Text>
      </Card>

      <ListGroup
        header="Daily targets"
        footer={
          customKcal && plannedWeeklyKg != null && plannedWeeklyKg !== 0
            ? `At ${targets.kcal.toLocaleString('en-US')} kcal expect about ${plannedWeeklyKg > 0 ? '+' : '−'}${displayWeight(Math.abs(plannedWeeklyKg), units, 2)} ${weightUnit(units)} a week. Predictions use these calories. Adjusted values stay fixed.`
            : 'Adjusted values stay fixed; recommended values update as your weight changes.'
        }
      >
        {FIELDS.map((f) => {
          const value = targets[f.key];
          const custom = overrides[f.key] != null;
          return (
            <View key={f.key} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text variant="body">{f.label}</Text>
                <Text variant="footnote" tone={custom ? 'accent' : 'secondary'}>
                  {custom ? `Custom · recommended ${recommended[f.key]}` : 'Recommended'}
                </Text>
              </View>
              <PressableScale onPress={() => set(f.key, value - f.step)} style={[styles.step, { backgroundColor: colors.fill }]}>
                <Icon name="minus" size={16} color={colors.text} />
              </PressableScale>
              <PressableScale scaleTo={0.97} feedback="selection" onPress={() => setTyping(f.key)} style={styles.value}>
                <Text variant="headline" tabular align="center">
                  {`${value} ${f.unit}`}
                </Text>
              </PressableScale>
              <PressableScale onPress={() => set(f.key, value + f.step)} style={[styles.step, { backgroundColor: colors.fill }]}>
                <Icon name="plus" size={16} color={colors.text} />
              </PressableScale>
            </View>
          );
        })}
      </ListGroup>

      {targets.warnings.map((w) => (
        <Text key={w} variant="footnote" tone="warning" style={{ marginTop: SPACE.sm, paddingHorizontal: SPACE.lg }}>
          {w}
        </Text>
      ))}

      <ListGroup header="Smart adjustments">
        <ListRow
          title="Adaptive maintenance"
          subtitle={
            adaptive
              ? `Measured ${adaptive.tdee} kcal from ${adaptive.daysUsed} days of logs and weigh-ins`
              : 'Needs about 2 weeks of food logs and weigh-ins'
          }
          accessory={<Toggle value={adaptiveOn} onChange={(v) => setSettings({ adaptiveTargets: v })} />}
        />
        <ListRow
          title="Training-day carbs"
          subtitle={dayType ? `Today is a ${dayType} day. More carbs on training days, fewer on rest days; same weekly total.` : 'More carbs on training days, fewer on rest days'}
          accessory={<Toggle value={carbCycling} onChange={(v) => setSettings({ carbCycling: v })} />}
        />
      </ListGroup>

      <Text variant="footnote" tone="secondary" style={{ marginTop: SPACE.md, paddingHorizontal: SPACE.lg }} tabular>
        {`Macros add up to ${Math.round(targets.protein * 4 + targets.carbs * 4 + targets.fat * 9)} kcal`}
      </Text>

      {editing && (
        <NumberPrompt
          visible
          title={editing.label}
          unit={editing.unit}
          value={targets[editing.key]}
          min={0}
          max={editing.key === 'kcal' ? 12000 : 2000}
          hint={`Recommended ${recommended[editing.key]} ${editing.unit}`}
          onClose={() => setTyping(null)}
          onSubmit={(v) => set(editing.key, v)}
        />
      )}

      {hasOverrides && (
        <View style={{ marginTop: SPACE.xl }}>
          <Button title="Reset to recommended" variant="gray" onPress={() => updatePhase(phase.id, { overrides: { reverseStartKcal: overrides.reverseStartKcal, reverseStepKcal: overrides.reverseStepKcal } })} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, gap: SPACE.sm },
  step: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 92, textAlign: 'center' },
});
