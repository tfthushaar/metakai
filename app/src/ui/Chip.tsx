import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS } from '../core/theme/typography';
import { Icon, type IconName } from './Icon';
import { SPRING } from './motion';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

/** Selecting a chip crossfades its colour and gives it a small pop. */
export function Chip({ label, selected, onPress, onLongPress, icon }: { label: string; selected?: boolean; onPress?: () => void; onLongPress?: () => void; icon?: IconName }) {
  const { colors } = useTheme();
  const on = useSharedValue(selected ? 1 : 0);
  const pop = useSharedValue(1);

  useEffect(() => {
    on.value = withTiming(selected ? 1 : 0, { duration: 180 });
    if (selected) pop.value = withSequence(withTiming(1.06, { duration: 90 }), withSpring(1, SPRING));
  }, [selected, on, pop]);

  const fill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [colors.fill, colors.text]),
    transform: [{ scale: pop.value }],
  }));

  return (
    <PressableScale onPress={onPress} onLongPress={onLongPress} feedback="selection" scaleTo={0.95}>
      <Animated.View style={[styles.chip, fill]}>
        {icon && <Icon name={icon} size={14} color={selected ? colors.background : colors.text} strokeWidth={2.4} />}
        <Text variant="subhead" weight="medium" color={selected ? colors.background : colors.text}>
          {label}
        </Text>
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: RADIUS.pill },
});
