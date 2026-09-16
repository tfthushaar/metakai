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
  return { protein: colors.accent, carbs: colors.text, fat: colors.textSecondary };
}

function MacroBar({ label, eaten, target, color, delay }: { label: string; eaten: number; target: number; color: string; delay: number }) {
  const left = Math.round(target - eaten);
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text variant="footnote" tone="secondary" weight="medium">
        {label}
      </Text>
      <ProgressBar progress={target > 0 ? eaten / target : 0} color={color} height={5} delay={delay} />
      <Text variant="subhead" weight="semibold" tabular>
        {`${Math.round(eaten)}`}
        <Text variant="subhead" tone="tertiary" tabular>{` / ${Math.round(target)}g`}</Text>
      </Text>
      <Text variant="caption" tone={left < 0 ? 'warning' : 'tertiary'}>
        {left >= 0 ? `${left}g left` : `${-left}g over`}
      </Text>
    </View>
  );
}

export function MacroSummary({ eaten, targets }: { eaten: Macros; targets: MacroTargets }) {
  const { colors } = useTheme();
  const macroColors = useMacroColors();
  const remaining = targets.kcal - eaten.kcal;
  const over = remaining < 0;
  return (
    <View style={{ gap: SPACE.xl }}>
      <View style={styles.top}>
        <Ring size={150} stroke={14} progress={targets.kcal > 0 ? eaten.kcal / targets.kcal : 0}>
          <AnimatedNumber value={Math.abs(Math.round(remaining))} variant="title1" color={over ? colors.warning : colors.text} />
          <Text variant="caption" tone="secondary">
            {over ? 'kcal over' : 'kcal left'}
          </Text>
        </Ring>
        <View style={styles.stats}>
          <View>
            <Text variant="footnote" tone="secondary">
              Eaten
            </Text>
            <Text variant="title2" tabular>
              {Math.round(eaten.kcal).toLocaleString('en-US')}
            </Text>
          </View>
          <View>
            <Text variant="footnote" tone="secondary">
              Target
            </Text>
            <Text variant="title2" tabular>
              {targets.kcal.toLocaleString('en-US')}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.bars}>
        <MacroBar label="Protein" eaten={eaten.protein} target={targets.protein} color={macroColors.protein} delay={80} />
        <MacroBar label="Carbs" eaten={eaten.carbs} target={targets.carbs} color={macroColors.carbs} delay={160} />
        <MacroBar label="Fat" eaten={eaten.fat} target={targets.fat} color={macroColors.fat} delay={240} />
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
  top: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xxl },
  stats: { flex: 1, gap: SPACE.lg },
  bars: { flexDirection: 'row', gap: SPACE.lg },
});
