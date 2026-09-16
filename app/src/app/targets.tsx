import { StyleSheet, View } from 'react-native';

import { bodyInput, useBody } from '../core/goals/useBody';
import { updatePhase } from '../core/db/repo';
import { useTheme } from '../core/theme/ThemeProvider';
import { SPACE } from '../core/theme/typography';
import { computeTargets, type MacroTargets } from '../lib/targets';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { haptic } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { ListGroup } from '../ui/List';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
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
  const { profile, phase, targets, currentKg } = useBody();

  if (!profile || !phase || !targets || currentKg == null) {
    return (
      <Screen title="Targets" back>
        <Text tone="secondary">Set a goal first.</Text>
      </Screen>
    );
  }

  const recommended = computeTargets({ ...bodyInput(profile, currentKg), goal: phase.goalType, ratePctWeek: phase.ratePctWeek });
  const overrides = phase.overrides;
  const hasOverrides = Object.keys(overrides).length > 0;

  const set = (key: keyof MacroTargets, value: number) => {
    haptic.selection();
    const next = { ...overrides, [key]: Math.max(0, value) };
    if (next[key] === recommended[key]) delete next[key];
    updatePhase(phase.id, { overrides: next });
  };

  return (
    <Screen title="Targets" back>
      <Card>
        <Text variant="subhead" tone="secondary">
          {`Recommended from your goal, weight and activity. Estimated maintenance is ${recommended.tdee} kcal; BMR ${recommended.bmr} kcal.`}
        </Text>
      </Card>

      <ListGroup header="Daily targets" footer="Adjusted values stay fixed; recommended values update as your weight changes.">
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
              <Text variant="headline" tabular style={styles.value}>
                {`${value} ${f.unit}`}
              </Text>
              <PressableScale onPress={() => set(f.key, value + f.step)} style={[styles.step, { backgroundColor: colors.fill }]}>
                <Icon name="plus" size={16} color={colors.text} />
              </PressableScale>
            </View>
          );
        })}
      </ListGroup>

      <Text variant="footnote" tone="secondary" style={{ marginTop: SPACE.md, paddingHorizontal: SPACE.lg }} tabular>
        {`Macros add up to ${Math.round(targets.protein * 4 + targets.carbs * 4 + targets.fat * 9)} kcal`}
      </Text>

      {hasOverrides && (
        <View style={{ marginTop: SPACE.xl }}>
          <Button title="Reset to recommended" variant="gray" onPress={() => updatePhase(phase.id, { overrides: {} })} />
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
