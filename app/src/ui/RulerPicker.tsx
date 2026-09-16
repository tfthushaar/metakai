import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { useTheme } from '../core/theme/ThemeProvider';
import { haptic } from './haptics';
import { Text } from './Text';

const TICK = 10;

export interface RulerPickerProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  /** Every Nth tick is tall and labelled. */
  majorEvery?: number;
  width: number;
  format?: (value: number) => string;
}

const Tick = memo(function Tick({ major, label, color, labelColor }: { major: boolean; label?: string; color: string; labelColor: string }) {
  return (
    <View style={styles.tickWrap}>
      <View style={[styles.tick, { height: major ? 34 : 18, backgroundColor: color, opacity: major ? 1 : 0.55 }]} />
      {label != null && (
        <Text variant="caption" color={labelColor} style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      )}
    </View>
  );
});

/** Horizontal ruler that snaps to `step`, with a haptic tick for each value. */
export function RulerPicker({ min, max, step, value, onChange, majorEvery = 10, width, format }: RulerPickerProps) {
  const { colors } = useTheme();
  const count = Math.round((max - min) / step) + 1;
  const data = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  const lastIndex = useRef(Math.round((value - min) / step));
  const listRef = useRef<FlatList<number>>(null);
  const side = width / 2 - TICK / 2;

  // Follow external value changes (e.g. +/- buttons) without echoing our own scroll updates.
  useEffect(() => {
    const i = Math.round((value - min) / step);
    if (i !== lastIndex.current) {
      lastIndex.current = i;
      listRef.current?.scrollToOffset({ offset: i * TICK, animated: true });
    }
  }, [value, min, step]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.min(count - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / TICK)));
      if (i !== lastIndex.current) {
        lastIndex.current = i;
        haptic.selection();
        onChange(Number((min + i * step).toFixed(4)));
      }
    },
    [count, min, step, onChange],
  );

  const renderItem = useCallback(
    ({ item }: { item: number }) => {
      const major = item % majorEvery === 0;
      const v = min + item * step;
      return (
        <Tick
          major={major}
          label={major ? (format ? format(v) : String(Math.round(v))) : undefined}
          color={colors.textSecondary}
          labelColor={colors.textTertiary}
        />
      );
    },
    [majorEvery, min, step, format, colors.textSecondary, colors.textTertiary],
  );

  if (width <= 0) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        horizontal
        data={data}
        keyExtractor={(i) => String(i)}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({ length: TICK, offset: TICK * index, index })}
        initialScrollIndex={Math.round((value - min) / step)}
        snapToInterval={TICK}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: side }}
        initialNumToRender={Math.ceil(width / TICK) + 10}
        windowSize={7}
        maxToRenderPerBatch={80}
      />
      <View pointerEvents="none" style={[styles.indicator, { left: width / 2 - 1.5, backgroundColor: colors.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 76 },
  tickWrap: { width: TICK, alignItems: 'center' },
  tick: { width: 2, borderRadius: 1 },
  label: { position: 'absolute', top: 40, width: 48, textAlign: 'center' },
  indicator: { position: 'absolute', top: -6, width: 3, height: 46, borderRadius: 1.5 },
});
