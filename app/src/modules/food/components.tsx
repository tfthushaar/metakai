import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../core/theme/ThemeProvider';
import { SPACE } from '../../core/theme/typography';
import type { MacroTargets } from '../../lib/targets';
import { AnimatedNumber } from '../../ui/AnimatedNumber';
import { ProgressBar } from '../../ui/ProgressBar';
import { Ring } from '../../ui/Ring';
import { Text } from '../../ui/Text';
import type { Macros } from './foods';

export function useMacroColors() {
  const { colors } = useTheme();
  return { protein: colors.accent, carbs: colors.accent2, fat: colors.textSecondary };
}

function MacroRow({ label, eaten, target, color, delay }: { label: string; eaten: number; target: number; color: string; delay: number }) {
  const over = eaten > target * 1.05;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.macroHead}>
        <Text variant="footnote" tone="secondary" weight="medium">
          {label}
        </Text>
        <Text variant="footnote" weight="semibold" tone={over ? 'warning' : 'primary'} tabular>
          {`${Math.round(eaten)}`}
          <Text variant="footnote" tone="tertiary" tabular>{` / ${Math.round(target)} g`}</Text>
        </Text>
      </View>
      <ProgressBar progress={target > 0 ? eaten / target : 0} color={color} height={5} delay={delay} />
    </View>
  );
}

export function MacroSummary({ eaten, targets }: { eaten: Macros; targets: MacroTargets }) {
  const { colors } = useTheme();
  const macroColors = useMacroColors();
  const remaining = targets.kcal - eaten.kcal;
  const over = remaining < 0;
  return (
    <View style={styles.top}>
      <Ring size={128} stroke={12} progress={targets.kcal > 0 ? eaten.kcal / targets.kcal : 0}>
        <AnimatedNumber value={Math.abs(Math.round(remaining))} variant="title2" color={over ? colors.warning : colors.text} />
        <Text variant="caption" tone="secondary">
          {over ? 'kcal over' : 'kcal left'}
        </Text>
      </Ring>
      <View style={styles.macros}>
        <MacroRow label="Protein" eaten={eaten.protein} target={targets.protein} color={macroColors.protein} delay={80} />
        <MacroRow label="Carbs" eaten={eaten.carbs} target={targets.carbs} color={macroColors.carbs} delay={160} />
        <MacroRow label="Fat" eaten={eaten.fat} target={targets.fat} color={macroColors.fat} delay={240} />
      </View>
    </View>
  );
}

export function MacroInline({ macros, showKcal = true }: { macros: Pick<Macros, 'kcal' | 'protein' | 'carbs' | 'fat'>; showKcal?: boolean }) {
  return (
    <Text variant="footnote" tone="secondary" tabular>
      {showKcal ? `${Math.round(macros.kcal)} kcal · ` : ''}
      {`P ${Math.round(macros.protein)} · C ${Math.round(macros.carbs)} · F ${Math.round(macros.fat)}`}
    </Text>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xl },
  macros: { flex: 1, gap: SPACE.md },
  macroHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: SPACE.sm },
});
