import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS } from '../core/theme/typography';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type ButtonVariant = 'filled' | 'tinted' | 'gray' | 'plain' | 'destructive';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'lg' | 'md' | 'sm';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}

const HEIGHT = { lg: 54, md: 44, sm: 34 };

export function Button({ title, onPress, variant = 'filled', size = 'lg', icon, loading, disabled, style, full = true }: ButtonProps) {
  const { colors } = useTheme();
  const bg: Record<ButtonVariant, string> = {
    filled: colors.accent,
    tinted: colors.accentSoft,
    gray: colors.fill,
    plain: 'transparent',
    destructive: colors.fill,
  };
  const fg: Record<ButtonVariant, string> = {
    filled: colors.onAccent,
    tinted: colors.accent,
    gray: colors.text,
    plain: colors.accent,
    destructive: colors.danger,
  };
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      feedback={variant === 'plain' ? 'selection' : 'light'}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[
        styles.base,
        {
          height: HEIGHT[size],
          backgroundColor: bg[variant],
          borderRadius: size === 'sm' ? RADIUS.pill : RADIUS.lg,
          paddingHorizontal: size === 'sm' ? 14 : 20,
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <View style={styles.row}>
          {icon && <Icon name={icon} size={size === 'sm' ? 16 : 19} color={fg[variant]} strokeWidth={2.3} />}
          <Text variant={size === 'sm' ? 'subhead' : 'headline'} weight="semibold" color={fg[variant]}>
            {title}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
