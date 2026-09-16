import { StyleSheet } from 'react-native';

import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS } from '../core/theme/typography';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      feedback="selection"
      scaleTo={0.95}
      style={[styles.chip, { backgroundColor: selected ? colors.text : colors.fill }]}
    >
      {icon && <Icon name={icon} size={14} color={selected ? colors.background : colors.text} strokeWidth={2.4} />}
      <Text variant="subhead" weight="medium" color={selected ? colors.background : colors.text}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: RADIUS.pill },
});
