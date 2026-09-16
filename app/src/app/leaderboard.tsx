import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useSettings } from '../core/store/settings';
import { useTheme } from '../core/theme/ThemeProvider';
import { RADIUS, SPACE } from '../core/theme/typography';
import { durationLabel } from '../lib/geo';
import { RANK_GROUP_LABEL, RANK_GROUPS, RUN_DISTANCES, tierFor } from '../lib/ranks';
import { FILTER_LABEL, getBoard, type Board, type BoardFilter } from '../modules/leaderboards/api';
import { flag } from '../modules/leaderboards/countries';
import { TierBadge } from '../modules/ranks/components';
import { Button } from '../ui/Button';
import { Card, SectionHeader } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Screen } from '../ui/Screen';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Text } from '../ui/Text';

type Pass = 'physique' | 'run';

const PHYSIQUE_BOARDS = [{ id: 'physique', label: 'Overall' }, ...RANK_GROUPS.map((g) => ({ id: `group:${g}`, label: RANK_GROUP_LABEL[g] }))];
const RUN_BOARDS = [{ id: 'run', label: 'Overall' }, ...RUN_DISTANCES.map((d) => ({ id: `run:${d.id}`, label: d.label }))];
const FILTERS: BoardFilter[] = ['all', 'sex', 'age', 'weight', 'height', 'country', 'friends'];

function valueLabel(board: string, score: number, value: number | null): string {
  if (board.startsWith('run:') && value != null) return `${durationLabel(value)} · ${score.toFixed(0)}%`;
  if (board.startsWith('group:') && value != null) return `${value.toFixed(1)}×`;
  return `${Math.round(score)}`;
}

export default function Leaderboard() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ board?: string }>();
  const lb = useSettings((s) => s.leaderboard);
  const [pass, setPass] = useState<Pass>(params.board?.startsWith('run') ? 'run' : 'physique');
  const [board, setBoard] = useState(params.board ?? 'physique');
  const [filter, setFilter] = useState<BoardFilter>('all');
  const [data, setData] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getBoard(board, filter));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the leaderboard.');
    } finally {
      setLoading(false);
    }
  }, [board, filter]);

  useEffect(() => {
    if (lb.joined) load();
  }, [lb.joined, load]);

  if (!lb.joined) {
    return (
      <Screen title="Leaderboards" back>
        <Card>
          <Text variant="headline">See where you stand</Text>
          <Text variant="subhead" tone="secondary" style={{ marginTop: 4 }}>
            Compare your ranks with other Metakai users by sex, age, weight class, height, country or just your friends.
          </Text>
          <View style={{ marginTop: SPACE.lg }}>
            <Button title="Join leaderboards" onPress={() => router.push('/leaderboard-join')} />
          </View>
        </Card>
      </Screen>
    );
  }

  const boards = pass === 'physique' ? PHYSIQUE_BOARDS : RUN_BOARDS;
  const maxBin = Math.max(1, ...(data?.histogram ?? [1]));
  const myBin = data?.me ? Math.min(9, Math.floor(data.me.score / 10)) : -1;

  return (
    <Screen
      title="Leaderboards"
      back
      accessory={
        <PressableScale feedback="selection" onPress={() => router.push('/leaderboard-account')} style={[styles.round, { backgroundColor: colors.fill }]}>
          <Icon name="user" size={17} color={colors.text} />
        </PressableScale>
      }
    >
      <SegmentedControl<Pass>
        value={pass}
        onChange={(p) => {
          setPass(p);
          setBoard(p === 'physique' ? 'physique' : 'run');
        }}
        segments={[
          { value: 'physique', label: 'Physique' },
          { value: 'run', label: 'Running' },
        ]}
      />
      <View style={[styles.chips, { marginTop: SPACE.md }]}>
        {boards.map((b) => (
          <Chip key={b.id} label={b.label} selected={board === b.id} onPress={() => setBoard(b.id)} />
        ))}
      </View>

      <SectionHeader title="Compare with" />
      <View style={styles.chips}>
        {FILTERS.map((f) => (
          <Chip key={f} label={FILTER_LABEL[f]} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>

      {error ? (
        <Card style={{ marginTop: SPACE.lg }}>
          <Text variant="subhead" tone="secondary">
            {error}
          </Text>
          <View style={{ marginTop: SPACE.md }}>
            <Button title="Try again" size="md" variant="gray" onPress={load} />
          </View>
        </Card>
      ) : !data ? (
        <ActivityIndicator style={{ marginTop: SPACE.xxl }} color={colors.textSecondary} />
      ) : (
        <Animated.View entering={FadeIn.duration(200)} key={`${board}-${filter}`}>
          <Card style={{ marginTop: SPACE.lg }}>
            {data.me ? (
              <View style={styles.meRow}>
                <TierBadge tier={tierFor(data.me.score)} size={56} />
                <View style={{ flex: 1 }}>
                  <Text variant="footnote" tone="secondary">
                    YOUR RANK
                  </Text>
                  <Text variant="title1" tabular>{`#${data.me.rank ?? '—'} of ${data.total.toLocaleString('en-US')}`}</Text>
                  <Text variant="subhead" tone="secondary">
                    {data.total > 1 ? `Ahead of ${Math.round(data.me.percentile)}% · ${valueLabel(board, data.me.score, data.me.value)}` : 'You’re the first here. Invite friends to compare.'}
                  </Text>
                  {data.me.held && (
                    <Text variant="caption" tone="warning">
                      Your latest jump is being checked and will show to others soon.
                    </Text>
                  )}
                </View>
              </View>
            ) : (
              <Text variant="subhead" tone="secondary">
                {board === 'run'
                  ? 'Record a GPS run of 1 km or more to appear here.'
                  : board.startsWith('run:')
                    ? 'Record a GPS run at this distance to appear here.'
                    : board === 'physique'
                      ? 'Log a key lift in at least 3 workouts to appear here.'
                      : 'Log one of this group’s key lifts in at least 3 workouts to appear here.'}
              </Text>
            )}
            <View style={styles.histo}>
              {data.histogram.map((n, i) => (
                <View key={i} style={styles.histoCol}>
                  <View style={styles.histoTrack}>
                    <View
                      style={{
                        height: `${Math.max(3, (n / maxBin) * 100)}%`,
                        borderRadius: 4,
                        backgroundColor: i === myBin ? colors.accent : tierFor(i * 10 + 5).color,
                        opacity: i === myBin ? 1 : 0.45,
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.histoLabels}>
              <Text variant="caption" tone="tertiary">
                Iron
              </Text>
              <Text variant="caption" tone="tertiary">
                Champion
              </Text>
            </View>
          </Card>

          <SectionHeader title="Top 100" />
          <Card padded={false}>
            {data.top.length === 0 ? (
              <View style={{ padding: SPACE.lg }}>
                <Text variant="subhead" tone="secondary">
                  {filter === 'friends' ? 'Add friends with their code to compare.' : 'No one here yet.'}
                </Text>
              </View>
            ) : (
              data.top.map((e, i) => (
                <View
                  key={`${e.rank}-${e.name}`}
                  style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }, e.me && { backgroundColor: colors.accentSoft }]}
                >
                  <Text variant="headline" tabular tone={e.rank <= 3 ? 'accent' : 'secondary'} style={{ width: 36 }}>
                    {e.rank}
                  </Text>
                  <TierBadge tier={tierFor(e.score)} size={28} />
                  <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                    {`${flag(e.country)} ${e.name}`.trim()}
                  </Text>
                  <Text variant="subhead" weight="semibold" tabular>
                    {valueLabel(board, e.score, e.value)}
                  </Text>
                </View>
              ))
            )}
          </Card>
          <View style={{ marginTop: SPACE.lg }}>
            <Button title={loading ? 'Refreshing…' : 'Refresh'} variant="gray" size="md" icon="refresh" onPress={load} disabled={loading} />
          </View>
          <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.md, paddingHorizontal: SPACE.lg }}>
            Scores update a few times a day. Running boards only include GPS-recorded runs and rank by age grade (the % next to each time), so every age and sex compares fairly. Unusually large jumps are checked for a week before others see them.
          </Text>
        </Animated.View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  round: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  meRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  histo: { flexDirection: 'row', gap: 4, height: 70, marginTop: SPACE.lg },
  histoCol: { flex: 1 },
  histoTrack: { flex: 1, justifyContent: 'flex-end' },
  histoLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderRadius: RADIUS.sm },
});
