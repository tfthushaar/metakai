import { Text as RNText, StyleSheet, type TextProps, type TextStyle } from 'react-native';

import { TEXT_SCALE, useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { FONT, TYPE, type TypeVariant } from '../core/theme/typography';

export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'onAccent' | 'danger' | 'success' | 'warning';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  tone?: TextTone;
  weight?: keyof typeof FONT;
  align?: TextStyle['textAlign'];
  tabular?: boolean;
  color?: string;
}

export function Text({ variant = 'body', tone = 'primary', weight, align, tabular, color, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const k = TEXT_SCALE[useSettings((s) => s.textScale)] ?? 1;
  const toneColor: Record<TextTone, string> = {
    primary: colors.text,
    secondary: colors.textSecondary,
    tertiary: colors.textTertiary,
    accent: colors.accent,
    onAccent: colors.onAccent,
    danger: colors.danger,
    success: colors.success,
    warning: colors.warning,
  };
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={1.4}
      style={[
        TYPE[variant],
        { color: color ?? toneColor[tone] },
        weight && { fontFamily: FONT[weight] },
        align && { textAlign: align },
        tabular && { fontVariant: ['tabular-nums'] },
        style,
        k !== 1 && scaled(TYPE[variant], style, k),
      ]}
      {...rest}
    />
  );
}

/** Applies the text size setting on top of the variant and any size set in `style`. */
function scaled(base: TextStyle, style: AppTextProps['style'], k: number): TextStyle {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const fontSize = flat?.fontSize ?? base.fontSize;
  const lineHeight = flat?.lineHeight ?? base.lineHeight;
  return { fontSize: fontSize != null ? fontSize * k : undefined, lineHeight: lineHeight != null ? lineHeight * k : undefined };
}
