import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { TEXT_SCALE, useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, TYPE } from '../core/theme/typography';
import { Text } from './Text';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  suffix?: string;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField({ label, suffix, style, ...rest }, ref) {
  const { colors } = useTheme();
  const k = TEXT_SCALE[useSettings((s) => s.textScale)] ?? 1;
  return (
    <View style={{ gap: 6 }}>
      {label && (
        <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: 4 }}>
          {label}
        </Text>
      )}
      <View style={[styles.field, { backgroundColor: colors.fill }]}>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          underlineColorAndroid="transparent"
          style={[TYPE.body, styles.input, { color: colors.text }, k !== 1 && { fontSize: TYPE.body.fontSize! * k }, style]}
          {...rest}
        />
        {suffix && (
          <Text variant="body" tone="secondary">
            {suffix}
          </Text>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.md, paddingHorizontal: 14, minHeight: 48 },
  input: { flex: 1, paddingVertical: 12 },
});
