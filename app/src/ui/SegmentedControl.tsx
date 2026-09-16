import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useTheme } from '../core/theme/ThemeProvider';
import { haptic } from './haptics';
import { SPRING } from './motion';
import { Text } from './Text';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors, dark } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, segments.findIndex((s) => s.value === value));
  const x = useSharedValue(0);
  const segmentWidth = width > 0 ? (width - 4) / segments.length : 0;

  useEffect(() => {
    x.value = withSpring(index * segmentWidth, SPRING);
  }, [index, segmentWidth, x]);

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      style={[styles.track, { backgroundColor: colors.fill }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      {segmentWidth > 0 && (
        <Animated.View
          style={[
            styles.thumb,
            { width: segmentWidth, backgroundColor: dark ? colors.surfaceRaised : '#FFFFFF' },
            thumb,
          ]}
        />
      )}
      {segments.map((s) => {
        const active = s.value === value;
        return (
          <Pressable
            key={s.value}
            style={styles.segment}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) {
                haptic.selection();
                onChange(s.value);
              }
            }}
          >
            <Text variant="subhead" weight={active ? 'semibold' : 'medium'} tone={active ? 'primary' : 'secondary'}>
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 10, padding: 2, height: 36 },
  thumb: {
    position: 'absolute',
    top: 2,
    left: 2,
    bottom: 2,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
