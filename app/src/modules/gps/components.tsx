import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '../../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../../core/theme/typography';
import { BEST_EFFORTS, decodePolyline, durationLabel, routePath } from '../../lib/geo';
import type { RouteSplits } from '../cardio/repo';
import { Text } from '../../ui/Text';
import { MI } from './summary';

/* ---------------- units ---------------- */

export function distanceParts(m: number, metric: boolean): { value: string; unit: string } {
  const v = m / (metric ? 1000 : MI);
  return { value: v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v).toString(), unit: metric ? 'km' : 'mi' };
}

export const paceUnit = (metric: boolean) => (metric ? '/km' : '/mi');

/** Pace for foot activities, speed for rides. */
export function paceOrSpeed(kind: string, movingSec: number, distanceM: number, metric: boolean): { value: string; unit: string; label: string } {
  if (kind === 'cycle') {
    const v = distanceM > 0 && movingSec > 0 ? (distanceM / movingSec) * (metric ? 3.6 : 2.23694) : 0;
    return { value: v.toFixed(1), unit: metric ? 'km/h' : 'mph', label: 'Avg speed' };
  }
  const per = metric ? 1000 : MI;
  if (distanceM < 10 || movingSec <= 0) return { value: '—', unit: paceUnit(metric), label: 'Avg pace' };
  return { value: durationLabel((movingSec / distanceM) * per), unit: paceUnit(metric), label: 'Avg pace' };
}

export const elevationLabel = (m: number, metric: boolean) => (metric ? `${Math.round(m)} m` : `${Math.round(m * 3.28084)} ft`);

/* ---------------- route art ---------------- */

export function RouteArt({
  points,
  encoded,
  width,
  height,
  strokeWidth = 4,
  markers = true,
  color,
}: {
  points?: [number, number][];
  encoded?: string | null;
  width: number;
  height: number;
  strokeWidth?: number;
  markers?: boolean;
  color?: string;
}) {
  const { colors } = useTheme();
  const pts = useMemo(() => points ?? (encoded ? decodePolyline(encoded) : []), [points, encoded]);
  const pad = strokeWidth * 3;
  const d = useMemo(() => routePath(pts, width, height, pad), [pts, width, height, pad]);
  if (!d) return <View style={{ width, height }} />;
  const stroke = color ?? colors.accent;
  const coords = d.split(' ');
  const xy = (s: string) => s.slice(1).split(',').map(Number);
  const [sx, sy] = xy(coords[0]);
  const [ex, ey] = xy(coords[coords.length - 1]);
  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={stroke} strokeOpacity={0.18} strokeWidth={strokeWidth * 3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Path d={d} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {markers && (
        <>
          <Circle cx={sx} cy={sy} r={strokeWidth * 1.4} fill={colors.background} stroke={colors.text} strokeWidth={2} />
          <Circle cx={ex} cy={ey} r={strokeWidth * 1.4} fill={stroke} stroke={colors.background} strokeWidth={2} />
        </>
      )}
    </Svg>
  );
}

/* ---------------- stats ---------------- */

export function StatCell({ label, value, unit, big }: { label: string; value: string; unit?: string; big?: boolean }) {
  return (
    <View style={styles.cell}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <Text variant={big ? 'title1' : 'title3'} tabular numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? (
          <Text variant="footnote" tone="secondary">
            {` ${unit}`}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

export function SplitsList({ data, kind, metric }: { data: RouteSplits; kind: string; metric: boolean }) {
  const { colors } = useTheme();
  const rows = data.splits.filter((s) => s.d > 0 && s.t > 0);
  if (rows.length === 0) return null;
  const perUnit = rows.map((s) => (s.t / s.d) * data.unitM);
  const fastest = Math.min(...perUnit);
  const slowest = Math.max(...perUnit);
  const unitLabel = data.unitM === 1000 ? 'km' : 'mi';
  return (
    <View>
      <View style={styles.splitHead}>
        <Text variant="caption" tone="tertiary" style={{ width: 34 }}>
          {unitLabel.toUpperCase()}
        </Text>
        <Text variant="caption" tone="tertiary" style={{ width: 64 }}>
          {kind === 'cycle' ? 'SPEED' : 'PACE'}
        </Text>
        <View style={{ flex: 1 }} />
        <Text variant="caption" tone="tertiary" style={{ width: 52, textAlign: 'right' }}>
          ELEV
        </Text>
      </View>
      {rows.map((s, i) => {
        const partial = s.d < data.unitM * 0.95;
        const sec = perUnit[i];
        // Faster splits get longer bars.
        const share = slowest === fastest ? 1 : 0.35 + (0.65 * (slowest - sec)) / (slowest - fastest);
        const speed = ((s.d / s.t) * (metric ? 3.6 : 2.23694)).toFixed(1);
        return (
          <View key={i} style={styles.splitRow}>
            <Text variant="subhead" tabular style={{ width: 34 }}>
              {partial ? (s.d / data.unitM).toFixed(1) : String(i + 1)}
            </Text>
            <Text variant="subhead" weight="semibold" tabular style={{ width: 64 }}>
              {kind === 'cycle' ? speed : durationLabel(sec)}
            </Text>
            <View style={styles.splitTrack}>
              <View style={{ width: `${share * 100}%`, height: '100%', borderRadius: RADIUS.pill, backgroundColor: sec === fastest ? colors.accent : colors.fill }} />
            </View>
            <Text variant="footnote" tone="secondary" tabular style={{ width: 52, textAlign: 'right' }}>
              {s.e == null ? '—' : `${s.e > 0 ? '+' : ''}${metric ? s.e : Math.round(s.e * 3.28084)}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function BestEffortsList({ best, previous }: { best: Record<string, number>; previous: Record<string, number> }) {
  const { colors } = useTheme();
  const items = BEST_EFFORTS.filter((e) => best[e.id] != null);
  if (items.length === 0) return null;
  return (
    <View>
      {items.map((e, i) => {
        const time = best[e.id];
        const prev = previous[e.id];
        const pr = prev == null || time < prev;
        return (
          <View key={e.id} style={[styles.effortRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}>
            <Text variant="body" style={{ flex: 1 }}>
              {e.label}
            </Text>
            {pr && (
              <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                <Text variant="caption" weight="bold" color={colors.onAccent}>
                  {prev == null ? 'FIRST' : 'PR'}
                </Text>
              </View>
            )}
            <Text variant="headline" tabular style={{ minWidth: 72, textAlign: 'right' }}>
              {durationLabel(time)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { width: '33.33%', paddingVertical: SPACE.sm, gap: 2 },
  splitHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingBottom: SPACE.xs },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingVertical: 7 },
  splitTrack: { flex: 1, height: 10, borderRadius: RADIUS.pill, overflow: 'hidden' },
  effortRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.md },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.pill },
});
