import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { hexToHsv, hsvToHex, isHex, normalizeHex, type Hsv } from '../lib/color';
import { haptic } from './haptics';
import { PressableScale } from './PressableScale';
import { TextField } from './TextField';

const SEGMENTS = 90;
const SUGGESTIONS = ['#FF453A', '#FF9F0A', '#FFD60A', '#30D158', '#64D2FF', '#0A84FF', '#5E5CE6', '#BF5AF2', '#FF375F', '#FFFFFF', '#8E8E93', '#000000'];
/** How often a drag pushes the colour to the rest of the app. */
const LIVE_MS = 90;

function wedge(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => `${cx + r * Math.cos((a * Math.PI) / 180)} ${cy + r * Math.sin((a * Math.PI) / 180)}`;
  return `M${cx} ${cy} L${p(a0)} A${r} ${r} 0 0 1 ${p(a1)} Z`;
}

/** Hue and saturation wheel, a brightness slider and a hex field. */
export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const { colors } = useTheme();
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hex, setHex] = useState(value);
  const [width, setWidth] = useState(0);
  const lastSent = useRef(0);
  const current = useRef(hsv);
  current.current = hsv;
  // Drag handlers are created once; read the latest callback through a ref.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Follow outside changes (another colour slot, reset) unless they are our own echo.
  useEffect(() => {
    if (normalizeHex(value) !== hsvToHex(current.current)) {
      setHsv(hexToHsv(value));
      setHex(value);
    }
  }, [value]);

  const size = Math.min(width, 280);
  const r = size / 2;

  const push = (next: Hsv, final: boolean) => {
    setHsv(next);
    const out = hsvToHex(next);
    setHex(out);
    const now = Date.now();
    if (final || now - lastSent.current > LIVE_MS) {
      lastSent.current = now;
      onChangeRef.current(out);
    }
  };

  const fromWheel = (x: number, y: number, final: boolean) => {
    const dx = x - r;
    const dy = y - r;
    const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const s = Math.min(1, Math.hypot(dx, dy) / r);
    push({ ...current.current, h, s }, final);
  };

  const wheel = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          haptic.selection();
          fromWheel(e.nativeEvent.locationX, e.nativeEvent.locationY, false);
        },
        onPanResponderMove: (e) => fromWheel(e.nativeEvent.locationX, e.nativeEvent.locationY, false),
        onPanResponderRelease: (e) => fromWheel(e.nativeEvent.locationX, e.nativeEvent.locationY, true),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r],
  );

  const sliderWidth = useRef(0);
  const fromSlider = (x: number, final: boolean) => {
    const v = Math.min(1, Math.max(0, x / Math.max(1, sliderWidth.current)));
    push({ ...current.current, v }, final);
  };
  const slider = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => fromSlider(e.nativeEvent.locationX, false),
        onPanResponderMove: (e) => fromSlider(e.nativeEvent.locationX, false),
        onPanResponderRelease: (e) => fromSlider(e.nativeEvent.locationX, true),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const pure = hsvToHex({ h: hsv.h, s: hsv.s, v: 1 });
  // While a hex is half typed, show the last complete colour.
  const shown = isHex(hex) ? normalizeHex(hex) : hsvToHex(hsv);
  const thumbX = r + Math.cos((hsv.h * Math.PI) / 180) * hsv.s * r;
  const thumbY = r + Math.sin((hsv.h * Math.PI) / 180) * hsv.s * r;

  return (
    <View style={{ gap: SPACE.lg }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {size > 0 && (
        <View style={{ width: size, height: size, alignSelf: 'center' }} {...wheel.panHandlers}>
          <Svg width={size} height={size} pointerEvents="none">
            <Defs>
              <RadialGradient id="white" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            {Array.from({ length: SEGMENTS }, (_, i) => {
              const a0 = (i * 360) / SEGMENTS;
              // Overlap slightly so no seams show between wedges.
              return <Path key={i} d={wedge(r, r, r, a0, a0 + 360 / SEGMENTS + 0.6)} fill={hsvToHex({ h: a0 + 180 / SEGMENTS, s: 1, v: 1 })} />;
            })}
            <Circle cx={r} cy={r} r={r} fill="url(#white)" />
            <Circle cx={r} cy={r} r={r} fill="#000000" opacity={1 - hsv.v} />
            <Circle cx={thumbX} cy={thumbY} r={13} fill={shown} stroke="#FFFFFF" strokeWidth={3} />
            <Circle cx={thumbX} cy={thumbY} r={14.5} fill="none" stroke="#000000" strokeOpacity={0.25} strokeWidth={1} />
          </Svg>
        </View>
      )}

      <View
        style={styles.slider}
        onLayout={(e) => {
          sliderWidth.current = e.nativeEvent.layout.width;
        }}
        {...slider.panHandlers}
      >
        <Svg width="100%" height="100%" pointerEvents="none">
          <Defs>
            <LinearGradient id="brightness" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#000000" />
              <Stop offset="1" stopColor={pure} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" rx={14} fill="url(#brightness)" />
        </Svg>
        <View pointerEvents="none" style={[styles.sliderThumb, { left: `${hsv.v * 100}%`, backgroundColor: shown }]} />
      </View>

      <View style={styles.hexRow}>
        <View style={[styles.hexSwatch, { backgroundColor: shown, borderColor: colors.separator }]} />
        <View style={{ flex: 1 }}>
          <TextField
            value={hex}
            onChangeText={(t) => {
              setHex(t);
              if (isHex(t)) {
                const next = normalizeHex(t);
                setHsv(hexToHsv(next));
                onChange(next);
              }
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            placeholder="#FF453A"
          />
        </View>
      </View>

      <View style={styles.suggestions}>
        {SUGGESTIONS.map((c) => (
          <PressableScale
            key={c}
            feedback="selection"
            scaleTo={0.88}
            onPress={() => push(hexToHsv(c), true)}
            style={[styles.suggestion, { backgroundColor: c, borderColor: colors.separator }]}
            accessibilityLabel={c}
          >
            {null}
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slider: { height: 28, borderRadius: 14, justifyContent: 'center' },
  sliderThumb: { position: 'absolute', width: 28, height: 28, marginLeft: -14, borderRadius: 14, borderWidth: 3, borderColor: '#FFFFFF' },
  hexRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  hexSwatch: { width: 48, height: 48, borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, justifyContent: 'center' },
  suggestion: { width: 32, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
});
