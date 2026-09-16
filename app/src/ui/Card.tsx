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
  /** Style for the outer (animated) wrapper, e.g. flex sizing inside a grid. */
  containerStyle?: StyleProp<ViewStyle>;
}

export function Card({ children, onPress, style, padded = true, index, containerStyle }: CardProps) {
  const { colors } = useTheme();
  const cardStyle = [styles.card, { backgroundColor: colors.surface }, padded && styles.padded, style];
  const content = onPress ? (
    <PressableScale onPress={onPress} scaleTo={0.985} feedback="selection" style={cardStyle}>
      {children}
    </PressableScale>
  ) : (
    <View style={cardStyle}>{children}</View>
  );
  if (index == null) return containerStyle ? <View style={containerStyle}>{content}</View> : content;
  return (
    <Animated.View entering={enterUp(index)} style={containerStyle}>
      {content}
    </Animated.View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Text variant="title3" weight="bold" style={{ flexShrink: 1 }}>
        {title}
      </Text>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.xl, overflow: 'hidden' },
  action: { marginLeft: SPACE.sm },
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
