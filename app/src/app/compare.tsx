import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQuery } from '../core/db/useQuery';
import { useSettings } from '../core/store/settings';
import { RADIUS, SPACE } from '../core/theme/typography';
import { daysBetween, formatLong } from '../lib/dates';
import { displayWeight, weightUnit } from '../lib/units';
import { listPhotos } from '../modules/body/repo';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Text } from '../ui/Text';

type Mode = 'slider' | 'side';

/** Full-screen viewer; with two photos, a before/after slider or side-by-side view. */
export default function Compare() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const units = useSettings((s) => s.units);
  const { a, b } = useLocalSearchParams<{ a: string; b?: string }>();
  const photos = useQuery(['progress_photos'], listPhotos);
  const before = photos.find((p) => p.id === a);
  const after = b ? photos.find((p) => p.id === b) : undefined;
  const [mode, setMode] = useState<Mode>('slider');
  const [width, setWidth] = useState(0);
  const split = useSharedValue(0.5);

  const pan = Gesture.Pan()
    .onBegin((e) => {
      if (width > 0) split.value = Math.min(1, Math.max(0, e.x / width));
    })
    .onUpdate((e) => {
      if (width > 0) split.value = Math.min(1, Math.max(0, e.x / width));
    });

  const clip = useAnimatedStyle(() => ({ width: split.value * width }));
  const handle = useAnimatedStyle(() => ({ transform: [{ translateX: split.value * width - 1.5 }] }));

  if (!before) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  const caption = (p: typeof before) =>
    `${formatLong(p.dateKey)}${p.weightKg != null ? ` · ${displayWeight(p.weightKg, units)} ${weightUnit(units)}` : ''}`;
  const weightDiff = after && before.weightKg != null && after.weightKg != null ? after.weightKg - before.weightKg : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACE.sm, paddingBottom: insets.bottom + SPACE.lg }]}>
      <View style={styles.header}>
        <PressableScale onPress={() => router.back()} hitSlop={10} style={styles.close}>
          <Icon name="close" size={20} color="#FFFFFF" strokeWidth={2.6} />
        </PressableScale>
        {after && (
          <Text variant="headline" color="#FFFFFF">
            {`${daysBetween(before.dateKey, after.dateKey)} days${weightDiff != null ? ` · ${weightDiff > 0 ? '+' : '−'}${displayWeight(Math.abs(weightDiff), units)} ${weightUnit(units)}` : ''}`}
          </Text>
        )}
        <View style={styles.close} />
      </View>

      {after && (
        <View style={{ paddingHorizontal: SPACE.lg, marginBottom: SPACE.md }}>
          <SegmentedControl<Mode>
            value={mode}
            onChange={setMode}
            segments={[
              { value: 'slider', label: 'Slider' },
              { value: 'side', label: 'Side by side' },
            ]}
          />
        </View>
      )}

      <View style={styles.stage} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {!after ? (
          <Image source={{ uri: before.localPath! }} style={styles.full} resizeMode="contain" />
        ) : mode === 'side' ? (
          <View style={styles.sideBySide}>
            <Image source={{ uri: before.localPath! }} style={styles.half} resizeMode="cover" />
            <Image source={{ uri: after.localPath! }} style={styles.half} resizeMode="cover" />
          </View>
        ) : (
          <GestureDetector gesture={pan}>
            <View style={styles.full}>
              <Image source={{ uri: after.localPath! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              <Animated.View style={[styles.clip, clip]}>
                <Image source={{ uri: before.localPath! }} style={{ width, height: '100%' }} resizeMode="cover" />
              </Animated.View>
              <Animated.View style={[styles.handle, handle]}>
                <View style={styles.knob}>
                  <Icon name="chevronLeft" size={14} color="#000" strokeWidth={3} />
                  <Icon name="chevronRight" size={14} color="#000" strokeWidth={3} />
                </View>
              </Animated.View>
            </View>
          </GestureDetector>
        )}
      </View>

      <View style={styles.captions}>
        <Text variant="footnote" color="rgba(255,255,255,0.75)" style={{ flex: 1 }}>
          {after ? `Before · ${caption(before)}` : caption(before)}
        </Text>
        {after && (
          <Text variant="footnote" color="rgba(255,255,255,0.75)" style={{ flex: 1, textAlign: 'right' }}>
            {`After · ${caption(after)}`}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.md, height: 48 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  stage: { flex: 1, marginHorizontal: SPACE.lg, borderRadius: RADIUS.xl, overflow: 'hidden', backgroundColor: '#111' },
  full: { flex: 1 },
  sideBySide: { flex: 1, flexDirection: 'row', gap: 2 },
  half: { flex: 1 },
  clip: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  handle: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  knob: { position: 'absolute', flexDirection: 'row', width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  captions: { flexDirection: 'row', paddingHorizontal: SPACE.lg, marginTop: SPACE.md, gap: SPACE.md },
});
