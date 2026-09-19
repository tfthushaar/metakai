import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useQuery } from '../core/db/useQuery';
import { useFeature, useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { addDays, dateKey, relativeDay } from '../lib/dates';
import { hoursLabel } from '../lib/recoveryScore';
import type { MarkerKind } from '../modules/health/repo';
import { readinessFor, RECOVERY_TABLES } from '../modules/recovery/repo';
import { metricSummaries, sleepNightsBetween, type MetricSummary, type StoredNight } from '../modules/wearables/repo';
import { syncWatch, useWatchSync } from '../modules/wearables/sync';
import { Button } from '../ui/Button';
import { Card, SectionHeader } from '../ui/Card';
import { Icon, type IconName } from '../ui/Icon';
import { ListGroup, ListRow } from '../ui/List';
import { PressableScale } from '../ui/PressableScale';
import { Ring } from '../ui/Ring';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';

type TileKind = Extract<MarkerKind, 'steps' | 'active_kcal' | 'rhr' | 'hrv' | 'vo2max' | 'spo2' | 'resp'>;

const TILES: { kind: TileKind; label: string; unit: string; icon: IconName }[] = [
  { kind: 'steps', label: 'Steps', unit: '', icon: 'footprints' },
  { kind: 'active_kcal', label: 'Active calories', unit: 'kcal', icon: 'flame' },
  { kind: 'rhr', label: 'Resting heart rate', unit: 'bpm', icon: 'heart' },
  { kind: 'hrv', label: 'HRV', unit: 'ms', icon: 'activity' },
  { kind: 'vo2max', label: 'VO2 max', unit: 'ml/kg/min', icon: 'zap' },
  { kind: 'spo2', label: 'Blood oxygen', unit: '%', icon: 'droplet' },
  { kind: 'resp', label: 'Breathing rate', unit: 'br/min', icon: 'wind' },
];

const format = (kind: TileKind, v: number) => (kind === 'steps' || kind === 'active_kcal' ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 10) / 10));
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '–');

/** How the latest reading compares with the usual, in words. */
function versus(tile: (typeof TILES)[number], s: MetricSummary, today: string): string | null {
  if (!s.latest || s.normal == null) return null;
  const diff = s.latest.value - s.normal;
  if (tile.kind === 'steps' || tile.kind === 'active_kcal') {
    // Today's total is still growing, so it isn't compared with whole days.
    if (s.latest.dateKey === today) return 'So far today';
    const pct = Math.round((diff / s.normal) * 100);
    return Math.abs(pct) < 5 ? 'About usual' : `${Math.abs(pct)}% ${pct > 0 ? 'above' : 'below'} usual`;
  }
  const d = tile.kind === 'rhr' || tile.kind === 'hrv' ? Math.round(Math.abs(diff)) : Math.round(Math.abs(diff) * 10) / 10;
  if (d < (tile.kind === 'hrv' ? 3 : 1)) return 'Around your normal';
  return `${d}${tile.unit === '%' ? '%' : ` ${tile.unit}`} ${diff > 0 ? 'above' : 'below'} your normal`;
}

function MiniBars({ values, color, empty }: { values: (number | null)[]; color: string; empty: string }) {
  const present = values.filter((v): v is number => v != null);
  const max = Math.max(...present, 0);
  const min = Math.min(...present, max);
  return (
    <View style={styles.bars}>
      {values.map((v, i) => {
        // Scale between the week's low and high so small day-to-day changes still show.
        const h = v == null ? 0.08 : max === min ? 0.6 : 0.25 + (0.75 * (v - min)) / (max - min);
        return <View key={i} style={[styles.bar, { height: `${h * 100}%`, backgroundColor: v == null ? empty : color, opacity: i === values.length - 1 ? 1 : 0.55 }]} />;
      })}
    </View>
  );
}

function Tile({ tile, summary, onPress }: { tile: (typeof TILES)[number]; summary: MetricSummary; onPress: () => void }) {
  const { colors } = useTheme();
  const latest = summary.latest!;
  const today = dateKey();
  const note = versus(tile, summary, today);
  const stale = latest.dateKey < addDays(today, -1);
  return (
    <PressableScale scaleTo={0.97} onPress={onPress} style={[styles.tile, { backgroundColor: colors.surface }]} accessibilityLabel={`${tile.label} ${format(tile.kind, latest.value)} ${tile.unit}`}>
      <View style={styles.tileHead}>
        <Icon name={tile.icon} size={15} color={colors.textSecondary} />
        <Text variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
          {tile.label}
        </Text>
      </View>
      <Text variant="title2" tabular numberOfLines={1} adjustsFontSizeToFit>
        {format(tile.kind, latest.value)}
        {tile.unit ? <Text variant="footnote" tone="secondary">{` ${tile.unit}`}</Text> : null}
      </Text>
      <Text variant="caption" tone="tertiary" numberOfLines={1}>
        {stale ? relativeDay(latest.dateKey) : (note ?? relativeDay(latest.dateKey))}
      </Text>
      <MiniBars values={summary.week} color={colors.accent} empty={colors.fill} />
    </PressableScale>
  );
}

function StageBar({ night }: { night: StoredNight }) {
  const { colors } = useTheme();
  const stages = [
    { label: 'Deep', min: night.deepMin ?? 0, color: colors.accent },
    { label: 'REM', min: night.remMin ?? 0, color: colors.accent2 },
    { label: 'Light', min: night.lightMin ?? 0, color: colors.accentSoft },
    { label: 'Awake', min: night.awakeMin ?? 0, color: colors.textSecondary },
  ];
  const total = stages.reduce((a, s) => a + s.min, 0) || 1;
  return (
    <View style={{ gap: SPACE.sm }}>
      <View style={[styles.stageBar, { backgroundColor: colors.fill }]}>
        {stages.map((s) => (s.min > 0 ? <View key={s.label} style={{ flex: s.min / total, backgroundColor: s.color }} /> : null))}
      </View>
      <View style={styles.legend}>
        {stages.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text variant="caption" tone="secondary" tabular>{`${s.label} ${hoursLabel(s.min / 60)}`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Everything the watch knows, at a glance: readiness, last night's sleep and each daily reading. */
export default function Overview() {
  const router = useRouter();
  const { colors } = useTheme();
  const today = dateKey();
  const recoveryOn = useFeature('recovery');
  const connected = useSettings((s) => s.watch.health);
  const sync = useWatchSync();
  const ready = useQuery([...RECOVERY_TABLES], () => readinessFor(today), [today]);
  const nights = useQuery(['sleep_nights'], () => sleepNightsBetween(addDays(today, -6), today), [today]);
  const metrics = useQuery(['health_markers'], () => metricSummaries(TILES.map((t) => t.kind), today), [today]);

  const night = nights[nights.length - 1] ?? null;
  const tiles = TILES.filter((t) => metrics[t.kind].latest != null);
  const avgSleep = nights.length >= 3 ? nights.reduce((a, n) => a + n.asleepMin, 0) / nights.length / 60 : null;
  const sources = [...new Set([night?.origin, ...tiles.map((t) => metrics[t.kind].latest?.origin)].filter((o): o is string => !!o))];
  const bandColor = !ready ? colors.textTertiary : ready.band === 'high' ? colors.success : ready.band === 'moderate' ? colors.warning : colors.danger;

  if (!night && tiles.length === 0) {
    return (
      <Screen title="Overview" back>
        <Card index={0} style={{ gap: SPACE.md }}>
          <Text variant="headline">{connected ? 'Nothing from your watch yet' : 'Connect your watch'}</Text>
          <Text variant="subhead" tone="secondary">
            Sleep with its stages, resting heart rate, HRV, steps, VO2 max, blood oxygen and breathing rate show up here, side by side, from every watch and app you use.
          </Text>
          <Button title={connected ? 'Sync now' : 'Set up watches'} icon="watch" onPress={() => (connected ? syncWatch() : router.push('/settings/devices'))} loading={sync.syncing} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Overview" subtitle={sources.length ? `From ${sources.join(', ')}` : undefined} back>
      {ready && (
        <Card index={0} onPress={recoveryOn ? () => router.push('/recovery') : undefined}>
          <View style={styles.hero}>
            <Ring size={72} stroke={8} progress={ready.score / 100} color={bandColor}>
              <Text variant="title3" tabular>
                {ready.score}
              </Text>
            </Ring>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="footnote" tone="secondary">
                READINESS
              </Text>
              <Text variant="headline" color={bandColor}>
                {ready.band === 'high' ? 'Ready to push' : ready.band === 'moderate' ? 'Train smart' : 'Take it easy'}
              </Text>
              <Text variant="footnote" tone="secondary" numberOfLines={2}>
                {ready.flags.length ? ready.flags.join(' · ') : ready.factors.map((f) => f.label).join(', ')}
              </Text>
            </View>
            {recoveryOn && <Icon name="chevronRight" size={18} color={colors.textTertiary} />}
          </View>
        </Card>
      )}

      {night && (
        <>
          <SectionHeader title="Sleep" />
          <Card index={1} style={{ gap: SPACE.md }}>
            <View style={styles.sleepHead}>
              <View style={{ flex: 1 }}>
                <Text variant="footnote" tone="secondary">
                  {night.dateKey === today ? 'Last night' : relativeDay(night.dateKey)}
                </Text>
                <Text variant="title1" tabular>
                  {hoursLabel(night.asleepMin / 60)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="footnote" tone="secondary" tabular>{`${clock(night.bedStart)} – ${clock(night.bedEnd)}`}</Text>
                {avgSleep != null && (
                  <Text variant="footnote" tone="secondary" tabular>{`${hoursLabel(avgSleep)} average`}</Text>
                )}
              </View>
            </View>
            {night.deepMin != null ? (
              <StageBar night={night} />
            ) : (
              <Text variant="caption" tone="tertiary">
                {night.origin ? `${night.origin} doesn’t share sleep stages.` : 'No sleep stages for this night.'}
              </Text>
            )}
          </Card>
        </>
      )}

      {tiles.length > 0 && (
        <>
          <SectionHeader title="Today" />
          <View style={styles.grid}>
            {Array.from({ length: Math.ceil(tiles.length / 2) }, (_, row) => (
              <View key={row} style={styles.gridRow}>
                {tiles.slice(row * 2, row * 2 + 2).map((t) => (
                  <Tile key={t.kind} tile={t} summary={metrics[t.kind]} onPress={() => router.push({ pathname: '/marker', params: { kind: t.kind } })} />
                ))}
                {tiles.length % 2 === 1 && row === Math.floor(tiles.length / 2) && <View style={styles.tile} />}
              </View>
            ))}
          </View>
        </>
      )}

      <ListGroup footer="Each night and each day’s reading comes from one app, so two watches never add up or blend. Choose which app to prefer in Watches.">
        <ListRow icon="watch" title="Watches" subtitle={sync.syncing ? 'Syncing…' : undefined} onPress={() => router.push('/settings/devices')} />
      </ListGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  sleepHead: { flexDirection: 'row', alignItems: 'flex-end' },
  stageBar: { flexDirection: 'row', height: 12, borderRadius: RADIUS.pill, overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: SPACE.md, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  grid: { gap: SPACE.sm },
  gridRow: { flexDirection: 'row', gap: SPACE.sm },
  tile: { flex: 1, borderRadius: RADIUS.lg, padding: SPACE.md, gap: 2 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 26, marginTop: SPACE.sm },
  bar: { flex: 1, borderRadius: 2 },
});
