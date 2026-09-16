import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Line, Polygon, Stop, Text as SvgText } from 'react-native-svg';

import { useTheme } from '../../core/theme/ThemeProvider';
import { FONT, RADIUS, SPACE } from '../../core/theme/typography';
import { TIERS, type TierInfo } from '../../lib/ranks';
import { Icon, type IconName } from '../../ui/Icon';
import { Text } from '../../ui/Text';

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Dark text on light tier colours, white on the rest. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#111114' : '#FFFFFF';
}

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

let gradientSeq = 0;
const useGradientId = () => {
  const ref = useRef<string | null>(null);
  if (!ref.current) ref.current = `tier${++gradientSeq}`;
  return ref.current;
};

/** Hexagonal rank badge. Locked badges are drawn as a grey outline. */
export function TierBadge({ tier, size = 64, locked }: { tier: TierInfo; size?: number; locked?: boolean }) {
  const { colors } = useTheme();
  const id = useGradientId();
  const c = size / 2;
  const base = locked ? colors.fill : tier.color;
  const ink = locked ? colors.textTertiary : inkOn(tier.color);
  const glyph = tier.division ?? '';
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={locked ? base : shade(base, 0.25)} />
            <Stop offset="1" stopColor={locked ? base : shade(base, -0.28)} />
          </LinearGradient>
        </Defs>
        <Polygon points={hexPoints(c, c, c * 0.96)} fill={`url(#${id})`} />
        <Polygon
          points={hexPoints(c, c, c * 0.74)}
          fill="none"
          stroke={locked ? colors.separator : shade(base, 0.45)}
          strokeWidth={Math.max(1, size / 40)}
          opacity={0.8}
        />
        {glyph ? (
          <SvgText x={c} y={c + size * 0.1} fontSize={size * 0.3} fontFamily={FONT.bold} fill={ink} textAnchor="middle">
            {glyph}
          </SvgText>
        ) : null}
      </Svg>
      {!glyph && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Icon name={locked ? 'lock' : 'crown'} size={size * 0.36} color={ink} strokeWidth={2.2} />
        </View>
      )}
    </View>
  );
}

/** Round icon badge for achievements, in a tier-like colour. */
export function AchievementBadge({ icon, earned, size = 56, color }: { icon: IconName; earned: boolean; size?: number; color?: string }) {
  const { colors } = useTheme();
  const tint = color ?? colors.accent;
  return (
    <View
      style={[
        styles.achBadge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: earned ? tint : colors.fill,
          borderColor: earned ? shade(tint, 0.3) : colors.separator,
        },
      ]}
    >
      <Icon name={earned ? icon : 'lock'} size={size * 0.44} color={earned ? inkOn(tint) : colors.textTertiary} strokeWidth={2.2} />
    </View>
  );
}

/** Tier ladder showing where you are. */
export function TierLadder({ tier }: { tier: TierInfo }) {
  const { colors } = useTheme();
  return (
    <View style={styles.ladder}>
      {TIERS.map((t, i) => (
        <View
          key={t.id}
          style={[styles.rung, { backgroundColor: i <= tier.index ? t.color : colors.fill, opacity: i === tier.index ? 1 : i < tier.index ? 0.55 : 1 }]}
        />
      ))}
    </View>
  );
}

export interface RadarValue {
  label: string;
  /** 0–100. */
  value: number;
  color: string;
}

/** Radar chart of scores, 0 at the centre and 100 at the edge. */
export function RadarChart({ values, size }: { values: RadarValue[]; size: number }) {
  const { colors } = useTheme();
  const c = size / 2;
  // Leave room for side labels, which extend outward from their anchor.
  const r = size / 2 - 62;
  const n = values.length;
  const at = (i: number, v: number) => {
    const a = ((-90 + (360 / n) * i) * Math.PI) / 180;
    return [c + r * (v / 100) * Math.cos(a), c + r * (v / 100) * Math.sin(a)] as const;
  };
  const poly = values.map((v, i) => at(i, Math.max(4, v.value)).join(',')).join(' ');
  return (
    <Svg width={size} height={size}>
      {[25, 50, 75, 100].map((ring) => (
        <Polygon key={ring} points={values.map((_, i) => at(i, ring).join(',')).join(' ')} fill="none" stroke={colors.separator} strokeWidth={1} />
      ))}
      {values.map((_, i) => {
        const [x, y] = at(i, 100);
        return <Line key={i} x1={c} y1={c} x2={x} y2={y} stroke={colors.separator} strokeWidth={1} />;
      })}
      <Polygon points={poly} fill={colors.accent} fillOpacity={0.18} stroke={colors.accent} strokeWidth={2} strokeLinejoin="round" />
      <G>
        {values.map((v, i) => {
          const [x, y] = at(i, Math.max(4, v.value));
          return <Circle key={i} cx={x} cy={y} r={4.5} fill={v.color} stroke={colors.background} strokeWidth={1.5} />;
        })}
      </G>
      {values.map((v, i) => {
        const [x, y] = at(i, 112);
        // Side labels grow away from the chart so they never run off the edge.
        const anchor = x < c - 8 ? 'end' : x > c + 8 ? 'start' : 'middle';
        return (
          <SvgText key={v.label} x={x} y={y + 4} fontSize={10.5} fontFamily={FONT.medium} fill={colors.textSecondary} textAnchor={anchor}>
            {v.label}
          </SvgText>
        );
      })}
    </Svg>
  );
}

export function ScoreBar({ value, color }: { value: number; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: colors.fill }]}>
      <View style={{ width: `${Math.max(2, Math.min(100, value))}%`, height: '100%', borderRadius: RADIUS.pill, backgroundColor: color }} />
    </View>
  );
}

export function StatPill({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: colors.fill }]}>
      <Text variant="headline" tabular numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" tone="secondary" numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  achBadge: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  ladder: { flexDirection: 'row', gap: 4 },
  rung: { flex: 1, height: 6, borderRadius: 3 },
  bar: { height: 8, borderRadius: RADIUS.pill, overflow: 'hidden', flex: 1 },
  pill: { flex: 1, padding: SPACE.md, borderRadius: RADIUS.lg, gap: 2 },
});

export const CATEGORY_COLOR: Record<string, string> = {
  training: '#FF453A',
  running: '#FF9F0A',
  nutrition: '#30D158',
  body: '#0A84FF',
  habits: '#BF5AF2',
  ranks: '#E9B949',
};
