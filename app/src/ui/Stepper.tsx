import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../core/theme/ThemeProvider';
import { SPACE } from '../core/theme/typography';
import { Icon } from './Icon';
import { NumberPrompt } from './NumberPrompt';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface StepperProps {
  label?: string;
  sublabel?: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  /** Shown in the typing dialog, and after the number when there is no `format`. */
  unit?: string;
  format?: (value: number) => string;
  /** Dialog title; defaults to the label. */
  title?: string;
  valueWidth?: number;
}

/** Label, minus, value and plus. Tapping the value types an exact number. */
export function Stepper({ label, sublabel, value, onChange, step = 1, min = 0, max = Number.MAX_SAFE_INTEGER, decimals = 0, unit, format, title, valueWidth = 72 }: StepperProps) {
  const { colors } = useTheme();
  const [typing, setTyping] = useState(false);
  const clamp = (v: number) => Number(Math.min(max, Math.max(min, v)).toFixed(decimals));
  const shown = format ? format(value) : `${Number(value.toFixed(decimals))}${unit ? ` ${unit}` : ''}`;

  return (
    <View style={styles.row}>
      {label != null && (
        <View style={{ flex: 1 }}>
          <Text variant="body">{label}</Text>
          {sublabel != null && (
            <Text variant="caption" tone="tertiary">
              {sublabel}
            </Text>
          )}
        </View>
      )}
      <PressableScale feedback="selection" hitSlop={6} onPress={() => onChange(clamp(value - step))} disabled={value <= min} style={[styles.button, { backgroundColor: colors.fill, opacity: value <= min ? 0.4 : 1 }]}>
        <Icon name="minus" size={16} color={colors.text} />
      </PressableScale>
      <PressableScale feedback="selection" scaleTo={0.96} onPress={() => setTyping(true)} style={{ minWidth: valueWidth }}>
        <Text variant="headline" tabular align="center">
          {shown}
        </Text>
      </PressableScale>
      <PressableScale feedback="selection" hitSlop={6} onPress={() => onChange(clamp(value + step))} disabled={value >= max} style={[styles.button, { backgroundColor: colors.fill, opacity: value >= max ? 0.4 : 1 }]}>
        <Icon name="plus" size={16} color={colors.text} />
      </PressableScale>

      <NumberPrompt
        visible={typing}
        title={title ?? label ?? 'Value'}
        unit={unit}
        value={value}
        decimals={decimals}
        min={min}
        max={max === Number.MAX_SAFE_INTEGER ? undefined : max}
        onClose={() => setTyping(false)}
        onSubmit={(v) => onChange(clamp(v))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 44 },
  button: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
