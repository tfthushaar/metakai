import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { enterUp } from './motion';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  /** Stagger index for the entrance animation. */
  index?: number;
}

export function Card({ children, onPress, style, padded = true, index }: CardProps) {
  const { colors } = useTheme();
  const cardStyle = [styles.card, { backgroundColor: colors.surface }, padded && styles.padded, style];
  const content = onPress ? (
    <PressableScale onPress={onPress} scaleTo={0.985} feedback="selection" style={cardStyle}>
      {children}
    </PressableScale>
  ) : (
    <View style={cardStyle}>{children}</View>
  );
  if (index == null) return content;
  return <Animated.View entering={enterUp(index)}>{content}</Animated.View>;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Text variant="title3" weight="bold">
        {title}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.xl, overflow: 'hidden' },
  padded: { padding: SPACE.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACE.xl,
    marginBottom: SPACE.sm,
    paddingHorizontal: 4,
  },
});
