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
  const indexOf = useCallback((v: number) => Math.min(count - 1, Math.max(0, Math.round((v - min) / step))), [count, min, step]);
  const valueAt = useCallback((i: number) => Number((min + i * step).toFixed(4)), [min, step]);
  const lastIndex = useRef(indexOf(value));
  const listRef = useRef<FlatList<number>>(null);
  /** True from the moment the user touches the list until it comes to rest. */
  const userDriven = useRef(false);
  const lastHaptic = useRef(0);
  /** True between lifting a finger and the list coming to rest. */
  const gliding = useRef(false);
  const restTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const side = width / 2 - TICK / 2;

  // Follow external value changes (+/- buttons, typed numbers) without echoing them back as new values.
  useEffect(() => {
    const i = indexOf(value);
    if (i !== lastIndex.current && !userDriven.current) {
      lastIndex.current = i;
      listRef.current?.scrollToOffset({ offset: i * TICK, animated: true });
    }
  }, [value, indexOf]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = indexOf(min + (e.nativeEvent.contentOffset.x / TICK) * step);
      if (i === lastIndex.current) return;
      lastIndex.current = i;
      // Only the user's own scrolling changes the value; programmatic scrolls just keep the index in sync.
      if (userDriven.current) {
        // Haptics are throttled so fast drags stay smooth.
        const now = Date.now();
        if (now - lastHaptic.current > 40) {
          lastHaptic.current = now;
          haptic.selection();
        }
        onChange(valueAt(i));
      }
    },
    [indexOf, min, step, onChange, valueAt],
  );

  // Report the tick the list actually came to rest on, so the saved value is exactly what is shown.
  const settleAt = useCallback(
    (offset: number) => {
      const i = indexOf(min + (offset / TICK) * step);
      lastIndex.current = i;
      gliding.current = false;
      // Programmatic scrolls (from +/- or a typed number) must not report a value of their own.
      if (!userDriven.current) return;
      userDriven.current = false;
      onChange(valueAt(i));
    },
    [indexOf, min, step, onChange, valueAt],
  );

  useEffect(() => () => (restTimer.current ? clearTimeout(restTimer.current) : undefined), []);

  const renderItem = useCallback(
    ({ item }: { item: number }) => {
      const v = min + item * step;
      const major = Math.round(v / step) % majorEvery === 0;
      return <Tick major={major} label={major ? (format ? format(v) : String(Math.round(v))) : undefined} color={colors.textSecondary} labelColor={colors.textTertiary} />;
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
        initialScrollIndex={indexOf(value)}
        snapToInterval={TICK}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        onScrollBeginDrag={() => {
          userDriven.current = true;
        }}
        onScrollEndDrag={(e) => {
          // The list often glides on after the finger lifts; wait for it to stop before settling.
          const offset = e.nativeEvent.contentOffset.x;
          if (restTimer.current) clearTimeout(restTimer.current);
          restTimer.current = setTimeout(() => {
            if (!gliding.current) settleAt(offset);
          }, 80);
        }}
        onMomentumScrollBegin={() => {
          gliding.current = true;
          if (restTimer.current) clearTimeout(restTimer.current);
        }}
        onMomentumScrollEnd={(e) => settleAt(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: side }}
        initialNumToRender={Math.ceil(width / TICK) + 10}
        maxToRenderPerBatch={Math.ceil(width / TICK)}
        updateCellsBatchingPeriod={20}
        windowSize={5}
      />
      <View pointerEvents="none" style={[styles.indicator, { left: width / 2 - 1.5, backgroundColor: colors.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 76 },
  tickWrap: { width: TICK, alignItems: 'center' },
  tick: { width: 2, borderRadius: 1 },
  // Explicit left and maxWidth keep the label centred under its tick on the web as well.
  label: { position: 'absolute', top: 40, left: (TICK - 48) / 2, width: 48, maxWidth: 48, textAlign: 'center' },
  indicator: { position: 'absolute', top: -6, width: 3, height: 46, borderRadius: 1.5 },
});
