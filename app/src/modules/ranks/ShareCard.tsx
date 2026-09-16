import { forwardRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '../../core/theme/ThemeProvider';
import { FONT, RADIUS, SPACE } from '../../core/theme/typography';
import { Text } from '../../ui/Text';

/** Cards always use the dark brand look so shared images are consistent. */
export const CARD = {
  background: '#000000',
  surface: '#141416',
  text: '#FFFFFF',
  secondary: 'rgba(235,235,245,0.62)',
  tertiary: 'rgba(235,235,245,0.36)',
  line: 'rgba(255,255,255,0.12)',
};

function Logo({ accent }: { accent: string }) {
  const ring = (r: number, color: string, sweep: number) => {
    const c = 2 * Math.PI * r;
    return (
      <Circle
        cx={14}
        cy={14}
        r={r}
        stroke={color}
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${c * sweep} ${c}`}
        transform="rotate(-90 14 14)"
      />
    );
  };
  return (
    <Svg width={28} height={28}>
      {ring(12, accent, 0.78)}
      {ring(7.5, CARD.text, 0.62)}
      {ring(3, CARD.secondary, 0.45)}
    </Svg>
  );
}

export interface ShareStat {
  label: string;
  value: string;
}

export const ShareCard = forwardRef<
  View,
  { width: number; eyebrow: string; title: string; subtitle?: string; hero: ReactNode; stats?: ShareStat[]; footnote?: string; children?: ReactNode }
>(function ShareCard({ width, eyebrow, title, subtitle, hero, stats, footnote, children }, ref) {
  const { colors } = useTheme();
  const k = width / 360;
  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width, minHeight: width * 1.25, padding: 24 * k, borderRadius: RADIUS.xl }]}>
      <View style={styles.header}>
        <Logo accent={colors.accent} />
        <Text variant="subhead" weight="bold" color={CARD.text} style={{ letterSpacing: 1.5 }}>
          METAKAI
        </Text>
      </View>

      <View style={styles.body}>
        {hero}
        <Text variant="footnote" weight="semibold" color={colors.accent} align="center" style={{ letterSpacing: 1.2, marginTop: SPACE.lg }}>
          {eyebrow.toUpperCase()}
        </Text>
        <Text align="center" color={CARD.text} style={{ fontFamily: FONT.bold, fontSize: 30 * k, lineHeight: 36 * k, letterSpacing: -0.6 }} numberOfLines={2} adjustsFontSizeToFit>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="subhead" color={CARD.secondary} align="center" numberOfLines={3} style={{ marginTop: 4, paddingHorizontal: SPACE.md }}>
            {subtitle}
          </Text>
        ) : null}
        {children}
      </View>

      {stats && stats.length > 0 && (
        <View style={[styles.stats, { borderColor: CARD.line }]}>
          {stats.map((s) => (
            <View key={s.label} style={styles.stat}>
              <Text variant="headline" tabular color={CARD.text} numberOfLines={1} adjustsFontSizeToFit>
                {s.value}
              </Text>
              <Text variant="caption" color={CARD.tertiary} numberOfLines={1}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text variant="caption" color={CARD.tertiary} align="center" style={{ marginTop: SPACE.md }}>
        {footnote ?? 'Build the body you want.'}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: CARD.background, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: CARD.line },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: SPACE.xl },
  stats: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: SPACE.md },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
});
