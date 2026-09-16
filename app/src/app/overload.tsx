import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useQuery } from '../core/db/useQuery';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { addDays, dateKey, relativeDay } from '../lib/dates';
import { weightUnit } from '../lib/units';
import type { OverloadStatus } from '../lib/workoutEnergy';
import { formatWeight, useUnits } from '../modules/workouts/components';
import { getExercise, overloadSummary, type ExerciseOverload } from '../modules/workouts/repo';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Text } from '../ui/Text';

type Range = '4' | '8' | '26';

const LABEL: Record<OverloadStatus, string> = { progressing: 'Progressing', holding: 'Holding', slipping: 'Slipping', new: 'New' };

function Spark({ values, color }: { values: number[]; color: string }) {
  const w = 72;
  const h = 28;
  if (values.length < 2) return <View style={{ width: w, height: h }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 6) + 3, h - 3 - ((v - min) / span) * (h - 6)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <Svg width={w} height={h}>
      <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={last[0]} cy={last[1]} r={3} fill={color} />
    </Svg>
  );
}

export default function Overload() {
  const { colors } = useTheme();
  const router = useRouter();
  const units = useUnits();
  const [range, setRange] = useState<Range>('8');
  const since = addDays(dateKey(), -Number(range) * 7);
  const rows = useQuery(['workouts', 'workout_sets', 'workout_exercises'], () => overloadSummary(since), [since]);

  const tone: Record<OverloadStatus, string> = { progressing: colors.success, holding: colors.textSecondary, slipping: colors.warning, new: colors.textTertiary };
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {} as Record<OverloadStatus, number>);

  const row = (r: ExerciseOverload, i: number) => {
    const ex = getExercise(r.exerciseId);
    const arrow = r.status === 'progressing' ? '↑' : r.status === 'slipping' ? '↓' : '';
    return (
      <PressableScale
        key={r.exerciseId}
        scaleTo={0.99}
        onPress={() => router.push({ pathname: '/exercise', params: { id: r.exerciseId } })}
        style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" numberOfLines={1}>
            {ex.name}
          </Text>
          <Text variant="caption" tone="tertiary">{`${r.sessions} ${r.sessions === 1 ? 'session' : 'sessions'} · last ${relativeDay(r.lastDate)}`}</Text>
        </View>
        <Spark values={r.series} color={tone[r.status]} />
        <View style={{ alignItems: 'flex-end', minWidth: 92 }}>
          <Text variant="subhead" weight="semibold" tabular>{`${formatWeight(Math.round(r.current * 2) / 2, units)} ${weightUnit(units)}`}</Text>
          <Text variant="caption" tabular color={tone[r.status]}>
            {r.changePct != null ? `${arrow} ${r.changePct > 0 ? '+' : ''}${r.changePct.toFixed(1)}%` : LABEL[r.status]}
          </Text>
        </View>
      </PressableScale>
    );
  };

  return (
    <Screen title="Overload" back>
      <Text variant="subhead" tone="secondary" style={{ marginBottom: SPACE.md }}>
        Your estimated 1-rep max for each lift, compared with your previous sessions. Keep the arrows pointing up.
      </Text>
      <SegmentedControl<Range>
        value={range}
        onChange={setRange}
        segments={[
          { value: '4', label: '4 weeks' },
          { value: '8', label: '8 weeks' },
          { value: '26', label: '6 months' },
        ]}
      />

      <View style={styles.summary}>
        {(['progressing', 'holding', 'slipping'] as OverloadStatus[]).map((s) => (
          <Card key={s} style={styles.summaryCell}>
            <Text variant="title1" tabular color={tone[s]}>
              {counts[s] ?? 0}
            </Text>
            <Text variant="caption" tone="secondary">
              {LABEL[s]}
            </Text>
          </Card>
        ))}
      </View>

      {rows.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.xxl }}>
          <Icon name="trophy" size={28} color={colors.textTertiary} />
          <Text variant="headline">No lifts in this period</Text>
          <Text variant="subhead" tone="secondary" align="center">
            Log a couple of workouts to start tracking progress.
          </Text>
        </Card>
      ) : (
        <Card padded={false} style={{ borderRadius: RADIUS.xl }}>
          {rows.map(row)}
        </Card>
      )}
      {(counts.slipping ?? 0) > 0 && (
        <Text variant="footnote" tone="secondary" style={{ marginTop: SPACE.md, paddingHorizontal: SPACE.sm }}>
          Slipping lifts on a cut are common. Keep the weight heavy, trim a set, and prioritise sleep and protein.
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', gap: SPACE.sm, marginVertical: SPACE.md },
  summaryCell: { flex: 1, alignItems: 'center', paddingVertical: SPACE.md, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
});
