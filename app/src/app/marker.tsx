import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useQuery } from '../core/db/useQuery';
import { useTheme } from '../core/theme/ThemeProvider';
import { SPACE } from '../core/theme/typography';
import { relativeDay } from '../lib/dates';
import { deleteMarker, formatMarker, markerHistory, MARKERS, markerName, type Marker, type MarkerKind } from '../modules/health/repo';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';

function Trend({ series, width, color, color2 }: { series: { a: number; b: number | null }[]; width: number; color: string; color2: string }) {
  const h = 120;
  if (series.length < 2) return null;
  const values = series.flatMap((p) => (p.b != null ? [p.a, p.b] : [p.a]));
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const x = (i: number) => 8 + (i / (series.length - 1)) * (width - 16);
  const y = (v: number) => h - 8 - ((v - min) / span) * (h - 16);
  const path = (pick: (p: { a: number; b: number | null }) => number | null) =>
    series
      .map((p, i) => [i, pick(p)] as const)
      .filter(([, v]) => v != null)
      .map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v!).toFixed(1)}`)
      .join(' ');
  const last = series[series.length - 1];
  return (
    <Svg width={width} height={h}>
      <Path d={path((p) => p.a)} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {series.some((p) => p.b != null) && <Path d={path((p) => p.b)} stroke={color2} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />}
      <Circle cx={x(series.length - 1)} cy={y(last.a)} r={4} fill={color} />
    </Svg>
  );
}

export default function MarkerDetail() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { kind, label } = useLocalSearchParams<{ kind: MarkerKind; label?: string }>();
  const rows = useQuery(['health_markers'], () => markerHistory(kind, label || null), [kind, label]);
  const def = MARKERS.find((m) => m.kind === kind);
  const title = markerName({ kind, label: label || null });
  const unit = rows[0]?.unit ?? def?.unit ?? '';

  const confirmDelete = (m: Marker) =>
    Alert.alert('Delete entry?', `${formatMarker(m)} ${unit} on ${relativeDay(m.dateKey)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMarker(m.id) },
    ]);

  return (
    <Screen
      title={title}
      back
      accessory={
        def?.watchOnly ? undefined : (
          <Button title="Log" icon="plus" size="sm" variant="tinted" full={false} onPress={() => router.push({ pathname: '/log-marker', params: { kind, label: label ?? '' } })} />
        )
      }
    >
      {rows.length >= 2 && (
        <Card index={0}>
          <Trend
            series={[...rows].reverse().map((r) => ({ a: r.value, b: r.value2 }))}
            width={width - SPACE.lg * 2 - SPACE.lg * 2}
            color={colors.accent}
            color2={colors.text}
          />
          {kind === 'bp' && (
            <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.sm }}>
              Red is systolic, the other line is diastolic.
            </Text>
          )}
        </Card>
      )}

      <Card index={1} padded={false} style={{ marginTop: SPACE.md }}>
        {rows.length === 0 ? (
          <View style={{ padding: SPACE.lg }}>
            <Text variant="subhead" tone="secondary">
              No entries yet.
            </Text>
          </View>
        ) : (
          rows.map((m, i) => {
            const note = def?.check?.(m.value, m.value2) ?? null;
            return (
              <View key={m.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{relativeDay(m.dateKey)}</Text>
                  {note ? (
                    <Text variant="caption" tone="warning">
                      {note}
                    </Text>
                  ) : m.origin ? (
                    <Text variant="caption" tone="tertiary">
                      {m.origin}
                    </Text>
                  ) : null}
                </View>
                <Text variant="headline" tabular>
                  {formatMarker(m)}
                  <Text variant="footnote" tone="secondary">{` ${unit}`}</Text>
                </Text>
                <PressableScale feedback="selection" hitSlop={8} onPress={() => confirmDelete(m)}>
                  <Icon name="trash" size={17} color={colors.textTertiary} />
                </PressableScale>
              </View>
            );
          })
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
});
